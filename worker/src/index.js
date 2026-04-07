import { EmailMessage } from "cloudflare:email";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8"
};

const DEFAULT_CACHE_TTL_SECONDS = 21600;
const DEFAULT_ARCHIVE_CACHE_TTL_SECONDS = 900;
const DEFAULT_ARCHIVE_PAGE_SIZE = 6;
const MAX_ARCHIVE_PAGE_SIZE = 24;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const DEFAULT_LEAD_NOTIFICATION_EMAIL = "infoeco411@gmail.com";
const DEFAULT_LEAD_NOTIFICATION_FROM_EMAIL = "alerts@ecosystemsca.net";
const DEFAULT_LEAD_NOTIFICATION_FROM_NAME = "ECO Systems Lead Alerts";
const DEFAULT_LEAD_NOTIFICATION_SUBJECT_PREFIX = "LA Roof Estimate";
const CAL_WEBHOOK_SIGNATURE_HEADER = "x-cal-signature-256";
const GOOGLE_SHEETS_APPOINTMENT_STATUS_COLUMN_HEADERS = ["Appointment Scheduled?", "Appointment Completed?"];
const META_GRAPH_API_VERSION = "v22.0";
const META_DEFAULT_PIXEL_ID = "1093337934791191";
const META_LEAD_EVENT_NAME = "Lead";
const META_SCHEDULE_EVENT_NAME = "Schedule";
const META_ACTION_SOURCE = "website";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(env)
      });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true }, 200, env);
    }

    if (request.method === "GET" && url.pathname === "/api/reviews/archive") {
      return handleReviewArchive(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/reviews/archive/meta") {
      return handleReviewArchiveMeta(env);
    }

    if (request.method === "GET" && url.pathname === "/api/reviews") {
      return handleReviews(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/admin/reviews/sync") {
      return handleAdminReviewSync(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/admin/reviews/sync-status") {
      return handleAdminReviewSyncStatus(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/cal/booking-status") {
      return handleCalBookingStatus(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/cal/webhook") {
      return handleCalWebhook(request, env, ctx);
    }

    if (request.method === "POST" && url.pathname === "/api/lead") {
      return handleLead(request, env, ctx);
    }

    return json({ ok: false, message: "Not found." }, 404, env);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduledArchiveSync(env, controller));
  }
};

async function handleLead(request, env, ctx) {
  const body = await parseJson(request);
  if (!body) {
    return json({ ok: false, message: "Invalid JSON payload." }, 400, env);
  }

  if ((body.website || "").trim()) {
    return json({ ok: true, message: "Thanks. We will be in touch." }, 200, env);
  }

  const lead = normalizeLead(body, request);
  const errors = validateLead(lead);
  if (errors.length) {
    return json({ ok: false, message: errors[0] }, 400, env);
  }

  const turnstileVerification = await verifyTurnstileSubmission(body, request, env);
  if (!turnstileVerification.ok) {
    return json(
      {
        ok: false,
        message: turnstileVerification.message
      },
      turnstileVerification.status,
      env
    );
  }

  let outcome = "success";
  let jobNimbusStatus = 0;
  let upstreamMessage = "Lead submitted successfully.";
  let upstreamResponseText = "";
  let jobNimbusContact = null;

  try {
    const response = await submitToJobNimbus(lead, env);
    jobNimbusStatus = response.status;
    upstreamResponseText = await response.text();
    jobNimbusContact = extractJobNimbusContact(upstreamResponseText);

    if (!response.ok) {
      outcome = "failed";
      upstreamMessage = `JobNimbus rejected the request with status ${response.status}.`;
      console.error("JobNimbus upstream rejection", {
        status: response.status,
        body: upstreamResponseText
      });
    }
  } catch (error) {
    outcome = "failed";
    upstreamMessage = error instanceof Error ? error.message : "JobNimbus request failed.";
    console.error("JobNimbus request exception", error);
  }

  if (outcome === "success" && jobNimbusContact) {
    try {
      await upsertJobNimbusContactLink(env, lead, jobNimbusContact);
    } catch (error) {
      console.error("JobNimbus contact-link persistence failed", error);
    }
  }

  try {
    await logLeadToGoogleSheets(lead, env, {
      outcome,
      jobNimbusStatus,
      upstreamMessage,
      upstreamResponseText
    });
  } catch (error) {
    console.error("Google Sheets logging failed", error);
  }

  try {
    await sendLeadNotificationEmail(lead, env, {
      outcome,
      jobNimbusStatus,
      upstreamMessage,
      upstreamResponseText
    });
  } catch (error) {
    console.error("Lead email notification failed", error);
  }

  if (outcome === "failed") {
    return json(
      {
        ok: false,
        message: "We could not submit your request right now. Please call or text 310-340-7777."
      },
      502,
      env
    );
  }

  dispatchBackgroundWork(ctx, sendMetaLeadEvent(lead, env), "Meta lead event failed");

  return json(
    {
      ok: true,
      message: "Thank you. ECO Systems will review your request and reach out shortly."
    },
    200,
    env
  );
}

async function handleCalWebhook(request, env, ctx) {
  if (!env.REVIEWS_DB) {
    return json({ ok: false, message: "Webhook storage is not configured." }, 503, env);
  }

  const secret = clean(env.CAL_COM_WEBHOOK_SECRET);
  if (!secret) {
    return json({ ok: false, message: "Cal.com webhook secret is not configured." }, 503, env);
  }

  const rawBody = await request.text();
  if (!rawBody) {
    return json({ ok: false, message: "Webhook payload is required." }, 400, env);
  }

  const signature = clean(request.headers.get(CAL_WEBHOOK_SIGNATURE_HEADER));
  const verified = await verifyCalWebhookSignature(rawBody, signature, secret);
  if (!verified) {
    return json({ ok: false, message: "Webhook signature verification failed." }, 401, env);
  }

  let body = null;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, message: "Invalid webhook JSON payload." }, 400, env);
  }

  const booking = normalizeCalWebhookBooking(body);
  if (!booking.triggerEvent) {
    return json({ ok: false, message: "Webhook trigger event is required." }, 400, env);
  }

  if (!booking.bookingUid) {
    return json({ ok: true, ignored: true, message: "Webhook payload did not include a booking uid." }, 200, env);
  }

  await upsertCalBookingConfirmation(env, booking);

  try {
    await updateAppointmentScheduledInGoogleSheets(booking, env);
  } catch (error) {
    console.error("Google Sheets appointment update failed", {
      bookingUid: booking.bookingUid,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  if (isConfirmedCalBookingStatus(booking.bookingStatus)) {
    try {
      await syncBookingTaskToJobNimbus(booking, env);
    } catch (error) {
      console.error("JobNimbus booking task sync failed", {
        bookingUid: booking.bookingUid,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (isConfirmedCalBookingStatus(booking.bookingStatus)) {
    dispatchBackgroundWork(ctx, sendMetaScheduleEvent(booking, env), "Meta schedule event failed");
  }

  return json(
    {
      ok: true,
      message: "Cal.com webhook accepted.",
      triggerEvent: booking.triggerEvent,
      bookingUid: booking.bookingUid
    },
    200,
    env
  );
}

async function handleCalBookingStatus(request, env) {
  if (!env.REVIEWS_DB) {
    return json({ ok: false, message: "Webhook storage is not configured." }, 503, env);
  }

  const url = new URL(request.url);
  const email = normalizeEmailAddress(url.searchParams.get("email"));
  const after = normalizeTimestamp(url.searchParams.get("after")) || "1970-01-01T00:00:00.000Z";

  if (!email) {
    return json({ ok: false, message: "Booking email is required." }, 400, env);
  }

  const result = await env.REVIEWS_DB.prepare(
    `SELECT
      booking_uid,
      trigger_event,
      booking_status,
      event_type_slug,
      event_title,
      organizer_name,
      organizer_email,
      booker_name,
      booker_email,
      booker_phone,
      property_address,
      location,
      start_time,
      end_time,
      webhook_created_at,
      booking_created_at,
      updated_at
    FROM cal_booking_confirmations
    WHERE booker_email = ?
      AND webhook_created_at >= ?
    ORDER BY webhook_created_at DESC
    LIMIT 1`
  )
    .bind(email, after)
    .first();

  if (!result) {
    return json({ ok: true, booking: { confirmed: false } }, 200, env);
  }

  return json(
    {
      ok: true,
      booking: {
        confirmed: isConfirmedCalBookingStatus(result.booking_status),
        bookingUid: result.booking_uid,
        triggerEvent: result.trigger_event,
        status: result.booking_status,
        eventTypeSlug: result.event_type_slug,
        eventTitle: result.event_title,
        organizerName: result.organizer_name,
        organizerEmail: result.organizer_email,
        name: result.booker_name,
        email: result.booker_email,
        phone: result.booker_phone,
        propertyAddress: result.property_address,
        location: result.location,
        startTime: result.start_time,
        endTime: result.end_time,
        webhookCreatedAt: result.webhook_created_at,
        bookingCreatedAt: result.booking_created_at,
        updatedAt: result.updated_at
      }
    },
    200,
    env
  );
}

async function handleReviews(request, env) {
  const cache = caches.default;
  const cacheKey = new Request(request.url, request);
  const cached = await cache.match(cacheKey);

  if (cached) {
    return withCors(cached, env);
  }

  const placeId = env.GOOGLE_PLACE_ID;
  const apiKey = env.GOOGLE_PLACES_API_KEY;

  if (!placeId || !apiKey) {
    return json(
      {
        ok: false,
        message: "Google Places is not configured."
      },
      500,
      env
    );
  }

  const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "displayName,rating,userRatingCount,reviews,googleMapsUri"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    return json(
      {
        ok: false,
        message: "Unable to load Google reviews.",
        detail: text
      },
      502,
      env
    );
  }

  const place = await response.json();
  const payload = {
    ok: true,
    source: "google-places-featured",
    businessName: env.GOOGLE_BUSINESS_NAME || place.displayName?.text || "ECO Systems",
    rating: place.rating || null,
    reviewCount: place.userRatingCount || 0,
    sourceUrl: env.GOOGLE_REVIEWS_URL || place.googleMapsUri || null,
    alternateSourceUrl: env.GOOGLE_REVIEWS_ALTERNATE_URL || null,
    reviews: normalizePlacesReviews(place.reviews || [], env)
  };

  const ttl = Number(env.CACHE_TTL_SECONDS || DEFAULT_CACHE_TTL_SECONDS);
  const responseToCache = new Response(JSON.stringify(payload), {
    headers: {
      ...JSON_HEADERS,
      ...corsHeaders(env),
      "Cache-Control": `public, max-age=${ttl}`
    }
  });

  await cache.put(cacheKey, responseToCache.clone());
  return responseToCache;
}

async function handleReviewArchive(request, env) {
  if (!env.REVIEWS_DB) {
    return json(
      {
        ok: false,
        message: "Review archive storage is not configured."
      },
      503,
      env
    );
  }

  const url = new URL(request.url);
  const page = positiveInteger(url.searchParams.get("page"), 1);
  const pageSize = clampPositiveInteger(
    url.searchParams.get("pageSize"),
    DEFAULT_ARCHIVE_PAGE_SIZE,
    MAX_ARCHIVE_PAGE_SIZE
  );

  const cache = caches.default;
  const cacheKey = new Request(request.url, request);
  const cached = await cache.match(cacheKey);

  if (cached) {
    return withCors(cached, env);
  }

  const meta = await getArchiveMeta(env);
  if (!meta.reviewCount) {
    return json(
      {
        ok: false,
        message: "Review archive is empty."
      },
      404,
      env
    );
  }

  const offset = (page - 1) * pageSize;
  const result = await env.REVIEWS_DB.prepare(
    `SELECT
      review_id,
      google_resource_name,
      author_name,
      author_photo_url,
      is_anonymous,
      star_rating,
      comment,
      create_time,
      update_time,
      source_url,
      owner_reply_comment,
      owner_reply_update_time
    FROM google_review_archive
    WHERE is_active = 1
    ORDER BY COALESCE(update_time, create_time) DESC, review_id DESC
    LIMIT ? OFFSET ?`
  )
    .bind(pageSize, offset)
    .all();

  const reviews = (result.results || []).map((row) => normalizeArchivedReviewRow(row, env));
  const payload = {
    ok: true,
    source: "google-business-profile-archive",
    businessName: env.GOOGLE_BUSINESS_NAME || "ECO Systems",
    rating: meta.rating,
    reviewCount: meta.reviewCount,
    lastSyncAt: meta.lastSyncAt,
    page,
    pageSize,
    hasMore: offset + reviews.length < meta.reviewCount,
    sourceUrl: env.GOOGLE_REVIEWS_URL || null,
    reviews
  };

  const ttl = Number(env.REVIEW_ARCHIVE_CACHE_TTL_SECONDS || DEFAULT_ARCHIVE_CACHE_TTL_SECONDS);
  const responseToCache = new Response(JSON.stringify(payload), {
    headers: {
      ...JSON_HEADERS,
      ...corsHeaders(env),
      "Cache-Control": `public, max-age=${ttl}`
    }
  });

  await cache.put(cacheKey, responseToCache.clone());
  return responseToCache;
}

async function handleReviewArchiveMeta(env) {
  if (!env.REVIEWS_DB) {
    return json(
      {
        ok: false,
        message: "Review archive storage is not configured."
      },
      503,
      env
    );
  }

  const meta = await getArchiveMeta(env);
  return json(
    {
      ok: true,
      source: "google-business-profile-archive",
      businessName: env.GOOGLE_BUSINESS_NAME || "ECO Systems",
      rating: meta.rating,
      reviewCount: meta.reviewCount,
      lastSyncAt: meta.lastSyncAt,
      sourceUrl: env.GOOGLE_REVIEWS_URL || null
    },
    200,
    env
  );
}

async function handleAdminReviewSync(request, env) {
  const authError = requireAdminAuth(request, env);
  if (authError) {
    return authError;
  }

  try {
    const result = await syncGoogleBusinessProfileReviews(env);
    return json({ ok: true, ...result }, 200, env);
  } catch (error) {
    console.error("Review archive sync failed", error);
    return json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Review archive sync failed."
      },
      500,
      env
    );
  }
}

async function handleAdminReviewSyncStatus(request, env) {
  const authError = requireAdminAuth(request, env);
  if (authError) {
    return authError;
  }

  if (!env.REVIEWS_DB) {
    return json(
      {
        ok: false,
        message: "Review archive storage is not configured."
      },
      503,
      env
    );
  }

  const latestRun = await env.REVIEWS_DB.prepare(
    `SELECT id, started_at, finished_at, status, imported_count, inserted_count, updated_count, error_message
    FROM google_review_sync_runs
    ORDER BY id DESC
    LIMIT 1`
  ).first();

  return json(
    {
      ok: true,
      latestRun: latestRun || null,
      archive: await getArchiveMeta(env)
    },
    200,
    env
  );
}

async function runScheduledArchiveSync(env, controller) {
  if (!env.REVIEWS_DB || !hasGoogleBusinessSyncConfig(env)) {
    console.log("Skipping scheduled review archive sync because D1 or Google Business Profile config is missing.");
    return;
  }

  try {
    await syncGoogleBusinessProfileReviews(env);
  } catch (error) {
    console.error("Scheduled review archive sync failed", {
      cron: controller?.cron,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function syncGoogleBusinessProfileReviews(env) {
  ensureArchiveDependencies(env);

  const startedAt = new Date().toISOString();
  const syncRunId = await createSyncRun(env, startedAt);

  let nextPageToken = "";
  let importedCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  let totalReviewCount = 0;
  let averageRating = null;

  try {
    const accessToken = await getGoogleBusinessAccessToken(env);
    const accountId = await resolveGoogleBusinessAccountId(env, accessToken);

    do {
      const page = await fetchGoogleBusinessProfileReviewsPage(env, accessToken, accountId, nextPageToken);
      totalReviewCount = Number(page.totalReviewCount || totalReviewCount || 0);
      averageRating = page.averageRating ?? averageRating;

      for (const review of page.reviews || []) {
        const normalizedReview = normalizeGoogleBusinessProfileReview(review, env, accountId);
        const outcome = await upsertArchivedReview(env, normalizedReview, startedAt);

        importedCount += 1;
        insertedCount += outcome.inserted;
        updatedCount += outcome.updated;
      }

      nextPageToken = page.nextPageToken || "";
    } while (nextPageToken);

    await env.REVIEWS_DB.prepare(
      `UPDATE google_review_archive
      SET is_active = 0
      WHERE account_id = ? AND location_id = ? AND synced_at <> ?`
    )
      .bind(accountId, env.GOOGLE_BUSINESS_LOCATION_ID, startedAt)
      .run();

    await finalizeSyncRun(env, syncRunId, {
      finishedAt: new Date().toISOString(),
      status: "success",
      importedCount,
      insertedCount,
      updatedCount,
      errorMessage: null
    });

    return {
      imported: importedCount,
      inserted: insertedCount,
      updated: updatedCount,
      totalReviewCount,
      averageRating,
      lastSyncAt: startedAt
    };
  } catch (error) {
    await finalizeSyncRun(env, syncRunId, {
      finishedAt: new Date().toISOString(),
      status: "failed",
      importedCount,
      insertedCount,
      updatedCount,
      errorMessage: error instanceof Error ? error.message : String(error)
    });

    throw error;
  }
}

async function fetchGoogleBusinessProfileReviewsPage(env, accessToken, accountId, pageToken = "") {
  const url = new URL(
    `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${env.GOOGLE_BUSINESS_LOCATION_ID}/reviews`
  );
  url.searchParams.set("pageSize", "50");
  url.searchParams.set("orderBy", "updateTime desc");

  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Business Profile review sync failed with status ${response.status}: ${detail}`);
  }

  return response.json();
}

async function resolveGoogleBusinessAccountId(env, accessToken) {
  if (env.GOOGLE_BUSINESS_ACCOUNT_ID) {
    return env.GOOGLE_BUSINESS_ACCOUNT_ID;
  }

  const response = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Google Business Profile account discovery failed. Set GOOGLE_BUSINESS_ACCOUNT_ID explicitly or enable account-management API access for this project. ${detail}`
    );
  }

  const payload = await response.json();
  const accountName = payload.accounts?.[0]?.name || "";
  const accountId = accountName.replace(/^accounts\//, "");

  if (!accountId) {
    throw new Error(
      "Google Business Profile account discovery returned no accounts. Confirm the OAuth user has access to the business profile or set GOOGLE_BUSINESS_ACCOUNT_ID explicitly."
    );
  }

  return accountId;
}

async function getGoogleBusinessAccessToken(env) {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: env.GOOGLE_BUSINESS_CLIENT_ID,
      client_secret: env.GOOGLE_BUSINESS_CLIENT_SECRET,
      refresh_token: env.GOOGLE_BUSINESS_REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  });

  if (!tokenResponse.ok) {
    const detail = await tokenResponse.text();
    throw new Error(`Google Business Profile OAuth refresh failed: ${detail}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

function normalizeGoogleBusinessProfileReview(review, env, accountId) {
  return {
    reviewId: review.reviewId || extractReviewId(review.name),
    googleResourceName: review.name || "",
    accountId,
    locationId: env.GOOGLE_BUSINESS_LOCATION_ID,
    authorName: review.reviewer?.displayName || "Google Reviewer",
    authorPhotoUrl: review.reviewer?.profilePhotoUrl || "",
    isAnonymous: Boolean(review.reviewer?.isAnonymous),
    rating: mapStarRating(review.starRating),
    comment: review.comment || "",
    createTime: review.createTime || new Date().toISOString(),
    updateTime: review.updateTime || review.createTime || new Date().toISOString(),
    sourceUrl: env.GOOGLE_REVIEWS_URL || "",
    ownerReplyComment: review.reviewReply?.comment || "",
    ownerReplyUpdateTime: review.reviewReply?.updateTime || "",
    rawPayloadJson: JSON.stringify(review)
  };
}

async function upsertArchivedReview(env, review, syncedAt) {
  const existing = await env.REVIEWS_DB.prepare(
    `SELECT review_id FROM google_review_archive WHERE review_id = ?`
  )
    .bind(review.reviewId)
    .first();

  await env.REVIEWS_DB.prepare(
    `INSERT INTO google_review_archive (
      review_id,
      google_resource_name,
      account_id,
      location_id,
      author_name,
      author_photo_url,
      is_anonymous,
      star_rating,
      comment,
      create_time,
      update_time,
      source_url,
      owner_reply_comment,
      owner_reply_update_time,
      raw_payload_json,
      is_active,
      synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(review_id) DO UPDATE SET
      google_resource_name = excluded.google_resource_name,
      account_id = excluded.account_id,
      location_id = excluded.location_id,
      author_name = excluded.author_name,
      author_photo_url = excluded.author_photo_url,
      is_anonymous = excluded.is_anonymous,
      star_rating = excluded.star_rating,
      comment = excluded.comment,
      create_time = excluded.create_time,
      update_time = excluded.update_time,
      source_url = excluded.source_url,
      owner_reply_comment = excluded.owner_reply_comment,
      owner_reply_update_time = excluded.owner_reply_update_time,
      raw_payload_json = excluded.raw_payload_json,
      is_active = 1,
      synced_at = excluded.synced_at`
  )
    .bind(
      review.reviewId,
      review.googleResourceName,
      review.accountId,
      review.authorName,
      review.authorPhotoUrl,
      review.isAnonymous ? 1 : 0,
      review.rating,
      review.comment,
      review.createTime,
      review.updateTime,
      review.ownerReplyUpdateTime,
      review.rawPayloadJson,
      syncedAt
    )
    .run();

  return {
    inserted: existing ? 0 : 1,
    updated: existing ? 1 : 0
  };
}

async function getArchiveMeta(env) {
  const aggregate = await env.REVIEWS_DB.prepare(
    `SELECT COUNT(*) AS review_count, ROUND(AVG(star_rating), 2) AS average_rating, MAX(synced_at) AS last_sync_at
    FROM google_review_archive
    WHERE is_active = 1`
  ).first();

  return {
    reviewCount: Number(aggregate?.review_count || 0),
    rating:
      aggregate?.average_rating !== null && aggregate?.average_rating !== undefined
        ? Number(aggregate.average_rating)
        : null,
    lastSyncAt: aggregate?.last_sync_at || null
  };
}

async function createSyncRun(env, startedAt) {
  const result = await env.REVIEWS_DB.prepare(
    `INSERT INTO google_review_sync_runs (
      started_at,
      status,
      imported_count,
      inserted_count,
      updated_count
    ) VALUES (?, 'running', 0, 0, 0)`
  )
    .bind(startedAt)
    .run();

  const insertedId = Number(result?.meta?.last_row_id || 0);
  if (insertedId > 0) {
    return insertedId;
  }

  const latestRun = await env.REVIEWS_DB.prepare(
    `SELECT id FROM google_review_sync_runs ORDER BY id DESC LIMIT 1`
  ).first();

  return Number(latestRun?.id || 0);
}

async function finalizeSyncRun(env, syncRunId, details) {
  await env.REVIEWS_DB.prepare(
    `UPDATE google_review_sync_runs
    SET finished_at = ?,
        status = ?,
        imported_count = ?,
        inserted_count = ?,
        updated_count = ?,
        error_message = ?
    WHERE id = ?`
  )
    .bind(
      details.finishedAt,
      details.status,
      details.importedCount,
      details.insertedCount,
      details.updatedCount,
      details.errorMessage,
      syncRunId
    )
    .run();
}

function requireAdminAuth(request, env) {
  const adminToken = env.REVIEW_ARCHIVE_ADMIN_TOKEN || env.ADMIN_SYNC_TOKEN || "";

  if (!adminToken) {
    return json(
      {
        ok: false,
        message: "Review archive admin token is not configured. This is an internal app secret, not a Google token."
      },
      503,
      env
    );
  }

  const headerToken =
    request.headers.get("x-admin-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  if (headerToken !== adminToken) {
    return json(
      {
        ok: false,
        message: "Unauthorized."
      },
      401,
      env
    );
  }

  return null;
}

function ensureArchiveDependencies(env) {
  if (!env.REVIEWS_DB) {
    throw new Error("Review archive D1 binding is not configured.");
  }

  if (!hasGoogleBusinessSyncConfig(env)) {
    throw new Error(
      "Google Business Profile archive sync requires GOOGLE_BUSINESS_CLIENT_ID, GOOGLE_BUSINESS_CLIENT_SECRET, GOOGLE_BUSINESS_REFRESH_TOKEN, and GOOGLE_BUSINESS_LOCATION_ID. GOOGLE_BUSINESS_ACCOUNT_ID is optional when account discovery is enabled for the project."
    );
  }
}

function hasGoogleBusinessSyncConfig(env) {
  return Boolean(
    env.GOOGLE_BUSINESS_CLIENT_ID &&
      env.GOOGLE_BUSINESS_CLIENT_SECRET &&
      env.GOOGLE_BUSINESS_REFRESH_TOKEN &&
      env.GOOGLE_BUSINESS_LOCATION_ID
  );
}

async function submitToJobNimbus(lead, env) {
  if (!env.JOBNIMBUS_API_KEY) {
    throw new Error("Missing JobNimbus API key.");
  }

  const baseUrl = (env.JOBNIMBUS_API_BASE_URL || "https://app.jobnimbus.com").replace(/\/$/, "");
  const resourcePath = (env.JOBNIMBUS_RESOURCE_PATH || "api1/contacts").replace(/^\/+/, "");
  const url = `${baseUrl}/${resourcePath}`;
  const payload = buildJobNimbusPayload(lead, env);

  let response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.JOBNIMBUS_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const initialBody = shouldInspectDuplicate(resourcePath, response) ? await response.clone().text() : "";

  if (shouldRetryDuplicateContact(resourcePath, response, initialBody)) {
    const retryPayload = buildDuplicateSafePayload(payload, lead);

    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.JOBNIMBUS_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(retryPayload)
    });

    response = cloneResponseWithContext(response, initialBody);
  }

  return response;
}

function shouldInspectDuplicate(resourcePath, response) {
  return resourcePath.toLowerCase() === "api1/contacts" && response.status === 400;
}

function shouldRetryDuplicateContact(resourcePath, response, responseBody) {
  return (
    resourcePath.toLowerCase() === "api1/contacts" &&
    response.status === 400 &&
    responseBody.toLowerCase().includes("duplicate contact exists")
  );
}

function buildDuplicateSafePayload(payload, lead) {
  const suffix =
    (lead.property.address || "").trim() ||
    (lead.contact.phone || "").slice(-4) ||
    Date.now().toString();

  return {
    ...payload,
    display_name: `${payload.display_name} - ${suffix}`.trim()
  };
}

function cloneResponseWithContext(response, originalBody) {
  const headers = new Headers(response.headers);
  headers.set("x-copilot-original-upstream-body", originalBody.slice(0, 500));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function extractJobNimbusContact(responseText) {
  if (!responseText) {
    return null;
  }

  try {
    const parsed = JSON.parse(responseText);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (!clean(parsed.jnid)) {
      return null;
    }

    return {
      jnid: clean(parsed.jnid),
      customerJnid: clean(parsed.customer),
      number: clean(parsed.number),
      displayName: clean(parsed.display_name || parsed.name),
      email: normalizeEmailAddress(parsed.email),
      address: clean(parsed.address_line1 || parsed.address?.street1),
      city: clean(parsed.city || parsed.address?.city),
      state: clean(parsed.state_text || parsed.address?.state),
      zip: clean(parsed.zip || parsed.address?.zip)
    };
  } catch {
    return null;
  }
}

async function upsertJobNimbusContactLink(env, lead, contact) {
  if (!env.REVIEWS_DB || !clean(contact?.jnid)) {
    return;
  }

  const leadEmail = normalizeEmailAddress(lead.contact?.email);
  if (!leadEmail) {
    return;
  }

  const now = new Date().toISOString();
  const propertyAddress = clean(lead.property?.fullAddress || buildFullAddress(lead.property));

  await env.REVIEWS_DB.prepare(
    `INSERT INTO jobnimbus_contact_links (
      lead_email,
      property_address,
      customer_jnid,
      contact_jnid,
      contact_number,
      contact_display_name,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(lead_email, contact_jnid) DO UPDATE SET
      property_address = excluded.property_address,
      customer_jnid = excluded.customer_jnid,
      contact_number = excluded.contact_number,
      contact_display_name = excluded.contact_display_name,
      updated_at = excluded.updated_at`
  )
    .bind(leadEmail, propertyAddress, contact.customerJnid, contact.jnid, contact.number, contact.displayName, now, now)
    .run();
}

async function syncBookingTaskToJobNimbus(booking, env) {
  if (!env.JOBNIMBUS_API_KEY) {
    return;
  }

  const preparedRecord = await prepareJobNimbusBookingTaskRecord(env, booking);
  if (!preparedRecord.shouldSend) {
    return;
  }

  const contact = await resolveJobNimbusContactForBooking(booking, env);
  if (!contact?.jnid || !contact.customerJnid) {
    if (preparedRecord.rowId) {
      await finalizeJobNimbusBookingTaskRecord(env, preparedRecord.rowId, {
        contactJnid: "",
        taskJnid: "",
        deliveryStatus: "failed",
        responseStatus: 0,
        responseBody: "No matching JobNimbus contact/customer record found for booking email."
      });
    }
    return;
  }

  const response = await postJobNimbusBookingTask(contact, booking, env);
  const responseText = await response.text();
  const createdTask = extractJobNimbusTask(responseText);

  if (preparedRecord.rowId) {
    await finalizeJobNimbusBookingTaskRecord(env, preparedRecord.rowId, {
      contactJnid: contact.jnid,
      taskJnid: createdTask?.jnid || "",
      deliveryStatus: response.ok ? "success" : "failed",
      responseStatus: response.status,
      responseBody: truncateText(responseText, 2000)
    });
  }

  if (!response.ok) {
    throw new Error(`JobNimbus booking task request failed with status ${response.status}: ${truncateText(responseText, 2000)}`);
  }
}

async function prepareJobNimbusBookingTaskRecord(env, booking) {
  if (!env.REVIEWS_DB) {
    return {
      shouldSend: true,
      rowId: 0
    };
  }

  const existing = await env.REVIEWS_DB.prepare(
    `SELECT id, delivery_status
    FROM jobnimbus_booking_tasks
    WHERE booking_uid = ?
    LIMIT 1`
  )
    .bind(booking.bookingUid)
    .first();

  if (existing?.delivery_status === "success") {
    return {
      shouldSend: false,
      rowId: Number(existing.id || 0)
    };
  }

  const now = new Date().toISOString();

  if (existing?.id) {
    await env.REVIEWS_DB.prepare(
      `UPDATE jobnimbus_booking_tasks
      SET booking_status = ?,
          contact_jnid = NULL,
          task_jnid = NULL,
          delivery_status = 'pending',
          response_status = NULL,
          response_body = NULL,
          updated_at = ?
      WHERE id = ?`
    )
      .bind(booking.bookingStatus, now, existing.id)
      .run();

    return {
      shouldSend: true,
      rowId: Number(existing.id || 0)
    };
  }

  const result = await env.REVIEWS_DB.prepare(
    `INSERT INTO jobnimbus_booking_tasks (
      booking_uid,
      booking_status,
      delivery_status,
      created_at,
      updated_at
    ) VALUES (?, ?, 'pending', ?, ?)`
  )
    .bind(booking.bookingUid, booking.bookingStatus, now, now)
    .run();

  return {
    shouldSend: true,
    rowId: Number(result?.meta?.last_row_id || 0)
  };
}

async function finalizeJobNimbusBookingTaskRecord(env, rowId, details) {
  if (!env.REVIEWS_DB || !rowId) {
    return;
  }

  await env.REVIEWS_DB.prepare(
    `UPDATE jobnimbus_booking_tasks
    SET contact_jnid = ?,
        task_jnid = ?,
        delivery_status = ?,
        response_status = ?,
        response_body = ?,
        updated_at = ?
    WHERE id = ?`
  )
    .bind(
      details.contactJnid,
      details.taskJnid,
      details.deliveryStatus,
      details.responseStatus,
      details.responseBody,
      new Date().toISOString(),
      rowId
    )
    .run();
}

async function resolveJobNimbusContactForBooking(booking, env) {
  const storedContact = await findStoredJobNimbusContactLink(booking, env);
  if (storedContact?.jnid && storedContact.customerJnid) {
    return storedContact;
  }

  const contact = await findJobNimbusContactByEmail(booking, env);
  if (contact?.jnid && env.REVIEWS_DB) {
    const pseudoLead = {
      contact: { email: booking.bookerEmail },
      property: {
        fullAddress: booking.propertyAddress,
        address: booking.propertyAddress,
        city: "",
        state: "",
        zip: ""
      }
    };
    await upsertJobNimbusContactLink(env, pseudoLead, contact);
  }

  return contact;
}

async function findStoredJobNimbusContactLink(booking, env) {
  if (!env.REVIEWS_DB || !booking.bookerEmail) {
    return null;
  }

  const rows = await env.REVIEWS_DB.prepare(
    `SELECT contact_jnid, customer_jnid, contact_number, contact_display_name, property_address
    FROM jobnimbus_contact_links
    WHERE lead_email = ?
    ORDER BY updated_at DESC
    LIMIT 10`
  )
    .bind(booking.bookerEmail)
    .all();

  const candidates = Array.isArray(rows?.results) ? rows.results : [];
  if (!candidates.length) {
    return null;
  }

  const matched = candidates.find((candidate) =>
    booking.propertyAddress && doAddressesLikelyMatch(booking.propertyAddress, candidate.property_address)
  );
  const selected = matched || candidates[0];

  return selected
    ? {
        jnid: clean(selected.contact_jnid),
        customerJnid: clean(selected.customer_jnid),
        number: clean(selected.contact_number),
        displayName: clean(selected.contact_display_name)
      }
    : null;
}

async function findJobNimbusContactByEmail(booking, env) {
  if (!booking.bookerEmail || !env.JOBNIMBUS_API_KEY) {
    return null;
  }

  const baseUrl = (env.JOBNIMBUS_API_BASE_URL || "https://app.jobnimbus.com").replace(/\/$/, "");
  const lookupUrl = new URL(`${baseUrl}/api1/contacts`);
  lookupUrl.searchParams.set("size", "10");
  lookupUrl.searchParams.set("email", booking.bookerEmail);

  const response = await fetch(lookupUrl.toString(), {
    headers: {
      Authorization: `Bearer ${env.JOBNIMBUS_API_KEY}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`JobNimbus contact lookup failed with status ${response.status}: ${truncateText(detail, 2000)}`);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    return null;
  }

  const candidates = Array.isArray(payload?.results) ? payload.results : [];
  if (!candidates.length) {
    return null;
  }

  const matched = candidates.find((candidate) =>
    booking.propertyAddress &&
    (doAddressesLikelyMatch(booking.propertyAddress, candidate.address_line1) ||
      doAddressesLikelyMatch(booking.propertyAddress, buildJobNimbusCandidateAddress(candidate)))
  );

  const selected = matched || candidates[0];
  return selected
    ? {
        jnid: clean(selected.jnid),
        customerJnid: clean(selected.customer),
        number: clean(selected.number),
        displayName: clean(selected.display_name),
        email: normalizeEmailAddress(selected.email),
        address: clean(selected.address_line1),
        city: clean(selected.city),
        state: clean(selected.state_text),
        zip: clean(selected.zip)
      }
    : null;
}

function buildJobNimbusCandidateAddress(candidate) {
  return [clean(candidate.address_line1), clean(candidate.city), clean(candidate.state_text), clean(candidate.zip)]
    .filter(Boolean)
    .join(", ");
}

async function postJobNimbusBookingTask(contact, booking, env) {
  const baseUrl = (env.JOBNIMBUS_API_BASE_URL || "https://app.jobnimbus.com").replace(/\/$/, "");
  const url = `${baseUrl}/api1/tasks`;
  const payload = buildJobNimbusBookingTaskPayload(contact, booking, env);

  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.JOBNIMBUS_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

function buildJobNimbusBookingTaskPayload(contact, booking, env) {
  const descriptionLines = [
    `Cal.com appointment ${booking.bookingStatus}.`,
    booking.eventTitle ? `Event: ${booking.eventTitle}` : null,
    booking.startTime ? `Start: ${booking.startTime}` : null,
    booking.endTime ? `End: ${booking.endTime}` : null,
    booking.propertyAddress ? `Property address: ${booking.propertyAddress}` : null,
    booking.bookerName ? `Booked by: ${booking.bookerName}` : null,
    booking.bookerEmail ? `Email: ${booking.bookerEmail}` : null,
    booking.bookerPhone ? `Phone: ${booking.bookerPhone}` : null,
    booking.bookingUid ? `Cal.com booking uid: ${booking.bookingUid}` : null
  ].filter(Boolean);

  const title = clean(env.JOBNIMBUS_BOOKING_TASK_TITLE) || "Initial Appointment";
  const recordTypeName = clean(env.JOBNIMBUS_BOOKING_TASK_TYPE) || "Initial Appointment";
  const dateStart = toUnixTimestamp(booking.startTime || booking.bookingCreatedAt || booking.webhookCreatedAt);
  const dateEnd = booking.endTime ? toUnixTimestamp(booking.endTime) : 0;

  const linkedContact = {
    id: contact.jnid,
    type: "contact",
    name: contact.displayName || booking.bookerName || booking.bookerEmail || "Booked contact"
  };

  if (contact.number) {
    linkedContact.number = contact.number;
  }

  const payload = {
    title,
    customer: contact.customerJnid,
    date_start: dateStart,
    all_day: false,
    record_type_name: recordTypeName,
    related: [linkedContact],
    description: descriptionLines.join("\n")
  };

  if (dateEnd > dateStart) {
    payload.date_end = dateEnd;
  }

  return payload;
}

function extractJobNimbusTask(responseText) {
  if (!responseText) {
    return null;
  }

  try {
    const parsed = JSON.parse(responseText);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      jnid: clean(parsed.jnid),
      title: clean(parsed.title),
      recordTypeName: clean(parsed.record_type_name)
    };
  } catch {
    return null;
  }
}

function dispatchBackgroundWork(ctx, promise, label) {
  if (!promise || typeof promise.then !== "function") {
    return;
  }

  const guardedPromise = promise.catch((error) => {
    console.error(label, error);
  });

  if (ctx?.waitUntil) {
    ctx.waitUntil(guardedPromise);
    return;
  }

  return guardedPromise;
}

async function sendMetaLeadEvent(lead, env) {
  if (!hasMetaConversionsConfig(env)) {
    return;
  }

  const eventId = clean(lead.tracking.leadEventId) || `lead-${crypto.randomUUID()}`;
  const requestBody = {
    data: [
      {
        event_name: META_LEAD_EVENT_NAME,
        event_time: toUnixTimestamp(lead.meta.submittedAt),
        event_id: eventId,
        action_source: META_ACTION_SOURCE,
        event_source_url: clean(lead.meta.pageUrl) || buildSiteUrl(env, "/"),
        user_data: await buildMetaUserData({
          email: lead.contact.email,
          phone: lead.contact.phone,
          city: lead.property.city,
          state: lead.property.state,
          zip: lead.property.zip,
          country: "US",
          fbc: lead.tracking.fbc,
          fbp: lead.tracking.fbp,
          clientIpAddress: lead.meta.ipAddress,
          clientUserAgent: lead.meta.userAgent
        }),
        custom_data: {
          content_name: "Flat Roof Lead",
          currency: "USD",
          value: 1
        }
      }
    ]
  };

  await postMetaConversionsEvent(env, requestBody, {
    sourceType: "lead",
    sourceKey: eventId,
    eventName: META_LEAD_EVENT_NAME,
    metaEventId: eventId
  });
}

async function sendMetaScheduleEvent(booking, env) {
  if (!hasMetaConversionsConfig(env)) {
    return;
  }

  const eventId = `${booking.bookingUid}:schedule`;
  const requestBody = {
    data: [
      {
        event_name: META_SCHEDULE_EVENT_NAME,
        event_time: toUnixTimestamp(booking.bookingCreatedAt || booking.webhookCreatedAt),
        event_id: eventId,
        action_source: META_ACTION_SOURCE,
        event_source_url: buildSiteUrl(env, "/schedule.html"),
        user_data: await buildMetaUserData({
          email: booking.bookerEmail,
          phone: booking.bookerPhone,
          country: "US"
        }),
        custom_data: {
          content_name: "Roof Inspection Scheduled"
        }
      }
    ]
  };

  await postMetaConversionsEvent(env, requestBody, {
    sourceType: "booking",
    sourceKey: booking.bookingUid,
    eventName: META_SCHEDULE_EVENT_NAME,
    metaEventId: eventId
  });
}

function hasMetaConversionsConfig(env) {
  return Boolean(clean(env.META_CONVERSIONS_API_TOKEN) && clean(env.META_PIXEL_ID || META_DEFAULT_PIXEL_ID));
}

async function postMetaConversionsEvent(env, requestBody, eventRecord) {
  const preparedRecord = await prepareMetaConversionEventRecord(env, eventRecord);

  if (!preparedRecord.shouldSend) {
    return;
  }

  const pixelId = clean(env.META_PIXEL_ID || META_DEFAULT_PIXEL_ID);
  const accessToken = clean(env.META_CONVERSIONS_API_TOKEN);
  const url = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${pixelId}/events`;
  const payload = {
    ...requestBody,
    access_token: accessToken
  };

  if (clean(env.META_TEST_EVENT_CODE)) {
    payload.test_event_code = clean(env.META_TEST_EVENT_CODE);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();

  if (preparedRecord.rowId) {
    await finalizeMetaConversionEventRecord(env, preparedRecord.rowId, {
      deliveryStatus: response.ok ? "success" : "failed",
      responseStatus: response.status,
      responseBody: truncateText(responseText, 2000)
    });
  }

  if (!response.ok) {
    throw new Error(`Meta Conversions API request failed with status ${response.status}: ${truncateText(responseText, 2000)}`);
  }

  console.log("Meta conversion event sent", {
    eventName: eventRecord.eventName,
    sourceType: eventRecord.sourceType,
    sourceKey: eventRecord.sourceKey,
    responseStatus: response.status
  });
}

async function prepareMetaConversionEventRecord(env, eventRecord) {
  if (!env.REVIEWS_DB) {
    return {
      shouldSend: true,
      rowId: 0
    };
  }

  const existing = await env.REVIEWS_DB.prepare(
    `SELECT id, delivery_status
    FROM meta_conversion_events
    WHERE source_type = ? AND source_key = ? AND event_name = ?
    LIMIT 1`
  )
    .bind(eventRecord.sourceType, eventRecord.sourceKey, eventRecord.eventName)
    .first();

  if (existing?.delivery_status === "success") {
    return {
      shouldSend: false,
      rowId: Number(existing.id || 0)
    };
  }

  const now = new Date().toISOString();

  if (existing?.id) {
    await env.REVIEWS_DB.prepare(
      `UPDATE meta_conversion_events
      SET meta_event_id = ?,
          delivery_status = 'pending',
          response_status = NULL,
          response_body = NULL,
          updated_at = ?
      WHERE id = ?`
    )
      .bind(eventRecord.metaEventId, now, existing.id)
      .run();

    return {
      shouldSend: true,
      rowId: Number(existing.id || 0)
    };
  }

  const result = await env.REVIEWS_DB.prepare(
    `INSERT INTO meta_conversion_events (
      source_type,
      source_key,
      event_name,
      meta_event_id,
      delivery_status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, 'pending', ?, ?)`
  )
    .bind(eventRecord.sourceType, eventRecord.sourceKey, eventRecord.eventName, eventRecord.metaEventId, now, now)
    .run();

  return {
    shouldSend: true,
    rowId: Number(result?.meta?.last_row_id || 0)
  };
}

async function finalizeMetaConversionEventRecord(env, rowId, details) {
  if (!env.REVIEWS_DB || !rowId) {
    return;
  }

  await env.REVIEWS_DB.prepare(
    `UPDATE meta_conversion_events
    SET delivery_status = ?,
        response_status = ?,
        response_body = ?,
        updated_at = ?
    WHERE id = ?`
  )
    .bind(details.deliveryStatus, details.responseStatus, details.responseBody, new Date().toISOString(), rowId)
    .run();
}

async function buildMetaUserData(details) {
  const userData = {
    client_ip_address: clean(details.clientIpAddress),
    client_user_agent: clean(details.clientUserAgent),
    fbc: clean(details.fbc),
    fbp: clean(details.fbp)
  };
  const hashedEmail = await hashMetaValue(normalizeEmailAddress(details.email));
  const hashedPhone = await hashMetaValue(normalizePhoneForMeta(details.phone));
  const hashedCity = await hashMetaValue(normalizeMetaText(details.city));
  const hashedState = await hashMetaValue(normalizeMetaText(details.state));
  const hashedZip = await hashMetaValue(normalizeMetaZip(details.zip));
  const hashedCountry = await hashMetaValue(normalizeMetaCountry(details.country));

  if (hashedEmail) {
    userData.em = [hashedEmail];
  }

  if (hashedPhone) {
    userData.ph = [hashedPhone];
  }

  if (hashedCity) {
    userData.ct = [hashedCity];
  }

  if (hashedState) {
    userData.st = [hashedState];
  }

  if (hashedZip) {
    userData.zp = [hashedZip];
  }

  if (hashedCountry) {
    userData.country = [hashedCountry];
  }

  return Object.fromEntries(
    Object.entries(userData).filter(([, value]) => Boolean(value && (!Array.isArray(value) || value.length)))
  );
}

async function hashMetaValue(value) {
  const normalizedValue = clean(value);

  if (!normalizedValue) {
    return "";
  }

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizedValue));
  return bytesToHex(new Uint8Array(digest));
}

function normalizePhoneForMeta(value) {
  const digits = String(value || "").replace(/\D+/g, "");

  if (!digits) {
    return "";
  }

  if (digits.length === 10) {
    return `1${digits}`;
  }

  return digits;
}

function normalizeMetaText(value) {
  return clean(value).toLowerCase();
}

function normalizeMetaZip(value) {
  return String(value || "").replace(/\D+/g, "");
}

function normalizeMetaCountry(value) {
  return clean(value).toLowerCase();
}

function toUnixTimestamp(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : Math.floor(Date.now() / 1000);
}

function buildSiteUrl(env, pathName = "/") {
  const siteOrigin = clean(env.SITE_ORIGIN || "https://ecosystemsca.net");
  const normalizedOrigin = siteOrigin.endsWith("/") ? siteOrigin.slice(0, -1) : siteOrigin;
  const normalizedPath = pathName.startsWith("/") ? pathName : `/${pathName}`;

  return `${normalizedOrigin}${normalizedPath}`;
}

function buildJobNimbusPayload(lead, env) {
  const resourcePath = (env.JOBNIMBUS_RESOURCE_PATH || "api1/contacts").toLowerCase();

  if (resourcePath === "api1/contacts") {
    return buildLegacyContactPayload(lead, env);
  }

  return buildPlatformPayload(lead, env);
}

function buildLegacyContactPayload(lead, env) {
  const fullName = lead.contact.fullName || `${lead.contact.firstName} ${lead.contact.lastName}`.trim();
  const fullAddress = lead.property.fullAddress || buildFullAddress(lead.property);
  const notes = [
    `Lead source: ${env.JOBNIMBUS_SOURCE || "Facebook Flat Roof Landing"}`,
    `Property address: ${fullAddress || "Unknown"}`,
    `County answer: ${lead.property.county || "Unknown"}`,
    `Property type: ${lead.survey.propertyType || "Unknown"}`,
    `Issue: ${lead.survey.issue || "Unknown"}`,
    `Timeline: ${lead.survey.timeline || "Unknown"}`,
    `Roof notes: ${lead.survey.roofCondition || "None"}`,
    `UTM source: ${lead.tracking.utmSource || ""}`,
    `UTM campaign: ${lead.tracking.utmCampaign || ""}`,
    `FBCLID: ${lead.tracking.fbclid || ""}`,
    `Page URL: ${lead.meta.pageUrl || ""}`
  ].join("\n");

  return {
    display_name: fullName,
    first_name: lead.contact.firstName,
    last_name: lead.contact.lastName,
    email: lead.contact.email,
    phone: lead.contact.phone,
    mobile_phone: lead.contact.phone,
    address_line1: lead.property.address,
    city: lead.property.city,
    state_text: lead.property.state,
    zip: lead.property.zip,
    country_name: "United States",
    company: env.JOBNIMBUS_SOURCE || "Facebook Flat Roof Landing",
    description: notes,
    is_archived: false,
    is_active: true,
    status_name: env.JOBNIMBUS_STATUS_NAME || "New"
  };
}

function buildPlatformPayload(lead, env) {
  const fullName = lead.contact.fullName || `${lead.contact.firstName} ${lead.contact.lastName}`.trim();
  const fullAddress = lead.property.fullAddress || buildFullAddress(lead.property);
  const notes = [
    `Lead source: ${env.JOBNIMBUS_SOURCE || "Facebook Flat Roof Landing"}`,
    `Property address: ${fullAddress || "Unknown"}`,
    `County answer: ${lead.property.county || "Unknown"}`,
    `Property type: ${lead.survey.propertyType || "Unknown"}`,
    `Issue: ${lead.survey.issue || "Unknown"}`,
    `Timeline: ${lead.survey.timeline || "Unknown"}`,
    `Roof notes: ${lead.survey.roofCondition || "None"}`,
    `UTM source: ${lead.tracking.utmSource || ""}`,
    `UTM campaign: ${lead.tracking.utmCampaign || ""}`,
    `FBCLID: ${lead.tracking.fbclid || ""}`,
    `Page URL: ${lead.meta.pageUrl || ""}`
  ].join("\n");

  return {
    recordType: env.JOBNIMBUS_RECORD_TYPE || "lead",
    source: env.JOBNIMBUS_SOURCE || "Facebook Flat Roof Landing",
    name: fullName,
    firstName: lead.contact.firstName,
    lastName: lead.contact.lastName,
    email: lead.contact.email,
    phone: lead.contact.phone,
    mobilePhone: lead.contact.phone,
    address: {
      street1: lead.property.address,
      city: lead.property.city,
      state: lead.property.state,
      zip: lead.property.zip,
      county: lead.property.county
    },
    notes,
    custom: {
      propertyType: lead.survey.propertyType,
      issue: lead.survey.issue,
      timeline: lead.survey.timeline,
      roofCondition: lead.survey.roofCondition,
      tracking: lead.tracking
    }
  };
}

async function logLeadToGoogleSheets(lead, env, result) {
  if (!env.GOOGLE_SHEETS_CLIENT_EMAIL || !env.GOOGLE_SHEETS_PRIVATE_KEY || !env.GOOGLE_SHEETS_SPREADSHEET_ID) {
    throw new Error("Google Sheets fallback logging requires a service-account client email, private key, and spreadsheet ID.");
  }

  const accessToken = await getGoogleAccessToken(env);
  const sheetName = env.GOOGLE_SHEETS_SHEET_NAME || "Lead Log";
  const range = encodeURIComponent(`${sheetName}!A1`);
  const values = [
    [
      new Date().toISOString(),
      result.outcome,
      String(result.jobNimbusStatus || ""),
      lead.contact.firstName,
      lead.contact.lastName,
      lead.contact.fullName,
      lead.contact.phone,
      lead.contact.email,
      lead.property.address,
      lead.property.city,
      lead.property.state,
      lead.property.zip,
      lead.property.fullAddress,
      lead.property.county,
      lead.survey.propertyType,
      lead.survey.issue,
      lead.survey.timeline,
      lead.survey.roofCondition,
      lead.tracking.utmSource,
      lead.tracking.utmMedium,
      lead.tracking.utmCampaign,
      lead.tracking.utmContent,
      lead.tracking.fbclid,
      lead.meta.pageUrl,
      lead.meta.ipAddress,
      lead.meta.userAgent,
      result.upstreamMessage,
      result.upstreamResponseText,
      "No"
    ]
  ];

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEETS_SPREADSHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ values })
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Sheets append failed with status ${response.status}: ${truncateText(detail, 2000)}`);
  }
}

async function updateAppointmentScheduledInGoogleSheets(booking, env) {
  if (!env.GOOGLE_SHEETS_CLIENT_EMAIL || !env.GOOGLE_SHEETS_PRIVATE_KEY || !env.GOOGLE_SHEETS_SPREADSHEET_ID) {
    return;
  }

  const bookerEmail = normalizeEmailAddress(booking.bookerEmail);
  if (!bookerEmail) {
    return;
  }

  const appointmentScheduledValue = isConfirmedCalBookingStatus(booking.bookingStatus) ? "Yes" : "No";

  const accessToken = await getGoogleAccessToken(env);
  const sheetName = env.GOOGLE_SHEETS_SHEET_NAME || "Lead Log";
  const encodedReadRange = encodeURIComponent(`${sheetName}!A:AC`);
  const readResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEETS_SPREADSHEET_ID}/values/${encodedReadRange}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!readResponse.ok) {
    const detail = await readResponse.text();
    throw new Error(`Google Sheets read failed with status ${readResponse.status}: ${truncateText(detail, 2000)}`);
  }

  const readPayload = await readResponse.json();
  const rows = Array.isArray(readPayload.values) ? readPayload.values : [];
  if (!rows.length) {
    return;
  }

  const appointmentColumnIndexes = resolveAppointmentStatusColumnIndexes(rows[0]);
  const matchingRowNumber = findMatchingLeadRowNumber(rows, {
    email: bookerEmail,
    propertyAddress: booking.propertyAddress
  });

  if (!matchingRowNumber || !appointmentColumnIndexes.length) {
    return;
  }

  for (const appointmentColumnIndex of appointmentColumnIndexes) {
    const writeRange = encodeURIComponent(
      `${sheetName}!${toSheetColumnLetter(appointmentColumnIndex + 1)}${matchingRowNumber}`
    );
    const writeResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEETS_SPREADSHEET_ID}/values/${writeRange}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ values: [[appointmentScheduledValue]] })
      }
    );

    if (!writeResponse.ok) {
      const detail = await writeResponse.text();
      throw new Error(`Google Sheets update failed with status ${writeResponse.status}: ${truncateText(detail, 2000)}`);
    }
  }
}

