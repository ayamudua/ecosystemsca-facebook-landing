const CONFIG = window.ECO_LANDING_CONFIG || {};
const API_BASE = (CONFIG.apiBaseUrl || "").replace(/\/$/, "");
const REVIEW_DISPLAY_MODE = CONFIG.reviewDisplayMode || "api";
const REVIEW_IFRAME_URL = CONFIG.reviewIframeUrl || "";
const EXIT_INTENT_VIDEO_URL = CONFIG.exitIntentVideoUrl || "";
const EXIT_INTENT_HEADLINE =
  CONFIG.exitIntentHeadline || "Before you go, watch this quick message from your neighborhood Flat Roof Experts";
const EXIT_INTENT_COPY =
  CONFIG.exitIntentCopy ||
  "If your flat roof may still be restorable, this short walkthrough explains what ECO Systems looks for before recommending replacement.";
const GOOGLE_BUSINESS_NAME = CONFIG.googleBusinessName || "ECO Systems";
const GOOGLE_PLACE_ID = CONFIG.googlePlaceId || "ChIJt45P39m6woARDs_3xzLtiRY";
const GOOGLE_REVIEW_SCORE = Number(CONFIG.googleReviewScore || 0);
const GOOGLE_REVIEW_COUNT = Number(CONFIG.googleReviewCount || 0);
const GOOGLE_REVIEWS_URL =
  CONFIG.googleReviewsUrl ||
  "https://www.google.com/maps/place/ECO+Systems/@34.0200392,-118.7413853,10z/data=!3m1!4b1!4m14!1m7!3m6!1s0x80c29ba16145f7cb:0x969231ca58843855!2sECO+Systems!8m2!3d34.020479!4d-118.4117326!16s%2Fg%2F11j5s_nsyl!3m5!1s0x80c29ba16145f7cb:0x969231ca58843855!8m2!3d34.020479!4d-118.4117326!16s%2Fg%2F11j5s_nsyl?hl=en&entry=ttu&g_ep=EgoyMDI2MDMxOC4xIKXMDSoASAFQAw%3D%3D";
const GOOGLE_ALTERNATE_REVIEWS_URL =
  CONFIG.googleAlternateReviewsUrl ||
  "https://www.google.com/search?q=ECO+Roof+Solar&ludocid=10849789197427161173&lsig=AB86z5X8fALn0wXQ-wYSbWlQi8GC#lkt=LocalPoiReviews&lpg=cid:CgIgAQ%3D%3D";
const GOOGLE_WRITE_REVIEW_URL = GOOGLE_REVIEWS_URL;
const CAL_COM_RAW_LINK = String(CONFIG.calComLink || "").trim();
const CAL_COM_EMBED = normalizeCalComLink(CAL_COM_RAW_LINK);
const CAL_COM_LINK = CAL_COM_EMBED.calLink;
const CAL_COM_EXTERNAL_URL = CAL_COM_EMBED.externalUrl;
const CAL_COM_NAMESPACE =
  String(CONFIG.calComNamespace || CAL_COM_LINK.split("/").pop() || "").trim() || "at-home-roof-estimate-and-inspection";
const CAL_COM_ORIGIN = "https://app.cal.com";
const CAL_COM_ENABLED = Boolean(CAL_COM_EXTERNAL_URL);
const CAL_COM_HEADLINE = CONFIG.calComHeadline || "Step 2: Pick your inspection time";
const CAL_COM_COPY =
  CONFIG.calComCopy ||
  "Choose your appointment now so ECO Systems can reserve your onsite flat-roof inspection while availability is open.";
const CALENDAR_PAGE_URL = new URL("./schedule.html", window.location.href);
const POST_SUBMIT_PAGE_PATH = String(CONFIG.postSubmitPagePath || "./post-booking-video.html").trim();
const POST_SUBMIT_VIDEO_URL = String(CONFIG.postSubmitVideoUrl || "").trim();
const POST_SUBMIT_REDIRECT_DELAY_MS = Number(CONFIG.postSubmitRedirectDelayMs || 2200);
const CAL_BOOKING_STATUS_POLL_INTERVAL_MS = Number(CONFIG.calBookingStatusPollIntervalMs || 5000);
const CAL_BOOKING_STATUS_POLL_WINDOW_MS = Number(CONFIG.calBookingStatusPollWindowMs || 1800000);
const TURNSTILE_SITE_KEY = CONFIG.turnstileSiteKey || "";
const TURNSTILE_ENABLED = Boolean(TURNSTILE_SITE_KEY);

const form = document.querySelector("#estimate-form");
const steps = Array.from(document.querySelectorAll(".form-step"));
const statusNode = document.querySelector("#form-status");
const submitButton = document.querySelector("#submit-button");
const turnstileShell = document.querySelector("#turnstile-shell");
const turnstileWidgetNode = document.querySelector("#turnstile-widget");
const confirmationPanel = document.querySelector("#submission-confirmation");
const confirmationEyebrow = document.querySelector(".submission-confirmation-eyebrow");
const confirmationTitle = confirmationPanel?.querySelector("h3") || null;
const confirmationCopy = document.querySelector("#submission-confirmation-copy");
const confirmationDetails = document.querySelector("#submission-confirmation-details");
const schedulerShell = document.querySelector("#scheduler-shell");
const schedulerStatus = document.querySelector("#scheduler-status");
const schedulerLaunchButton = document.querySelector("#scheduler-launch-button");
const schedulerFallback = document.querySelector("#scheduler-fallback");
const schedulerFallbackCopy = document.querySelector("#scheduler-fallback-copy");
const schedulerEmbed = document.querySelector("#scheduler-embed");
const newRequestButton = document.querySelector("#new-request-button");
const exitIntentBackdrop = document.querySelector("#exit-intent-backdrop");
const exitIntentDialog = document.querySelector("#exit-intent-dialog");
const exitIntentTitle = document.querySelector("#exit-intent-title");
const exitIntentCopy = document.querySelector("#exit-intent-copy");
const exitIntentVideo = document.querySelector("#exit-intent-video");
const exitIntentVideoLaunch = document.querySelector("#exit-intent-video-launch");
const exitIntentCloseButton = document.querySelector("#exit-intent-close");
const exitIntentStayButton = document.querySelector("#exit-intent-stay");
const exitIntentDismissButton = document.querySelector("#exit-intent-dismiss");
const exitIntentLeaveLink = document.querySelector("#exit-intent-leave-link");
const reviewsGrid = document.querySelector("#reviews-grid");
const reviewsLoadMoreButton = document.querySelector("#reviews-load-more");
const reviewSummary = document.querySelector("#reviews-summary");
const reviewIframeShell = document.querySelector("#reviews-iframe-shell");
const reviewIframe = document.querySelector("#msgsndr_reviews") || document.querySelector("#reviews-iframe");
const allReviewsLink = document.querySelector("#all-reviews-link");
const writeReviewLink = document.querySelector("#write-review-link");
const socialProofScore = document.querySelector("#social-proof-score");
const socialProofCount = document.querySelector("#social-proof-count");
const expandedReviewIndexes = new Set();

