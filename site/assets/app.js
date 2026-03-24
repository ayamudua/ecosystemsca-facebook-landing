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
const TURNSTILE_SITE_KEY = CONFIG.turnstileSiteKey || "";
const TURNSTILE_ENABLED = Boolean(TURNSTILE_SITE_KEY);

const form = document.querySelector("#estimate-form");
const steps = Array.from(document.querySelectorAll(".form-step"));
const statusNode = document.querySelector("#form-status");
const submitButton = document.querySelector("#submit-button");
const turnstileShell = document.querySelector("#turnstile-shell");
const turnstileWidgetNode = document.querySelector("#turnstile-widget");
const confirmationPanel = document.querySelector("#submission-confirmation");
const confirmationCopy = document.querySelector("#submission-confirmation-copy");
const confirmationDetails = document.querySelector("#submission-confirmation-details");
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
  return {
    utmSource: params.get("utm_source") || "facebook",
    utmMedium: params.get("utm_medium") || "paid-social",
    utmCampaign: params.get("utm_campaign") || "",
    utmContent: params.get("utm_content") || "",
    fbclid: params.get("fbclid") || ""
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
  setStatus("Submitting your request...", "");

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

    setStatus(
      payload.message || "Thanks. ECO Systems will follow up with your next step shortly.",
      "success"
    );
    hasSubmittedSuccessfully = true;
    closeExitIntent();
    showSubmissionConfirmation(payloadBody, payload.message);
    form.reset();
  } catch (error) {
    setStatus(
      `${error.message} If you need a faster answer, call or text 310-340-7777.`,
      "error"
    );
  } finally {
    resetTurnstileWidget();
    submitButton.disabled = false;
    submitButton.textContent = "Get My Estimate";
  }
}

function showSubmissionConfirmation(payload, message) {
  if (!confirmationPanel || !confirmationCopy || !confirmationDetails) {
    showStep(0);
    return;
  }

  clearConfirmationResetTimer();

  form.hidden = true;
  confirmationPanel.hidden = false;
  confirmationCopy.textContent =
    message || "ECO Systems has your request and will follow up after reviewing the property details you submitted.";
  confirmationDetails.innerHTML = `
    <p><strong>Name:</strong> ${escapeHtml(payload.contact.fullName || payload.contact.firstName || "")}</p>
    <p><strong>Mobile:</strong> ${escapeHtml(formatPhoneForDisplay(payload.contact.phone) || payload.contact.phone || "")}</p>
    <p><strong>Email:</strong> ${escapeHtml(payload.contact.email || "")}</p>
    <p><strong>Property:</strong> ${escapeHtml(formatAddressForDisplay(payload.property))}</p>
  `;

  confirmationResetTimer = window.setTimeout(() => {
    resetLeadForm();
    setStatus("");
  }, SUBMISSION_CONFIRMATION_RESET_MS);
}

function resetLeadForm() {
  clearConfirmationResetTimer();
  form.reset();
  hasSubmittedSuccessfully = false;
  confirmationPanel.hidden = true;
  confirmationDetails.innerHTML = "";
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