function resolveAppointmentStatusColumnIndexes(headerRow) {
  if (!Array.isArray(headerRow) || !headerRow.length) {
    return [28];
  }

  const normalizedTargets = new Set(
    GOOGLE_SHEETS_APPOINTMENT_STATUS_COLUMN_HEADERS.map((header) => normalizeSheetHeaderLabel(header))
  );
  const indexes = [];

  headerRow.forEach((value, index) => {
    if (normalizedTargets.has(normalizeSheetHeaderLabel(value))) {
      indexes.push(index);
    }
  });

  return indexes.length ? indexes : [28];
}

function findMatchingLeadRowNumber(rows, criteria) {
  const candidateRowNumbers = [];

  for (let index = rows.length - 1; index >= 1; index -= 1) {
    const row = rows[index] || [];
    const email = normalizeEmailAddress(row[7]);
    if (email !== criteria.email) {
      continue;
    }

    candidateRowNumbers.push(index + 1);

    if (!criteria.propertyAddress) {
      return index + 1;
    }

    if (
      doAddressesLikelyMatch(criteria.propertyAddress, row[8]) ||
      doAddressesLikelyMatch(criteria.propertyAddress, row[12])
    ) {
      return index + 1;
    }
  }

  return candidateRowNumbers[0] || 0;
}