const REVIEW_BATCH_SIZE = 6;
const REVIEW_COLLAPSE_CHAR_LIMIT = 260;
const EXIT_INTENT_SESSION_KEY = "eco-exit-intent-shown";
const SUBMISSION_CONFIRMATION_RESET_MS = 30000;
const EXIT_INTENT_EMBED_URL = toYoutubeEmbedUrl(EXIT_INTENT_VIDEO_URL);
const EXIT_INTENT_ENABLED = Boolean(EXIT_INTENT_EMBED_URL);

let currentStep = 0;
let reviews = [];
let visibleReviewCount = REVIEW_BATCH_SIZE;
let reviewsSourceUrl = GOOGLE_REVIEWS_URL;
let isLoadingMoreReviews = false;
let hasSubmittedSuccessfully = false;
let exitIntentOpen = false;
let exitIntentShown = readExitIntentShown();
let pendingExitHref = "";
let exitIntentVideoLoaded = false;
let confirmationResetTimer = 0;
let turnstileWidgetId = null;
let turnstileToken = "";
let turnstileInitialized = false;
let calComInitToken = 0;
let calComEventBindingsRegistered = false;
let lastSubmittedLeadPayload = null;
let calComReady = false;
let bookingStatusPollTimer = 0;
let bookingStatusPollingStartedAt = 0;
let postSubmitRedirectTimer = 0;

if (allReviewsLink) {
  allReviewsLink.href = GOOGLE_ALTERNATE_REVIEWS_URL;
}

if (writeReviewLink) {
  writeReviewLink.href = GOOGLE_WRITE_REVIEW_URL;
}

function setStatus(message, tone = "") {
  statusNode.textContent = message;
  statusNode.className = "form-status";
  if (tone) {
    statusNode.classList.add(`is-${tone}`);
  }
}

function showStep(index) {
  currentStep = index;

  steps.forEach((step, stepIndex) => {
    const isActive = stepIndex === index;
    step.hidden = !isActive;
    step.classList.toggle("is-active", isActive);
  });

  setStatus("");
}

function getRadioValue(name) {
  return form.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

function getFieldValue(name) {
  return form.elements[name]?.value?.trim() || "";
}

function validateStep(index) {
  const errors = [];

  if (index === 0) {
    if (!getRadioValue("county")) {
      errors.push("Please choose whether the property is in LA County.");
    }
  }

  if (index === 1) {
    const requiredFields = {
      address: "Please enter the property address.",
      city: "Please enter the property city.",
      state: "Please enter the property state.",
      zip: "Please enter the property ZIP code."
    };

    Object.entries(requiredFields).forEach(([fieldName, message]) => {
      if (!getFieldValue(fieldName)) {
        errors.push(message);
      }
    });
  }

  if (index === 2) {
    const requiredFields = {
      fullName: "Please enter your name.",
      phone: "Please enter a cell phone number.",
      email: "Please enter your email address."
    };

    Object.entries(requiredFields).forEach(([fieldName, message]) => {
      if (!getFieldValue(fieldName)) {
        errors.push(message);
      }
    });

    const email = getFieldValue("email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push("Please enter a valid email address.");
    }

    if (getFieldValue("phone") && !normalizePhoneNumber(getFieldValue("phone"))) {
      errors.push("Please enter a valid 10-digit cell phone number.");
    }
  }

  if (errors.length) {
    setStatus(errors[0], "error");
    return false;
  }

  setStatus("");
  return true;
}

function getTrackingPayload() {
  const params = new URLSearchParams(window.location.search);
  const fbclid = params.get("fbclid") || "";
  const fbp = readCookieValue("_fbp");
  const existingFbc = readCookieValue("_fbc");

  return {
    utmSource: params.get("utm_source") || "facebook",
    utmMedium: params.get("utm_medium") || "paid-social",
    utmCampaign: params.get("utm_campaign") || "",
    utmContent: params.get("utm_content") || "",
    fbclid,
    fbp,
    fbc: existingFbc || buildMetaFbcValue(fbclid),
    leadEventId: generateLeadEventId()
  };
}

function buildPayload() {
  const parsedName = splitFullName(getFieldValue("fullName"));
  const normalizedPhone = normalizePhoneNumber(getFieldValue("phone"));

  return {
    contact: {
      firstName: parsedName.firstName,
      lastName: parsedName.lastName,
      fullName: getFieldValue("fullName"),
      phone: normalizedPhone,
      email: getFieldValue("email")
    },
    property: {
      address: getFieldValue("address"),
      city: getFieldValue("city"),
      state: getFieldValue("state") || "CA",
      zip: getFieldValue("zip"),
      county: getRadioValue("county")
    },
    survey: {
      propertyType: "",
      issue: "",
      timeline: "",
      roofCondition: ""
    },
    tracking: getTrackingPayload(),
    meta: {
      source: "facebook-flat-roof-landing",
      submittedAt: new Date().toISOString(),
      pageUrl: window.location.href,
      turnstileToken
    },
    website: getFieldValue("website")
  };
}

async function submitLead(event) {
  event.preventDefault();
  clearConfirmationResetTimer();

  if (!validateStep(2)) {
    return;
  }

  if (TURNSTILE_ENABLED && !turnstileToken) {
    setStatus("Please wait a moment for the security check to finish, then submit again.", "error");
    return;
  }

  const payloadBody = buildPayload();

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  setStatus("Recording your request before opening the calendar...", "");

  try {
    const response = await fetch(`${API_BASE}/api/lead`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payloadBody)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to send your request right now.");
    }

    trackMetaLeadSubmission(payloadBody);
    hasSubmittedSuccessfully = true;
    closeExitIntent();
    showSubmissionConfirmation(payloadBody, payload.message || "Your request is recorded. Choose your appointment below.");
  } catch (error) {
    setStatus(
      `${error.message} If you need a faster answer, call or text 310-340-7777.`,
      "error"
    );
  } finally {
    resetTurnstileWidget();
    submitButton.disabled = false;
    submitButton.textContent = "Next";
  }
}

