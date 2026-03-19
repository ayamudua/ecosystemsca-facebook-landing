const CONFIG = window.ECO_LANDING_CONFIG || {};
const API_BASE = (CONFIG.apiBaseUrl || "").replace(/\/$/, "");
const GOOGLE_PLACE_ID = CONFIG.googlePlaceId || "ChIJy_dFYaGbwoARVTiEWMoxkpY";
const GOOGLE_REVIEWS_URL =
  CONFIG.googleReviewsUrl ||
  "https://www.google.com/maps/search/?api=1&query=Google&query_place_id=ChIJy_dFYaGbwoARVTiEWMoxkpY";
const GOOGLE_WRITE_REVIEW_URL = GOOGLE_REVIEWS_URL;

const form = document.querySelector("#estimate-form");
const steps = Array.from(document.querySelectorAll(".form-step"));
const statusNode = document.querySelector("#form-status");
const submitButton = document.querySelector("#submit-button");
const confirmationPanel = document.querySelector("#submission-confirmation");
const confirmationCopy = document.querySelector("#submission-confirmation-copy");
const confirmationDetails = document.querySelector("#submission-confirmation-details");
const newRequestButton = document.querySelector("#new-request-button");
const reviewsGrid = document.querySelector("#reviews-grid");
const reviewsLoadMoreButton = document.querySelector("#reviews-load-more");
const reviewSummary = document.querySelector("#reviews-summary");
const allReviewsLink = document.querySelector("#all-reviews-link");
const writeReviewLink = document.querySelector("#write-review-link");
const socialProofScore = document.querySelector("#social-proof-score");
const socialProofCount = document.querySelector("#social-proof-count");
const expandedReviewIndexes = new Set();

const REVIEW_BATCH_SIZE = 6;
const REVIEW_COLLAPSE_CHAR_LIMIT = 260;

let currentStep = 0;
let reviews = [];
let visibleReviewCount = REVIEW_BATCH_SIZE;
let reviewsSourceUrl = GOOGLE_REVIEWS_URL;
let reviewSourceMode = "places";
let archivePage = 0;
let archiveHasMore = false;
let isLoadingMoreReviews = false;

if (allReviewsLink) {
  allReviewsLink.href = GOOGLE_REVIEWS_URL;
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
      pageUrl: window.location.href
    },
    website: getFieldValue("website")
  };
}

async function submitLead(event) {
  event.preventDefault();
  if (!validateStep(2)) {
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
    showSubmissionConfirmation(payloadBody, payload.message);
    form.reset();
  } catch (error) {
    setStatus(
      `${error.message} If you need a faster answer, call or text 310-340-7777.`,
      "error"
    );
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Get My Estimate";
  }
}

function showSubmissionConfirmation(payload, message) {
  if (!confirmationPanel || !confirmationCopy || !confirmationDetails) {
    showStep(0);
    return;
  }

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
}

function resetLeadForm() {
  form.reset();
  confirmationPanel.hidden = true;
  confirmationDetails.innerHTML = "";
  form.hidden = false;
  showStep(0);
}

function renderReviews() {
  if (!reviewsGrid) {
    return;
  }

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
    reviewsLoadMoreButton.hidden = reviewSourceMode === "archive" ? !archiveHasMore : visibleReviewCount >= reviews.length;
    reviewsLoadMoreButton.textContent = isLoadingMoreReviews ? "Loading..." : "Load More";
    reviewsLoadMoreButton.disabled = isLoadingMoreReviews;
  }
}

async function loadReviews() {
  try {
    await loadArchiveReviews({ append: false });
  } catch (error) {
    try {
      await loadFeaturedReviews();
    } catch {
      reviewSourceMode = "places";
      archivePage = 0;
      archiveHasMore = false;
      reviews = [];
      expandedReviewIndexes.clear();
      isLoadingMoreReviews = false;
      reviewSummary.textContent =
        "Google review highlights are temporarily unavailable. Use the button above to open the full Google review profile.";
      renderReviews();
    }
  }
}

async function loadArchiveReviews({ append }) {
  const nextPage = append ? archivePage + 1 : 1;
  isLoadingMoreReviews = append;
  renderReviews();

  const response = await fetch(`${API_BASE}/api/reviews/archive?page=${nextPage}&pageSize=${REVIEW_BATCH_SIZE}`);
  if (!response.ok) {
    isLoadingMoreReviews = false;
    throw new Error("Archived reviews are not available.");
  }

  const payload = await response.json();
  reviewSourceMode = "archive";
  archivePage = payload.page || nextPage;
  archiveHasMore = Boolean(payload.hasMore);
  reviewsSourceUrl = payload.sourceUrl || GOOGLE_REVIEWS_URL;
  expandedReviewIndexes.clear();
  reviews = append ? reviews.concat(payload.reviews || []) : payload.reviews || [];
  visibleReviewCount = reviews.length;
  isLoadingMoreReviews = false;

  updateReviewSummary(payload, true);
  renderReviews();
}

async function loadFeaturedReviews() {
  const response = await fetch(`${API_BASE}/api/reviews`);
  if (!response.ok) {
    throw new Error("Unable to load review highlights.");
  }

  const payload = await response.json();
  reviewSourceMode = "places";
  archivePage = 0;
  archiveHasMore = false;
  reviews = payload.reviews || [];
  reviewsSourceUrl = payload.sourceUrl || GOOGLE_REVIEWS_URL;
  expandedReviewIndexes.clear();
  visibleReviewCount = Math.min(REVIEW_BATCH_SIZE, reviews.length || REVIEW_BATCH_SIZE);

  updateReviewSummary(payload, false);
  renderReviews();
}

function updateReviewSummary(payload, isArchive) {
  const safeRating = escapeHtml(String(payload.rating || "4.9"));
  const safeReviewCount = escapeHtml(String(payload.reviewCount || reviews.length || "many"));

  reviewSummary.innerHTML = isArchive
    ? `
      <strong>${safeRating} / 5</strong>
      from ${safeReviewCount} synced Google reviews.
      This archive is served from ECO Systems' verified business-profile review sync and includes owner responses when available.
    `
    : `
      <strong>${safeRating} / 5</strong>
      from ${safeReviewCount} Google reviews.
      Featured Google reviews available through the API are shown below. Open Google for the full public archive.
    `;

  if (socialProofScore) {
    socialProofScore.textContent = Number(payload.rating || 5).toFixed(2);
  }

  if (socialProofCount) {
    socialProofCount.textContent = `${payload.reviewCount || reviews.length || 0} reviews`;
  }

  if (payload.sourceUrl) {
    allReviewsLink.href = payload.sourceUrl;
    if (writeReviewLink) {
      writeReviewLink.href = payload.sourceUrl;
    }
  }
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
  if (reviewSourceMode === "archive") {
    loadArchiveReviews({ append: true }).catch(() => {
      isLoadingMoreReviews = false;
      renderReviews();
    });
    return;
  }

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

form.addEventListener("submit", submitLead);
newRequestButton?.addEventListener("click", resetLeadForm);
showStep(0);
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