function normalizeSheetHeaderLabel(value) {
  return clean(value).toLowerCase();
}

function doAddressesLikelyMatch(left, right) {
  const normalizedLeft = normalizeAddressForMatching(left);
  const normalizedRight = normalizeAddressForMatching(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
}

function normalizeAddressForMatching(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function toSheetColumnLetter(columnNumber) {
  let current = Number(columnNumber);
  let label = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }

  return label;
}

async function sendLeadNotificationEmail(lead, env, result) {
  const recipientEmail = normalizeEmailAddress(env.LEAD_NOTIFICATION_EMAIL_TO || DEFAULT_LEAD_NOTIFICATION_EMAIL);

  if (!recipientEmail) {
    throw new Error("Lead notification email recipient is not configured.");
  }

  if (!env.LEAD_NOTIFICATION_EMAIL || typeof env.LEAD_NOTIFICATION_EMAIL.send !== "function") {
    throw new Error("Cloudflare send_email binding LEAD_NOTIFICATION_EMAIL is not configured.");
  }

  const senderEmail = normalizeEmailAddress(env.LEAD_NOTIFICATION_EMAIL_FROM || DEFAULT_LEAD_NOTIFICATION_FROM_EMAIL);
  const senderName = clean(env.LEAD_NOTIFICATION_EMAIL_FROM_NAME || DEFAULT_LEAD_NOTIFICATION_FROM_NAME);
  const subjectPrefix = clean(env.LEAD_NOTIFICATION_SUBJECT_PREFIX || DEFAULT_LEAD_NOTIFICATION_SUBJECT_PREFIX);
  const subject = buildLeadNotificationSubject(lead, env, result, subjectPrefix);
  const textBody = buildLeadNotificationText(lead, env, result);
  const htmlBody = buildLeadNotificationHtml(lead, env, result);
  const replyToEmail = normalizeEmailAddress(lead.contact.email);
  const replyToName = clean(lead.contact.fullName || `${lead.contact.firstName} ${lead.contact.lastName}`);
  const rawMessage = buildLeadNotificationRawEmail({
    senderEmail,
    senderName,
    recipientEmail,
    subject,
    textBody,
    htmlBody,
    replyToEmail,
    replyToName
  });
  const message = new EmailMessage(senderEmail, recipientEmail, rawMessage);

  await env.LEAD_NOTIFICATION_EMAIL.send(message);
}

async function verifyTurnstileSubmission(body, request, env) {
  if (shouldBypassTurnstileVerification(body, request)) {
    return {
      ok: true,
      status: 200,
      message: ""
    };
  }

  const secretKey = clean(env.TURNSTILE_SECRET_KEY);
  if (!secretKey) {
    console.error("Turnstile secret is not configured.");
    return {
      ok: false,
      status: 503,
      message: "Security verification is temporarily unavailable. Please call or text 310-340-7777."
    };
  }

  const token = clean(body?.meta?.turnstileToken || body?.turnstileToken);
  if (!token) {
    return {
      ok: false,
      status: 400,
      message: "Please complete the security check and try again."
    };
  }

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      secret: secretKey,
      response: token,
      remoteip: request.headers.get("cf-connecting-ip") || ""
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Turnstile siteverify request failed", {
      status: response.status,
      body: detail
    });
    return {
      ok: false,
      status: 502,
      message: "Security verification failed. Please try again."
    };
  }

  const result = await response.json();
  if (!result.success) {
    console.warn("Turnstile verification rejected lead submission", {
      hostname: result.hostname || "",
      errorCodes: result["error-codes"] || []
    });
    return {
      ok: false,
      status: 400,
      message: "Please complete the security check and try again."
    };
  }

  return {
    ok: true,
    status: 200,
    message: ""
  };
}