function redirectToSchedulerPage(payload) {
  const destination = buildSchedulerPageUrl(payload);
  setStatus("Redirecting you to the scheduling page...", "success");
  window.location.assign(destination);
}

function buildSchedulerPageUrl(payload) {
  const url = new URL(CALENDAR_PAGE_URL.toString());
  const prefill = buildCalComPrefillValues(payload);

  Object.entries(prefill).forEach(([key, value]) => {
    if (!value) {
      return;
    }

    url.searchParams.set(key, value);
  });

  url.searchParams.set("submitted", "1");

  return url.toString();
}

function showSubmissionConfirmation(payload, message) {
  if (!confirmationPanel || !confirmationCopy || !confirmationDetails) {
    showStep(0);
    return;
  }

  clearConfirmationResetTimer();
  lastSubmittedLeadPayload = payload;

  form.hidden = true;
  confirmationPanel.hidden = false;
  showSchedulingStep(payload, message);

  prepareSchedulerState(payload);

  if (!CAL_COM_ENABLED) {
    confirmationResetTimer = window.setTimeout(() => {
      resetLeadForm();
      setStatus("");
    }, SUBMISSION_CONFIRMATION_RESET_MS);
  }
}

function resetLeadForm() {
  clearConfirmationResetTimer();
  clearPostSubmitRedirectTimer();
  form.reset();
  hasSubmittedSuccessfully = false;
  lastSubmittedLeadPayload = null;
  confirmationPanel.hidden = true;
  confirmationDetails.hidden = true;
  confirmationDetails.innerHTML = "";
  resetSchedulerState();
  form.hidden = false;
  if (TURNSTILE_ENABLED && turnstileShell) {
    turnstileShell.hidden = false;
  }
  resetTurnstileWidget();
  showStep(0);
}

function clearConfirmationResetTimer() {
  if (!confirmationResetTimer) {
    return;
  }

  window.clearTimeout(confirmationResetTimer);
  confirmationResetTimer = 0;
}

function showSchedulingStep(payload, message) {
  if (confirmationEyebrow) {
    confirmationEyebrow.textContent = "Step 4";
  }

  if (confirmationTitle) {
    confirmationTitle.textContent = CAL_COM_HEADLINE;
  }

  confirmationCopy.textContent = message || CAL_COM_COPY;
  renderSchedulingSummary(payload);

  if (newRequestButton) {
    newRequestButton.hidden = true;
  }
}

function renderSchedulingSummary(payload) {
  if (!confirmationDetails || !payload) {
    return;
  }

  confirmationDetails.innerHTML = `
    <p><strong>Name:</strong> ${escapeHtml(payload.contact.fullName || payload.contact.firstName || "")}</p>
    <p><strong>Mobile:</strong> ${escapeHtml(formatPhoneForDisplay(payload.contact.phone) || payload.contact.phone || "")}</p>
    <p><strong>Email:</strong> ${escapeHtml(payload.contact.email || "")}</p>
    <p><strong>Property:</strong> ${escapeHtml(formatAddressForDisplay(payload.property))}</p>
  `;
  confirmationDetails.hidden = false;
}

function showBookedConfirmation(payload, booking) {
  const bookedPayload = payload || lastSubmittedLeadPayload;
  const formattedStartTime = booking?.startTime ? new Date(booking.startTime).toLocaleString() : "";

  clearBookingStatusPollingTimer();

  if (confirmationEyebrow) {
    confirmationEyebrow.textContent = "Appointment booked";
  }

  if (confirmationTitle) {
    confirmationTitle.textContent = "Your inspection appointment is scheduled.";
  }

  confirmationCopy.textContent = formattedStartTime
    ? `Your inspection is booked for ${formattedStartTime}. Check your email for the calendar invite and reminders.`
    : "Your inspection appointment has been scheduled. Check your email for the calendar invite and reminders.";

  if (bookedPayload) {
    confirmationDetails.innerHTML = `
      ${formattedStartTime ? `<p><strong>Appointment:</strong> ${escapeHtml(formattedStartTime)}</p>` : ""}
      <p><strong>Name:</strong> ${escapeHtml(bookedPayload.contact.fullName || bookedPayload.contact.firstName || "")}</p>
      <p><strong>Mobile:</strong> ${escapeHtml(formatPhoneForDisplay(bookedPayload.contact.phone) || bookedPayload.contact.phone || "")}</p>
      <p><strong>Email:</strong> ${escapeHtml(bookedPayload.contact.email || "")}</p>
      <p><strong>Property:</strong> ${escapeHtml(formatAddressForDisplay(bookedPayload.property))}</p>
    `;
    confirmationDetails.hidden = false;
  }

  if (schedulerShell) {
    schedulerShell.hidden = true;
  }

  if (newRequestButton) {
    newRequestButton.hidden = false;
    newRequestButton.textContent = "Submit another request";
  }

  schedulePostSubmitRedirect(bookedPayload, booking);
}

function prepareSchedulerState(payload) {
  if (!schedulerShell) {
    return;
  }

  clearBookingStatusPollingTimer();
  schedulerShell.hidden = false;
  setSchedulerStatus("Loading appointment availability...", "success");

  if (schedulerLaunchButton) {
    schedulerLaunchButton.hidden = false;
  }

  if (schedulerEmbed) {
    schedulerEmbed.hidden = true;
    schedulerEmbed.innerHTML = "";
  }

  if (!CAL_COM_ENABLED) {
    renderSchedulerFallback("Appointment scheduling will appear here once the Cal.com booking link is configured.", true);
    return;
  }

  renderSchedulerFallback("", false);
  startBookingStatusPolling(payload);
  renderCalComEmbed(payload);
}

function openCalComModal(payload) {
  bootstrapCalComApi();
  calComReady = false;
  lastSubmittedLeadPayload = payload || lastSubmittedLeadPayload;
  setSchedulerStatus("Opening scheduler...");

  const initToken = ++calComInitToken;

  attemptCalComModalOpen(initToken);
}

function attemptCalComModalOpen(initToken, attempt = 0) {
  if (typeof window.Cal !== "function") {
    if (attempt < 40) {
      window.setTimeout(() => {
        if (initToken !== calComInitToken) {
          return;
        }

        attemptCalComModalOpen(initToken, attempt + 1);
      }, 250);
      return;
    }

    renderSchedulerFallback("The scheduler could not open automatically. Use the button above to try again.", true);
    setSchedulerStatus("Scheduler failed to open. Tap Reopen scheduler to try again.", "error");
    return;
  }

  initializeCalComApi();
  registerCalComEventBindings();
  const calLink = buildPrefilledCalComLink(lastSubmittedLeadPayload || {});
  window.Cal("preload", {
    calLink
  });
  window.Cal("modal", {
    calLink,
    config: {
      ...buildCalComConfig(lastSubmittedLeadPayload || {}),
      layout: "month_view",
      useSlotsViewOnSmallScreen: true,
      theme: "light"
    }
  });
  window.Cal("ui", {
    theme: "light",
    hideEventTypeDetails: false,
    layout: "month_view"
  });

  setSchedulerStatus("Scheduler opened. Complete your booking to continue.");
}