async function verifyCalWebhookSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const normalizedSignature = signatureHeader.replace(/^sha256=/i, "").trim().toLowerCase();
  if (!normalizedSignature) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expectedSignature = bytesToHex(new Uint8Array(signature));

  return timingSafeEqual(normalizedSignature, expectedSignature);
}

function normalizeCalWebhookBooking(body) {
  const payload = body?.payload || {};
  const attendee = Array.isArray(payload.attendees) ? payload.attendees[0] || {} : {};
  const organizer = payload.organizer || {};
  const responses = payload.responses || {};
  const metadata = payload.metadata || {};

  return {
    bookingUid: clean(payload.uid || payload.rescheduleUid),
    triggerEvent: clean(body?.triggerEvent).toUpperCase(),
    bookingStatus: mapCalWebhookStatus(body?.triggerEvent, payload?.status),
    eventTypeSlug: clean(payload.type),
    eventTitle: clean(payload.eventTitle || payload.title),
    organizerName: clean(organizer.name),
    organizerEmail: normalizeEmailAddress(organizer.email),
    bookerName:
      clean(attendee.name) || clean(getCalResponseValue(responses.name)) || clean(getCalResponseValue(responses.fullName)),
    bookerEmail:
      normalizeEmailAddress(attendee.email) ||
      normalizeEmailAddress(getCalResponseValue(responses.email)) ||
      normalizeEmailAddress(getCalResponseValue(responses.attendeeEmail)),
    bookerPhone:
      normalizePhone(getCalResponseValue(responses.phone)) ||
      normalizePhone(getCalResponseValue(responses.attendeePhoneNumber)) ||
      normalizePhone(getCalResponseValue(responses.mobile)) ||
      normalizePhone(metadata.phone),
    propertyAddress:
      clean(getCalResponseValue(responses.YourAddress)) ||
      clean(getCalResponseValue(responses["your-address"])) ||
      clean(getCalResponseValue(responses.locationAddress)) ||
      clean(metadata.propertyAddress),
    location: clean(payload.location),
    startTime: normalizeTimestamp(payload.startTime),
    endTime: normalizeTimestamp(payload.endTime),
    webhookCreatedAt: normalizeTimestamp(body?.createdAt) || new Date().toISOString(),
    bookingCreatedAt: normalizeTimestamp(payload?.createdAt || payload?.updatedAt || body?.createdAt),
    rawPayloadJson: JSON.stringify(body)
  };
}

async function upsertCalBookingConfirmation(env, booking) {
  await env.REVIEWS_DB.prepare(
    `INSERT INTO cal_booking_confirmations (
      booking_uid,
      trigger_event,
      booking_status,
      event_type_slug,
      event_title,
      organizer_name,
      organizer_email,
      booker_name,
      booker_email,
      booker_phone,
      property_address,
      location,
      start_time,
      end_time,
      webhook_created_at,
      booking_created_at,
      raw_payload_json,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(booking_uid) DO UPDATE SET
      trigger_event = excluded.trigger_event,
      booking_status = excluded.booking_status,
      event_type_slug = excluded.event_type_slug,
      event_title = excluded.event_title,
      organizer_name = excluded.organizer_name,
      organizer_email = excluded.organizer_email,
      booker_name = excluded.booker_name,
      booker_email = excluded.booker_email,
      booker_phone = excluded.booker_phone,
      property_address = excluded.property_address,
      location = excluded.location,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      webhook_created_at = excluded.webhook_created_at,
      booking_created_at = excluded.booking_created_at,
      raw_payload_json = excluded.raw_payload_json,
      updated_at = excluded.updated_at`
  )
    .bind(
      booking.bookingUid,
      booking.triggerEvent,
      booking.bookingStatus,
      booking.eventTypeSlug,
      booking.eventTitle,
      booking.organizerName,
      booking.organizerEmail,
      booking.bookerName,
      booking.bookerEmail,
      booking.bookerPhone,
      booking.propertyAddress,
      booking.location,
      booking.startTime,
      booking.endTime,
      booking.webhookCreatedAt,
      booking.bookingCreatedAt,
      booking.rawPayloadJson,
      new Date().toISOString()
    )
    .run();
}