function renderCalComEmbed(payload, attempt = 0, initToken = ++calComInitToken) {
  if (!schedulerEmbed) {
    return;
  }

  bootstrapCalComApi();
  calComReady = false;

  schedulerEmbed.hidden = false;
  schedulerEmbed.innerHTML = "";
  setSchedulerStatus("Loading appointment availability...");

  if (typeof window.Cal !== "function") {
    if (attempt < 40) {
      window.setTimeout(() => {
        if (initToken !== calComInitToken) {
          return;
        }

        renderCalComEmbed(payload, attempt + 1, initToken);
      }, 250);
      return;
    }

    schedulerEmbed.hidden = true;
    renderSchedulerFallback("The embedded scheduler could not load. Please refresh the page and try again.", true);
    setSchedulerStatus("Scheduler failed to load inline. Please refresh the page and try again.", "error");
    return;
  }

  initializeCalComApi();
  registerCalComEventBindings();
  window.Cal("inline", {
    elementOrSelector: schedulerEmbed,
    calLink: CAL_COM_LINK,
    config: {
      ...buildCalComConfig(payload),
      layout: "month_view",
      useSlotsViewOnSmallScreen: true,
      theme: "light"
    }
  });
  window.Cal("ui", {
    theme: "light",
    hideEventTypeDetails: false,
    layout: "month_view"
  });

  window.setTimeout(() => {
    if (initToken !== calComInitToken || calComReady) {
      return;
    }

    renderDirectCalComIframe(payload);
  }, 5000);

  setSchedulerStatus("Choose a date and time below to complete your booking.");
}

function renderDirectCalComIframe(payload) {
  if (!schedulerEmbed) {
    return;
  }

  const iframeUrl = buildDirectCalComIframeUrl(payload);
  schedulerEmbed.hidden = false;
  schedulerEmbed.innerHTML = `
    <iframe
      src="${escapeHtmlAttribute(iframeUrl)}"
      title="Schedule your ECO Systems inspection"
      loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"
      allow="clipboard-write"
    ></iframe>
  `;

  renderSchedulerFallback("", false);
  setSchedulerStatus("Choose a date and time below to complete your booking.");
}

function buildDirectCalComIframeUrl(payload) {
  const url = new URL(CAL_COM_EXTERNAL_URL);
  url.searchParams.set("embed", "1");

  applyCalComPrefillParams(url.searchParams, payload);

  return url.toString();
}

function buildPrefilledCalComLink(payload) {
  const url = new URL(CAL_COM_EXTERNAL_URL);

  applyCalComPrefillParams(url.searchParams, payload);

  return `${url.pathname.replace(/^\/+/, "")}${url.search}`;
}

function applyCalComPrefillParams(searchParams, payload) {
  const prefill = buildCalComPrefillValues(payload);

  Object.entries(prefill).forEach(([key, value]) => {
    if (!value) {
      return;
    }

    searchParams.set(key, value);
  });
}

function buildCalComPrefillValues(payload) {
  const contact = payload?.contact || {};
  const property = payload?.property || {};
  const fullName = contact.fullName || contact.firstName || "";
  const parsedName = splitFullName(fullName);
  const email = contact.email || "";
  const phone = contact.phone ? `+1${contact.phone}` : "";
  const rawPhone = contact.phone || "";
  const address = formatAddressForDisplay(property);
  const addressNotes = buildCalComAddressNotes(address);

  return {
    name: fullName,
    firstName: parsedName.firstName || contact.firstName || "",
    lastName: parsedName.lastName || contact.lastName || "",
    email,
    attendeePhoneNumber: phone,
    attendeePhoneNUmber: phone,
    phone,
    phoneNumber: phone,
    mobile: phone,
    "phone-number": phone,
    "your-phone-number": phone,
    defaultPhoneCountry: rawPhone ? "us" : "",
    calTz: "America/Chicago",
    cal_tz: "America/Chicago",
    address,
    attendeeAddress: address,
    location: address ? "attendeeInPerson" : "",
    locationType: address ? "attendeeInPerson" : "",
    locationAddress: address,
    notes: addressNotes,
    YourAddress: address,
    "your-address": address,
    "organizer-address": address,
    "appointment-address": address,
    "property-address": address,
    "metadata[propertyAddress]": address,
    "metadata[phone]": phone
  };
}

function buildCalComConfig(payload) {
  const contact = payload.contact || {};
  const property = payload.property || {};
  const tracking = payload.tracking || {};
  const meta = payload.meta || {};
  const normalizedPhone = contact.phone ? `+1${contact.phone}` : "";
  const rawPhone = contact.phone || "";
  const propertyAddress = formatAddressForDisplay(property);
  const parsedName = splitFullName(contact.fullName || "");
  const addressNotes = buildCalComAddressNotes(propertyAddress);

  return {
    name: contact.fullName || contact.firstName || "",
    firstName: parsedName.firstName || contact.firstName || "",
    lastName: parsedName.lastName || contact.lastName || "",
    email: contact.email || "",
    attendeePhoneNumber: normalizedPhone,
    attendeePhoneNUmber: normalizedPhone,
    phone: normalizedPhone,
    phoneNumber: normalizedPhone,
    mobile: normalizedPhone,
    "phone-number": normalizedPhone,
    "your-phone-number": normalizedPhone,
    defaultPhoneCountry: rawPhone ? "us" : "",
    address: propertyAddress,
    attendeeAddress: propertyAddress,
    notes: addressNotes,
    YourAddress: propertyAddress,
    "your-address": propertyAddress,
    "organizer-address": propertyAddress,
    "appointment-address": propertyAddress,
    "property-address": propertyAddress,
    "metadata[source]": meta.source || "facebook-flat-roof-landing",
    "metadata[propertyAddress]": propertyAddress,
    "metadata[phone]": normalizedPhone,
    "metadata[utmSource]": tracking.utmSource || "facebook",
    "metadata[utmMedium]": tracking.utmMedium || "paid-social",
    "metadata[utmCampaign]": tracking.utmCampaign || "",
    "metadata[utmContent]": tracking.utmContent || ""
  };
}