function getCalResponseValue(responseValue) {
  if (!responseValue) {
    return "";
  }

  if (typeof responseValue === "string") {
    return responseValue;
  }

  if (typeof responseValue?.value === "string") {
    return responseValue.value;
  }

  if (typeof responseValue?.value?.value === "string") {
    return responseValue.value.value;
  }

  if (typeof responseValue?.optionValue === "string") {
    return responseValue.optionValue;
  }

  return "";
}

function mapCalWebhookStatus(triggerEvent, payloadStatus) {
  const normalizedTrigger = clean(triggerEvent).toUpperCase();

  if (normalizedTrigger === "BOOKING_CREATED") {
    return "accepted";
  }

  if (normalizedTrigger === "BOOKING_RESCHEDULED") {
    return "rescheduled";
  }

  if (normalizedTrigger === "BOOKING_CANCELLED") {
    return "cancelled";
  }

  if (normalizedTrigger === "BOOKING_REJECTED") {
    return "rejected";
  }

  if (normalizedTrigger === "BOOKING_REQUESTED") {
    return "requested";
  }

  return clean(payloadStatus).toLowerCase() || "unknown";
}

function isConfirmedCalBookingStatus(status) {
  return ["accepted", "rescheduled"].includes(clean(status).toLowerCase());
}

function shouldBypassTurnstileVerification(body, request) {
  const source = clean(body?.meta?.source);

  if (source === "facebook-flat-roof-landing") {
    return true;
  }

  if (source !== "facebook-flat-roof-integrated-prototype") {
    return false;
  }

  const origin = clean(request.headers.get("origin")).toLowerCase();
  return origin.startsWith("http://127.0.0.1:") || origin.startsWith("http://localhost:");
}

function buildLeadNotificationSubject(lead, env, result, subjectPrefix) {
  const contactName = clean(lead.contact.fullName || `${lead.contact.firstName} ${lead.contact.lastName}`) || "Unknown lead";
  const phoneNumber = clean(lead.contact.phone) || "-";
  const propertyAddress = clean(lead.property.fullAddress) || buildFullAddress(lead.property) || "Unknown address";

  return [subjectPrefix || DEFAULT_LEAD_NOTIFICATION_SUBJECT_PREFIX, contactName, phoneNumber, propertyAddress]
    .filter(Boolean)
    .join(" - ");
}

function buildLeadNotificationText(lead, env, result) {
  const contactName = clean(lead.contact.fullName || `${lead.contact.firstName} ${lead.contact.lastName}`) || "Unknown";
  const phoneNumber = clean(lead.contact.phone) || "-";
  const propertyAddress = clean(lead.property.fullAddress) || buildFullAddress(lead.property) || "Unknown";
  const mapsUrl = buildGoogleMapsUrl(propertyAddress);
  const lines = [
    DEFAULT_LEAD_NOTIFICATION_SUBJECT_PREFIX,
    "",
    contactName,
    phoneNumber,
    propertyAddress,
    mapsUrl ? `Map: ${mapsUrl}` : null
  ].filter(Boolean);

  if (result.outcome === "failed") {
    lines.push(
      "",
      "CRM delivery warning",
      `JobNimbus status: ${String(result.jobNimbusStatus || "not returned")}`,
      `Details: ${truncateText(result.upstreamMessage || "", 1200) || "-"}`
    );
  }

  return lines.join("\n");
}

function buildLeadNotificationHtml(lead, env, result) {
  const contactName = clean(lead.contact.fullName || `${lead.contact.firstName} ${lead.contact.lastName}`) || "Unknown";
  const phoneNumber = clean(lead.contact.phone) || "-";
  const propertyAddress = clean(lead.property.fullAddress) || buildFullAddress(lead.property) || "Unknown";
  const mapsUrl = buildGoogleMapsUrl(propertyAddress);
  const rows = [
    buildLeadNotificationDetailRow("", escapeHtml(contactName)),
    buildLeadNotificationDetailRow(
      "",
      lead.contact.phone ? buildHtmlLink(`tel:${lead.contact.phone}`, escapeHtml(phoneNumber), true) : escapeHtml(phoneNumber)
    ),
    buildLeadNotificationDetailRow(
      "",
      mapsUrl ? buildHtmlLink(mapsUrl, escapeHtml(propertyAddress), true) : escapeHtml(propertyAddress)
    )
  ].filter(Boolean);

  const failureNotice =
    result.outcome === "failed"
      ? `<div style="margin:0 0 16px;padding:12px 14px;border:1px solid #d97706;background:#fff7ed;color:#9a3412;border-radius:8px;"><strong>CRM delivery warning</strong><br>${escapeHtml(
          `JobNimbus status: ${String(result.jobNimbusStatus || "not returned")}`
        )}<br>${escapeHtml(truncateText(result.upstreamMessage || "", 1200) || "-")}</div>`
      : "";

  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    '<body style="margin:0;padding:24px;background:#f5f2ea;font-family:Arial,sans-serif;color:#1f2937;">',
    '<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">',
    '<h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;color:#111827;">LA Roof Estimate</h1>',
    failureNotice,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">',
    rows.join(""),
    "</table>",
    "</div>",
    "</body>",
    "</html>"
  ].join("");
}