function buildCalComAddressNotes(address) {
  if (!address) {
    return "";
  }

  return `Property address: ${address}`;
}

function renderSchedulerFallback(message, visible) {
  if (!schedulerFallback || !schedulerFallbackCopy) {
    return;
  }

  schedulerFallback.hidden = !visible;
  schedulerFallbackCopy.textContent = message || "";
}

function setSchedulerStatus(message, tone = "") {
  if (!schedulerStatus) {
    return;
  }

  schedulerStatus.textContent = message;
  schedulerStatus.className = "scheduler-status";
  if (tone) {
    schedulerStatus.classList.add(`is-${tone}`);
  }
}

function resetSchedulerState() {
  calComInitToken += 1;
  clearBookingStatusPollingTimer();

  if (schedulerShell) {
    schedulerShell.hidden = true;
  }

  if (schedulerEmbed) {
    schedulerEmbed.hidden = true;
    schedulerEmbed.innerHTML = "";
  }

  if (schedulerLaunchButton) {
    schedulerLaunchButton.hidden = true;
  }

  renderSchedulerFallback("", false);
  setSchedulerStatus("");
}

function initializeCalComApi() {
  bootstrapCalComApi();

  window.Cal("init", { origin: CAL_COM_ORIGIN });
}

function getCalComApi() {
  return window.Cal;
}

function bootstrapCalComApi() {
  if (typeof window.Cal === "function") {
    return;
  }

  (function bootstrapCal(C, A, L) {
    const push = function (target, args) {
      target.q.push(args);
    };
    const doc = C.document;
    C.Cal = C.Cal || function () {
      const cal = C.Cal;
      const args = arguments;

      if (!cal.loaded) {
        cal.ns = {};
        cal.q = cal.q || [];
        doc.head.appendChild(doc.createElement("script")).src = A;
        cal.loaded = true;
      }

      if (args[0] === L) {
        const api = function () {
          push(api, arguments);
        };
        const namespace = args[1];
        api.q = api.q || [];

        if (typeof namespace === "string") {
          cal.ns[namespace] = cal.ns[namespace] || api;
          push(cal.ns[namespace], args);
          push(cal, ["initNamespace", namespace]);
        } else {
          push(cal, args);
        }

        return;
      }

      push(cal, args);
    };
  })(window, "https://cal.com/embed.js", "init");
}

function registerCalComEventBindings() {
  if (calComEventBindingsRegistered || typeof window.Cal !== "function") {
    return;
  }

  window.Cal("on", {
    action: "bookerReady",
    callback() {
      calComReady = true;
      setSchedulerStatus("Choose a date and time below to complete your booking.");
    }
  });

  window.Cal("on", {
    action: "bookingSuccessfulV2",
    callback(event) {
      calComReady = true;
      const booking = event?.detail?.data || {};
      showBookedConfirmation(lastSubmittedLeadPayload, booking);
    }
  });

  window.Cal("on", {
    action: "linkFailed",
    callback() {
      renderDirectCalComIframe(lastSubmittedLeadPayload);
      setSchedulerStatus("Scheduler switched to the inline booking view.");
    }
  });

  calComEventBindingsRegistered = true;
}

function startBookingStatusPolling(payload) {
  clearBookingStatusPollingTimer();

  if (!API_BASE || !payload?.contact?.email) {
    return;
  }

  bookingStatusPollingStartedAt = Date.now();
  queueBookingStatusPoll(4000);
}

function queueBookingStatusPoll(delayMs = CAL_BOOKING_STATUS_POLL_INTERVAL_MS) {
  clearBookingStatusPollingTimer();

  if (!lastSubmittedLeadPayload || schedulerShell?.hidden || confirmationPanel?.hidden) {
    return;
  }

  bookingStatusPollTimer = window.setTimeout(() => {
    pollBookingStatusFromServer();
  }, Math.max(0, delayMs));
}

async function pollBookingStatusFromServer() {
  if (!lastSubmittedLeadPayload || schedulerShell?.hidden || confirmationPanel?.hidden) {
    return;
  }

  if (Date.now() - bookingStatusPollingStartedAt > CAL_BOOKING_STATUS_POLL_WINDOW_MS) {
    clearBookingStatusPollingTimer();
    return;
  }

  try {
    const statusUrl = new URL(`${API_BASE}/api/cal/booking-status`);
    statusUrl.searchParams.set("email", lastSubmittedLeadPayload.contact.email || "");
    statusUrl.searchParams.set("after", lastSubmittedLeadPayload.meta?.submittedAt || new Date().toISOString());

    const response = await fetch(statusUrl.toString(), {
      headers: {
        Accept: "application/json"
      }
    });
    const payload = await response.json().catch(() => ({}));

    if (response.ok && payload?.booking?.confirmed) {
      showBookedConfirmation(lastSubmittedLeadPayload, {
        uid: payload.booking.bookingUid || "",
        startTime: payload.booking.startTime || "",
        endTime: payload.booking.endTime || "",
        status: payload.booking.status || "accepted"
      });
      return;
    }
  } catch {
    // Ignore transient polling failures and keep waiting for a confirmed booking.
  }

  queueBookingStatusPoll();
}

function clearBookingStatusPollingTimer() {
  if (!bookingStatusPollTimer) {
    return;
  }

  window.clearTimeout(bookingStatusPollTimer);
  bookingStatusPollTimer = 0;
}

function trackMetaLeadSubmission(payload) {
  const eventId = payload?.tracking?.leadEventId || "";

  if (!eventId || typeof window.fbq !== "function") {
    return;
  }

  try {
    window.fbq(
      "track",
      "Lead",
      {
        content_name: "Flat Roof Lead",
        currency: "USD",
        value: 1
      },
      {
        eventID: eventId
      }
    );
  } catch {
    // Ignore browser pixel failures; the Worker sends the server-side companion event.
  }
}

function readCookieValue(name) {
  const encodedName = `${encodeURIComponent(name)}=`;
  const cookies = document.cookie ? document.cookie.split(";") : [];

  for (const cookie of cookies) {
    const trimmedCookie = cookie.trim();
    if (!trimmedCookie.startsWith(encodedName)) {
      continue;
    }

    return decodeURIComponent(trimmedCookie.slice(encodedName.length));
  }

  return "";
}

function buildMetaFbcValue(fbclid) {
  if (!fbclid) {
    return "";
  }

  return `fb.1.${Date.now()}.${fbclid}`;
}

function generateLeadEventId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `lead-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function schedulePostSubmitRedirect(payload, booking) {
  clearPostSubmitRedirectTimer();

  if (!POST_SUBMIT_PAGE_PATH) {
    return;
  }

  postSubmitRedirectTimer = window.setTimeout(() => {
    window.location.assign(buildPostSubmitPageUrl(payload, booking));
  }, Math.max(0, POST_SUBMIT_REDIRECT_DELAY_MS));
}

function clearPostSubmitRedirectTimer() {
  if (!postSubmitRedirectTimer) {
    return;
  }

  window.clearTimeout(postSubmitRedirectTimer);
  postSubmitRedirectTimer = 0;
}

function buildPostSubmitPageUrl(payload, booking) {
  const url = new URL(POST_SUBMIT_PAGE_PATH, window.location.href);

  if (POST_SUBMIT_VIDEO_URL) {
    url.searchParams.set("video", POST_SUBMIT_VIDEO_URL);
  }

  if (payload?.contact?.fullName) {
    url.searchParams.set("name", payload.contact.fullName);
  }

  if (booking?.startTime) {
    url.searchParams.set("appointment", booking.startTime);
  }

  return url.toString();
}

function isFormStarted() {
  if (currentStep > 0) {
    return true;
  }

  return Array.from(form.elements).some((field) => {
    if (!field?.name || field.name === "website") {
      return false;
    }

    if (field.type === "radio" || field.type === "checkbox") {
      return field.checked;
    }

    return String(field.value || "").trim().length > 0;
  });
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 720px), (pointer: coarse)").matches;
}

function shouldShowExitIntent() {
  return EXIT_INTENT_ENABLED && !hasSubmittedSuccessfully && !exitIntentShown && isFormStarted();
}

function readExitIntentShown() {
  try {
    return window.sessionStorage.getItem(EXIT_INTENT_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function persistExitIntentShown() {
  exitIntentShown = true;

  try {
    window.sessionStorage.setItem(EXIT_INTENT_SESSION_KEY, "1");
  } catch {
    return;
  }
}

function updateExitIntentLeaveLink() {
  if (!exitIntentLeaveLink) {
    return;
  }

  if (!pendingExitHref) {
    exitIntentLeaveLink.hidden = true;
    exitIntentLeaveLink.href = "https://ecosystemsca.com";
    return;
  }

  exitIntentLeaveLink.hidden = false;
  exitIntentLeaveLink.href = pendingExitHref;
}

function openExitIntent(options = {}) {
  if (!shouldShowExitIntent() || !exitIntentBackdrop || !exitIntentDialog || !exitIntentVideo) {
    return;
  }

  pendingExitHref = options.href || "";
  persistExitIntentShown();
  updateExitIntentLeaveLink();

  if (exitIntentTitle) {
    exitIntentTitle.textContent = EXIT_INTENT_HEADLINE;
  }

  if (exitIntentCopy) {
    exitIntentCopy.textContent = EXIT_INTENT_COPY;
  }

  exitIntentVideoLoaded = false;
  exitIntentVideo.src = "about:blank";
  exitIntentVideo.hidden = true;
  exitIntentVideoLaunch?.removeAttribute("hidden");
  exitIntentBackdrop.classList.add("is-visible");
  exitIntentBackdrop.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-exit-intent-open");
  exitIntentOpen = true;

  window.setTimeout(() => {
    exitIntentCloseButton?.focus();
  }, 0);
}

function closeExitIntent({ restoreFocus = false } = {}) {
  if (!exitIntentBackdrop || !exitIntentVideo) {
    return;
  }

  exitIntentBackdrop.classList.remove("is-visible");
  exitIntentBackdrop.setAttribute("aria-hidden", "true");
  exitIntentVideoLoaded = false;
  exitIntentVideo.src = "about:blank";
  exitIntentVideo.hidden = true;
  exitIntentVideoLaunch?.removeAttribute("hidden");
  document.body.classList.remove("is-exit-intent-open");
  exitIntentOpen = false;
  pendingExitHref = "";
  updateExitIntentLeaveLink();

  if (restoreFocus) {
    const activeStep = steps[currentStep];
    const focusTarget = activeStep?.querySelector("input, button, select, textarea");
    focusTarget?.focus();
  }
}

function handleDesktopExitIntent(event) {
  if (!shouldShowExitIntent() || isMobileViewport()) {
    return;
  }

  if (event.relatedTarget || event.toElement) {
    return;
  }

  if (event.clientY > 24) {
    return;
  }

  openExitIntent();
}

function loadExitIntentVideo() {
  if (!exitIntentVideo || !EXIT_INTENT_EMBED_URL || exitIntentVideoLoaded) {
    return;
  }

  exitIntentVideoLoaded = true;
  exitIntentVideo.hidden = false;
  exitIntentVideo.src = EXIT_INTENT_EMBED_URL;
  exitIntentVideoLaunch?.setAttribute("hidden", "hidden");
}

function shouldInterceptNavigation(anchor) {
  if (!shouldShowExitIntent() || !anchor) {
    return false;
  }

  if (anchor.closest("#exit-intent-dialog")) {
    return false;
  }

  const href = anchor.getAttribute("href") || "";
  if (!href || href.startsWith("#") || anchor.hasAttribute("download")) {
    return false;
  }

  const target = (anchor.getAttribute("target") || "").toLowerCase();
  return !target || target === "_self";
}

function handleDocumentNavigation(event) {
  const anchor = event.target.closest("a[href]");
  if (!shouldInterceptNavigation(anchor)) {
    return;
  }

  event.preventDefault();
  openExitIntent({ href: anchor.href });
}

function handleExitIntentKeydown(event) {
  if (event.key === "Escape" && exitIntentOpen) {
    closeExitIntent({ restoreFocus: true });
  }
}

function renderReviews() {
  if (!reviewsGrid) {
    return;
  }

  reviewsGrid.hidden = false;

  if (!reviews.length) {
    reviewsGrid.classList.remove("is-loading");
    reviewsGrid.innerHTML = `
      <article class="review-card review-card-fallback">
        <h3>See the full Google review profile</h3>
        <p class="review-body">We could not load featured reviews right now, but the full review profile is still available on Google.</p>
      </article>
    `;

    if (reviewsLoadMoreButton) {
      reviewsLoadMoreButton.hidden = true;
    }

    return;
  }

  const visibleReviews = reviews.slice(0, visibleReviewCount);
  reviewsGrid.classList.remove("is-loading");
  reviewsGrid.innerHTML = visibleReviews
    .map((review, reviewIndex) => {
      const stars = "★".repeat(Math.max(1, Number(review.rating || 5)));
      const authorName = escapeHtml(review.authorName || "Google Reviewer");
      const relativeTime = escapeHtml(review.relativeTime || "Google review");
      const reviewText = escapeHtml(review.text || "Great customer feedback is available on Google.");
      const isExpanded = expandedReviewIndexes.has(reviewIndex);
      const isExpandable = (review.text || "").trim().length > REVIEW_COLLAPSE_CHAR_LIMIT;
      const safeReviewSourceUrl = escapeHtml(review.sourceUrl || reviewsSourceUrl || GOOGLE_REVIEWS_URL);
      const avatarMarkup = buildReviewerAvatar(review);
      const ownerReplyMarkup = buildOwnerReply(review.ownerReply);

      return `
        <article class="review-card${isExpanded ? " is-expanded" : ""}">
          <div class="review-card-top">
            ${avatarMarkup}
            <div class="review-meta">
              <strong>${authorName}</strong>
              <span>${relativeTime}</span>
            </div>
          </div>
          <p class="review-stars" aria-label="${review.rating || 5} star review">${stars}</p>
          <p class="review-body${isExpanded ? " is-expanded" : " is-collapsed"}">${reviewText}</p>
          ${ownerReplyMarkup}
          <div class="review-card-actions">
            ${
              isExpandable
                ? `<button type="button" class="review-expand-button" data-review-toggle="${reviewIndex}" aria-expanded="${isExpanded ? "true" : "false"}">${isExpanded ? "Show less" : "Show more"}</button>`
                : ""
            }
            <a class="review-source-link" href="${safeReviewSourceUrl}" target="_blank" rel="noreferrer">Read on Google</a>
          </div>
        </article>
      `;
    })
    .join("");

  if (reviewsLoadMoreButton) {
    reviewsLoadMoreButton.hidden = visibleReviewCount >= reviews.length;
    reviewsLoadMoreButton.textContent = isLoadingMoreReviews ? "Loading..." : "Load More";
    reviewsLoadMoreButton.disabled = isLoadingMoreReviews;
  }
}

async function loadReviews() {
  if (REVIEW_DISPLAY_MODE === "iframe") {
    initializeIframeReviews();
    return;
  }

  try {
    await loadFeaturedReviews();
  } catch (error) {
    reviews = [];
    expandedReviewIndexes.clear();
    isLoadingMoreReviews = false;
    reviewSummary.textContent =
      "Google review highlights are temporarily unavailable. Use the button above to open the full Google review profile.";
    renderReviews();
  }
}

function initializeIframeReviews() {
  if (reviewsGrid) {
    reviewsGrid.hidden = true;
  }

  if (reviewIframeShell && reviewIframe && REVIEW_IFRAME_URL) {
    reviewIframeShell.hidden = false;
    reviewIframe.src = REVIEW_IFRAME_URL;
  }

  if (reviewSummary) {
    reviewSummary.innerHTML = `
      <strong>${escapeHtml(GOOGLE_BUSINESS_NAME)}</strong>
      customer reviews are available below, with the full Google review profile linked above.
    `;
  }

  if (socialProofScore) {
    socialProofScore.textContent = GOOGLE_REVIEW_SCORE ? GOOGLE_REVIEW_SCORE.toFixed(2) : "--";
  }

  if (socialProofCount) {
    socialProofCount.textContent = GOOGLE_REVIEW_COUNT ? `${GOOGLE_REVIEW_COUNT} reviews` : "Open Google reviews";
  }

  if (reviewsLoadMoreButton) {
    reviewsLoadMoreButton.hidden = true;
  }
}

async function loadFeaturedReviews() {
  const response = await fetch(`${API_BASE}/api/reviews`);
  if (!response.ok) {
    throw new Error("Unable to load review highlights.");
  }

  const payload = await response.json();
  reviews = payload.reviews || [];
  reviewsSourceUrl = payload.sourceUrl || GOOGLE_REVIEWS_URL;
  expandedReviewIndexes.clear();
  visibleReviewCount = Math.min(REVIEW_BATCH_SIZE, reviews.length || REVIEW_BATCH_SIZE);

  updateReviewSummary(payload);
  renderReviews();
}

function updateReviewSummary(payload) {
  const hasRating = payload.rating !== null && payload.rating !== undefined;
  const hasReviewCount = Number(payload.reviewCount || 0) > 0;

  if (hasRating && hasReviewCount) {
    const safeRating = escapeHtml(String(payload.rating));
    const safeReviewCount = escapeHtml(String(payload.reviewCount));
    reviewSummary.innerHTML = `
      <strong>${safeRating} / 5</strong>
      from ${safeReviewCount} Google reviews.
      Featured live Google reviews available through the Places API are shown below. Open Google for the full public review profile.
    `;
  } else {
    const safeBusinessName = escapeHtml(payload.businessName || GOOGLE_BUSINESS_NAME);
    reviewSummary.innerHTML = `
      <strong>${safeBusinessName}</strong>
      is connected to the exact ECO Systems Maps profile, but Google Places is not returning featured review highlights for that profile right now.
      Use the Google buttons to open the primary ECO Systems profile or the secondary Google review surface directly.
    `;
  }

  if (socialProofScore) {
    socialProofScore.textContent = hasRating ? Number(payload.rating).toFixed(2) : "--";
  }

  if (socialProofCount) {
    socialProofCount.textContent = hasReviewCount
      ? `${payload.reviewCount} reviews`
      : "Open Google reviews";
  }

  if (writeReviewLink) {
    writeReviewLink.href = payload.sourceUrl || GOOGLE_REVIEWS_URL;
  }

  if (allReviewsLink) {
    allReviewsLink.href = payload.alternateSourceUrl || GOOGLE_ALTERNATE_REVIEWS_URL;
  }
}

function initializeTurnstile(attempt = 0) {
  if (!TURNSTILE_ENABLED || !turnstileShell || !turnstileWidgetNode) {
    return;
  }

  turnstileShell.hidden = false;

  if (turnstileInitialized) {
    return;
  }

  if (!window.turnstile?.render) {
    if (attempt < 40) {
      window.setTimeout(() => initializeTurnstile(attempt + 1), 250);
    } else {
      setStatus("Security verification could not load. Please refresh the page and try again.", "error");
    }
    return;
  }

  turnstileWidgetId = window.turnstile.render(turnstileWidgetNode, {
    sitekey: TURNSTILE_SITE_KEY,
    appearance: "interaction-only",
    callback(token) {
      turnstileToken = token;
    },
    "expired-callback"() {
      turnstileToken = "";
    },
    "error-callback"() {
      turnstileToken = "";
      setStatus("Security verification could not load. Please refresh the page and try again.", "error");
    }
  });

  turnstileInitialized = true;
}

function resetTurnstileWidget() {
  turnstileToken = "";

  if (!TURNSTILE_ENABLED || turnstileWidgetId === null || !window.turnstile?.reset) {
    return;
  }

  window.turnstile.reset(turnstileWidgetId);
}

document.querySelectorAll("[data-next]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!validateStep(currentStep)) {
      return;
    }

    showStep(Math.min(currentStep + 1, steps.length - 1));
  });
});

document.querySelectorAll("[data-back]").forEach((button) => {
  button.addEventListener("click", () => {
    showStep(Math.max(currentStep - 1, 0));
  });
});

reviewsLoadMoreButton?.addEventListener("click", () => {
  visibleReviewCount = Math.min(visibleReviewCount + REVIEW_BATCH_SIZE, reviews.length);
  renderReviews();
});

reviewsGrid?.addEventListener("click", (event) => {
  const toggleButton = event.target.closest("[data-review-toggle]");
  if (!toggleButton) {
    return;
  }

  const reviewIndex = Number(toggleButton.getAttribute("data-review-toggle"));
  if (!Number.isInteger(reviewIndex)) {
    return;
  }

  if (expandedReviewIndexes.has(reviewIndex)) {
    expandedReviewIndexes.delete(reviewIndex);
  } else {
    expandedReviewIndexes.add(reviewIndex);
  }

  renderReviews();
});

document.addEventListener("mouseout", handleDesktopExitIntent);
document.addEventListener("click", handleDocumentNavigation, true);
document.addEventListener("keydown", handleExitIntentKeydown);

exitIntentBackdrop?.addEventListener("click", (event) => {
  if (event.target === exitIntentBackdrop) {
    closeExitIntent({ restoreFocus: true });
  }
});

exitIntentBackdrop?.addEventListener("pointerdown", (event) => {
  if (event.target === exitIntentBackdrop) {
    closeExitIntent({ restoreFocus: true });
  }
});

exitIntentCloseButton?.addEventListener("click", () => {
  closeExitIntent({ restoreFocus: true });
});

exitIntentCloseButton?.addEventListener("pointerup", () => {
  closeExitIntent({ restoreFocus: true });
});

exitIntentStayButton?.addEventListener("click", () => {
  closeExitIntent({ restoreFocus: true });
});

exitIntentDismissButton?.addEventListener("click", () => {
  closeExitIntent({ restoreFocus: true });
});

exitIntentVideoLaunch?.addEventListener("click", () => {
  loadExitIntentVideo();
});

form.addEventListener("submit", submitLead);
newRequestButton?.addEventListener("click", resetLeadForm);
schedulerLaunchButton?.addEventListener("click", () => {
  if (!lastSubmittedLeadPayload) {
    return;
  }

  prepareSchedulerState(lastSubmittedLeadPayload);
});
showStep(0);
initializeTurnstile();
loadReviews();

function buildReviewerAvatar(review) {
  const authorName = review.authorName || "Google Reviewer";
  const initials = escapeHtml(getReviewerInitials(authorName));
  const photoUrl = review.authorPhotoUrl ? escapeHtml(review.authorPhotoUrl) : "";

  if (photoUrl) {
    return `
      <div class="review-avatar">
        <img class="review-avatar-image" src="${photoUrl}" alt="${escapeHtml(authorName)} profile image" loading="lazy" referrerpolicy="no-referrer" />
      </div>
    `;
  }

  return `<div class="review-avatar review-avatar-fallback" aria-hidden="true">${initials}</div>`;
}

function getReviewerInitials(authorName) {
  const parts = String(authorName)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return "GR";
  }

  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function buildOwnerReply(ownerReply) {
  if (!ownerReply?.comment) {
    return "";
  }

  const safeComment = escapeHtml(ownerReply.comment);
  const safeRelativeTime = escapeHtml(ownerReply.relativeTime || "");

  return `
    <div class="review-owner-reply">
      <p class="review-owner-label">Response from ECO Systems</p>
      <p class="review-owner-text">${safeComment}</p>
      ${safeRelativeTime ? `<p class="review-owner-meta">${safeRelativeTime}</p>` : ""}
    </div>
  `;
}

function normalizePhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }

  if (digits.length === 10) {
    return digits;
  }

  return "";
}

function formatPhoneForDisplay(value) {
  const digits = normalizePhoneNumber(value);
  if (!digits) {
    return "";
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function formatAddressForDisplay(property) {
  const parts = [property.address, property.city, property.state, property.zip].filter(Boolean);
  return parts.join(", ");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value);
}

function normalizeCalComLink(value) {
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) {
    return { calLink: "", externalUrl: "" };
  }

  try {
    const parsedUrl = new URL(trimmedValue);
    if (!parsedUrl.hostname.includes("cal.com")) {
      return { calLink: "", externalUrl: "" };
    }

    const path = parsedUrl.pathname.replace(/^\/+|\/+$/g, "");
    if (!path) {
      return { calLink: "", externalUrl: "" };
    }

    return {
      calLink: path,
      externalUrl: parsedUrl.toString()
    };
  } catch {
    const normalizedPath = trimmedValue.replace(/^https?:\/\/[^/]+\//i, "").replace(/^\/+|\/+$/g, "");
    if (!normalizedPath) {
      return { calLink: "", externalUrl: "" };
    }

    return {
      calLink: normalizedPath,
      externalUrl: `https://cal.com/${normalizedPath}`
    };
  }
}

function splitFullName(fullName) {
  const normalized = fullName.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return { firstName: "", lastName: "" };
  }

  const parts = normalized.split(" ");
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ")
  };
}

function toYoutubeEmbedUrl(url) {
  const trimmedUrl = String(url || "").trim();
  if (!trimmedUrl) {
    return "";
  }

  try {
    const parsedUrl = new URL(trimmedUrl);
    let videoId = "";

    if (parsedUrl.hostname.includes("youtu.be")) {
      videoId = parsedUrl.pathname.replace(/^\//, "");
    } else if (parsedUrl.pathname.startsWith("/embed/")) {
      videoId = parsedUrl.pathname.split("/")[2] || "";
    } else if (parsedUrl.pathname.startsWith("/shorts/")) {
      videoId = parsedUrl.pathname.split("/")[2] || "";
    } else {
      videoId = parsedUrl.searchParams.get("v") || "";
    }

    if (!videoId) {
      return "";
    }

    return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1&playsinline=1`;
  } catch {
    return "";
  }
}