function buildLeadNotificationRawEmail({
  senderEmail,
  senderName,
  recipientEmail,
  subject,
  textBody,
  htmlBody,
  replyToEmail,
  replyToName
}) {
  const boundary = `boundary_${crypto.randomUUID()}`;
  const headers = [
    `From: ${formatEmailHeader(senderName, senderEmail)}`,
    `To: ${formatEmailHeader("", recipientEmail)}`,
    `Subject: ${sanitizeHeaderValue(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${extractEmailDomain(senderEmail) || "ecosystemsca.net"}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`
  ];

  if (replyToEmail) {
    headers.push(`Reply-To: ${formatEmailHeader(replyToName || "", replyToEmail)}`);
  }

  return [
    ...headers,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    textBody,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    htmlBody,
    "",
    `--${boundary}--`,
    ""
  ].join("\r\n");
}

function buildLeadNotificationDetailRow(label, value) {
  return `<tr><td style="padding:0 0 12px;vertical-align:top;width:140px;font-weight:700;color:#111827;">${escapeHtml(label)}</td><td style="padding:0 0 12px;color:#374151;">${value}</td></tr>`;
}

function buildHtmlLink(href, label, enabled) {
  if (!enabled) {
    return label;
  }

  return `<a href="${escapeHtmlAttribute(href)}" style="color:#0f766e;text-decoration:underline;">${label}</a>`;
}

function buildGoogleMapsUrl(address) {
  const normalizedAddress = clean(address);

  if (!normalizedAddress) {
    return "";
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(normalizedAddress)}`;
}

function formatEmailHeader(name, email) {
  const sanitizedEmail = sanitizeHeaderValue(email);
  const sanitizedName = sanitizeHeaderValue(name);

  if (!sanitizedName) {
    return `<${sanitizedEmail}>`;
  }

  return `"${sanitizedName.replace(/"/g, "'")}" <${sanitizedEmail}>`;
}

function sanitizeHeaderValue(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function extractEmailDomain(email) {
  const normalized = String(email || "").trim();
  const atIndex = normalized.lastIndexOf("@");
  return atIndex >= 0 ? normalized.slice(atIndex + 1) : "";
}

function truncateText(value, limit) {
  const normalized = String(value || "").trim();

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

async function getGoogleAccessToken(env) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  const payload = {
    iss: env.GOOGLE_SHEETS_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: issuedAt + 3600,
    iat: issuedAt
  };

  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = await signJwt(unsignedToken, env.GOOGLE_SHEETS_PRIVATE_KEY);
  const assertion = `${unsignedToken}.${signature}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  if (!tokenResponse.ok) {
    const detail = await tokenResponse.text();
    throw new Error(`Google OAuth token request failed: ${detail}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

async function signJwt(unsignedToken, privateKeyPem) {
  const sanitizedPem = privateKeyPem.replace(/\\n/g, "\n").trim();
  const pkcs8 = pemToArrayBuffer(sanitizedPem);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function pemToArrayBuffer(pem) {
  const cleaned = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function normalizeLead(body, request) {
  const providedFullName = clean(body.contact?.fullName);
  const fallbackFullName = `${clean(body.contact?.firstName)} ${clean(body.contact?.lastName)}`.trim();
  const normalizedPhone = normalizePhone(body.contact?.phone);
  const propertyAddress = clean(body.property?.address);
  const propertyCity = clean(body.property?.city);
  const propertyState = normalizeState(body.property?.state || "CA");
  const propertyZip = clean(body.property?.zip);
  const fullAddress = buildFullAddress({
    address: propertyAddress,
    city: propertyCity,
    state: propertyState,
    zip: propertyZip
  });

  return {
    contact: {
      firstName: clean(body.contact?.firstName),
      lastName: clean(body.contact?.lastName),
      fullName: providedFullName || fallbackFullName,
      phone: normalizedPhone,
      email: clean(body.contact?.email)
    },
    property: {
      address: propertyAddress,
      city: propertyCity,
      state: propertyState,
      zip: propertyZip,
      fullAddress,
      county: clean(body.property?.county)
    },
    survey: {
      propertyType: clean(body.survey?.propertyType),
      issue: clean(body.survey?.issue),
      timeline: clean(body.survey?.timeline),
      roofCondition: clean(body.survey?.roofCondition)
    },
    tracking: {
      utmSource: clean(body.tracking?.utmSource),
      utmMedium: clean(body.tracking?.utmMedium),
      utmCampaign: clean(body.tracking?.utmCampaign),
      utmContent: clean(body.tracking?.utmContent),
      fbclid: clean(body.tracking?.fbclid),
      fbp: clean(body.tracking?.fbp),
      fbc: clean(body.tracking?.fbc),
      leadEventId: clean(body.tracking?.leadEventId)
    },
    meta: {
      source: clean(body.meta?.source || "facebook-flat-roof-landing"),
      submittedAt: clean(body.meta?.submittedAt || new Date().toISOString()),
      pageUrl: clean(body.meta?.pageUrl),
      ipAddress: request.headers.get("cf-connecting-ip") || "",
      userAgent: request.headers.get("user-agent") || ""
    }
  };
}

function validateLead(lead) {
  const errors = [];
  if (!lead.contact.fullName && !lead.contact.firstName) {
    errors.push("Name is required.");
  }
  if (!lead.contact.phone) {
    errors.push("A valid 10-digit phone number is required.");
  }
  if (!lead.contact.email) {
    errors.push("Email is required.");
  }
  if (!lead.property.address) {
    errors.push("Property address is required.");
  }
  if (!lead.property.city) {
    errors.push("Property city is required.");
  }
  if (!lead.property.zip) {
    errors.push("Property ZIP is required.");
  }
  return errors;
}

function normalizePlacesReviews(reviews, env) {
  return reviews.map((review) => ({
    authorName:
      review.authorAttribution?.displayName ||
      review.author_name ||
      review.authorName ||
      "Google Reviewer",
    authorPhotoUrl:
      review.authorAttribution?.photoUri ||
      review.profilePhotoUrl ||
      review.profile_photo_url ||
      "",
    rating: review.rating || 5,
    relativeTime:
      review.relativePublishTimeDescription ||
      review.relative_time_description ||
      formatRelativeTime(review.publishTime) ||
      "Google review",
    text:
      review.text?.text ||
      review.originalText?.text ||
      review.text ||
      "",
    sourceUrl: review.googleMapsUri || review.google_maps_uri || env.GOOGLE_REVIEWS_URL || "",
    ownerReply: null
  }));
}

function normalizeArchivedReviewRow(row, env) {
  return {
    reviewId: row.review_id,
    googleResourceName: row.google_resource_name,
    authorName: row.author_name || "Google Reviewer",
    authorPhotoUrl: row.author_photo_url || "",
    isAnonymous: Boolean(row.is_anonymous),
    rating: Number(row.star_rating || 5),
    relativeTime: formatRelativeTime(row.update_time || row.create_time),
    text: row.comment || "",
    sourceUrl: row.source_url || env.GOOGLE_REVIEWS_URL || "",
    createTime: row.create_time,
    updateTime: row.update_time,
    ownerReply: row.owner_reply_comment
      ? {
          comment: row.owner_reply_comment,
          updateTime: row.owner_reply_update_time,
          relativeTime: formatRelativeTime(row.owner_reply_update_time)
        }
      : null
  };
}

function mapStarRating(value) {
  const starMap = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5
  };

  return starMap[value] || 5;
}

function extractReviewId(resourceName) {
  const parts = String(resourceName || "").split("/");
  return parts[parts.length - 1] || resourceName || crypto.randomUUID();
}

function formatRelativeTime(isoString) {
  if (!isoString) {
    return "Google review";
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "Google review";
  }

  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (absoluteSeconds < 60) {
    return formatter.format(Math.round(deltaSeconds), "second");
  }

  if (absoluteSeconds < 3600) {
    return formatter.format(Math.round(deltaSeconds / 60), "minute");
  }

  if (absoluteSeconds < 86400) {
    return formatter.format(Math.round(deltaSeconds / 3600), "hour");
  }

  if (absoluteSeconds < 2629800) {
    return formatter.format(Math.round(deltaSeconds / 86400), "day");
  }

  if (absoluteSeconds < 31557600) {
    return formatter.format(Math.round(deltaSeconds / 2629800), "month");
  }

  return formatter.format(Math.round(deltaSeconds / 31557600), "year");
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clampPositiveInteger(value, fallback, max) {
  const parsed = positiveInteger(value, fallback);
  return Math.min(parsed, max);
}

function normalizePhone(value) {
  const digits = clean(value).replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }

  if (digits.length === 10) {
    return digits;
  }

  return "";
}

function normalizeState(value) {
  return clean(value).toUpperCase();
}

function buildFullAddress(property) {
  return [property.address, property.city, property.state, property.zip].filter(Boolean).join(", ");
}

function base64UrlEncode(input) {
  return base64UrlEncodeBytes(new TextEncoder().encode(input));
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value);
}

function normalizeEmailAddress(value) {
  return clean(value).toLowerCase();
}

function normalizeTimestamp(value) {
  const normalizedValue = clean(value);
  if (!normalizedValue) {
    return "";
  }

  const timestamp = new Date(normalizedValue);
  if (Number.isNaN(timestamp.getTime())) {
    return "";
  }

  return timestamp.toISOString();
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function json(payload, status, env) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...corsHeaders(env)
    }
  });
}

function withCors(response, env) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(env)).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  };
}