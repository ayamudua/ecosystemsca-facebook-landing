const CONFIG = window.ECO_PROTOTYPE_CONFIG || {};
const API_BASE = String(CONFIG.apiBaseUrl || "").replace(/\/$/, "");
const CAL_NAMESPACE = String(CONFIG.calNamespace || "prototype").trim() || "prototype";
const CAL_COM = normalizeCalComLink(CONFIG.calComLink || "");
const CAL_BOOKING_STATUS_POLL_INTERVAL_MS = Number(CONFIG.calBookingStatusPollIntervalMs || 5000);
const CAL_BOOKING_STATUS_POLL_WINDOW_MS = Number(CONFIG.calBookingStatusPollWindowMs || 1800000);
const POST_SUBMIT_VIDEO_URL = String(CONFIG.postSubmitVideoUrl || "").trim();
const POST_SUBMIT_PAGE_PATH = String(CONFIG.postSubmitPagePath || "./prototype-post-submit-video.html").trim();
const POST_SUBMIT_REDIRECT_DELAY_MS = Number(CONFIG.postSubmitRedirectDelayMs || 2200);
const SUPPORT_PHONE_DISPLAY = CONFIG.supportPhoneDisplay || "310-340-7777";
const SUPPORT_PHONE_HREF = CONFIG.supportPhoneHref || "tel:3103407777";

const form = document.querySelector("#prototype-estimate-form");
const steps = Array.from(document.querySelectorAll("#prototype-estimate-form .form-step"));
const formStatus = document.querySelector("#prototype-form-status");
const bookingStage = document.querySelector("#prototype-booking-stage");
const bookingStatus = document.querySelector("#prototype-booking-status");
const bookingFallback = document.querySelector("#prototype-booking-fallback");
const bookingFallbackCopy = document.querySelector("#prototype-booking-fallback-copy");
const bookingCalendarShell = document.querySelector("#prototype-calendar-shell");
const bookingCalendarInline = document.querySelector("#my-cal-inline-prototype");
const launchBookingButton = document.querySelector("#prototype-launch-booking-button");
const editDetailsButton = document.querySelector("#prototype-edit-details-button");
const directCalendarLink = document.querySelector("#prototype-direct-calendar-link");
const bookingVideoLink = document.querySelector("#prototype-booking-video-link");
const recoveryCard = document.querySelector("#prototype-recovery-card");
const recoveryCopy = document.querySelector("#prototype-recovery-copy");
const retrySubmitButton = document.querySelector("#prototype-retry-submit-button");
const phoneLink = document.querySelector("#prototype-phone-link");
const confirmationPanel = document.querySelector("#prototype-confirmation");
const confirmationCopy = document.querySelector("#prototype-confirmation-copy");
const confirmationDetails = document.querySelector("#prototype-confirmation-details");
const redirectCopy = document.querySelector("#prototype-redirect-copy");
const videoLink = document.querySelector("#prototype-video-link");
const startOverButton = document.querySelector("#prototype-start-over-button");
const summaryName = document.querySelector("#prototype-summary-name");
const summaryEmail = document.querySelector("#prototype-summary-email");
const summaryPhone = document.querySelector("#prototype-summary-phone");
const summaryAddress = document.querySelector("#prototype-summary-address");

let currentStep = 0;
let pendingLeadPayload = null;
let pendingBooking = null;
let bookingSubmitInFlight = false;
let leadSubmitInFlight = false;
let leadSubmitMessage = "";
let calHandlersBound = false;
let calRenderToken = 0;
let postSubmitRedirectTimer = 0;
let bookingStatusPollTimer = 0;
let bookingStatusPollingStartedAt = 0;

phoneLink?.setAttribute("href", SUPPORT_PHONE_HREF);
phoneLink.textContent = `Call or text ECO Systems at ${SUPPORT_PHONE_DISPLAY}`;

if (bookingVideoLink) {
  bookingVideoLink.href = buildPostSubmitPageUrl();
}

showStep(0);

form?.querySelectorAll('input[name="county"]').forEach((input) => {
  input.addEventListener("change", () => {
    if (currentStep !== 0) {
      return;
    }

    setFormStatus("");
    showStep(1);
  });
});

document.querySelectorAll("#prototype-estimate-form [data-next]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!validateStep(currentStep)) {
      formStatus?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    showStep(Math.min(currentStep + 1, steps.length - 1));
  });
});

document.querySelectorAll("#prototype-estimate-form [data-back]").forEach((button) => {
  button.addEventListener("click", () => {
    showStep(Math.max(currentStep - 1, 0));
  });
});

launchBookingButton?.addEventListener("click", () => {
  startLeadSubmissionAndBooking();
});

editDetailsButton?.addEventListener("click", () => {
  if (bookingSubmitInFlight || leadSubmitInFlight) {
    return;
  }

  bookingStage.hidden = true;
  form.hidden = false;
  setBookingStatus("");
  setFormStatus("");
  showStep(2);
});

retrySubmitButton?.addEventListener("click", () => {
  startLeadSubmissionAndBooking();
});

startOverButton?.addEventListener("click", () => {
  resetPrototypeFlow();
});

function showStep(index) {
  currentStep = index;

  steps.forEach((step, stepIndex) => {
    const isActive = stepIndex === index;
    step.hidden = !isActive;
    step.classList.toggle("is-active", isActive);
  });

  setFormStatus("");
}

function setFormStatus(message, tone = "") {
  if (!formStatus) {
    return;
  }

  formStatus.textContent = message;
  formStatus.className = "form-status";
  if (tone) {
    formStatus.classList.add(`is-${tone}`);
  }
}

function setBookingStatus(message, tone = "") {
  if (!bookingStatus) {
    return;
  }

  bookingStatus.textContent = message;
  bookingStatus.className = "form-status prototype-booking-status";
  if (tone) {
    bookingStatus.classList.add(`is-${tone}`);
  }
}

function getRadioValue(name) {
  return form.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

function getFieldValue(name) {
  return form.elements[name]?.value?.trim() || "";
}

function validateStep(index) {
  const errors = [];

  if (index === 0 && !getRadioValue("county")) {
    errors.push("Please choose whether the property is in LA County.");
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
    setFormStatus(errors[0], "error");
    return false;
  }

  setFormStatus("");
  return true;
}

function buildPayload() {
  const parsedName = splitFullName(getFieldValue("fullName"));
  const normalizedPhone = normalizePhoneNumber(getFieldValue("phone"));
  const params = new URLSearchParams(window.location.search);

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
    tracking: {
      utmSource: params.get("utm_source") || "facebook-prototype",
      utmMedium: params.get("utm_medium") || "paid-social",
      utmCampaign: params.get("utm_campaign") || "integrated-booking-prototype",
      utmContent: params.get("utm_content") || "",
      fbclid: params.get("fbclid") || ""
    },
    meta: {
      source: "facebook-flat-roof-integrated-prototype",
      submittedAt: new Date().toISOString(),
      pageUrl: window.location.href
    },
    website: getFieldValue("website")
  };
}

async function startLeadSubmissionAndBooking() {
  if (!validateStep(2)) {
    return;
  }

  if (leadSubmitInFlight || bookingSubmitInFlight) {
    return;
  }

  const payloadBody = buildPayload();

  leadSubmitInFlight = true;
  recoveryCard.hidden = true;
  launchBookingButton.disabled = true;
  retrySubmitButton.disabled = true;
  if (editDetailsButton) {
    editDetailsButton.disabled = true;
  }
  setFormStatus("Recording your request before opening the calendar...", "success");

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
      throw new Error(payload.message || "Unable to record your request right now.");
    }

    leadSubmitMessage = payload.message || "Your request is recorded. Finish booking your appointment below.";
    openBookingStage(payloadBody);
  } catch (error) {
    pendingLeadPayload = null;
    pendingBooking = null;
    leadSubmitMessage = "";
    showLeadSubmitRecovery(error instanceof Error ? error.message : "Unable to record your request right now.");
    setFormStatus(
      `${error instanceof Error ? error.message : "Unable to record your request right now."} The calendar will not open until the lead is recorded.`,
      "error"
    );
  } finally {
    leadSubmitInFlight = false;
    launchBookingButton.disabled = false;
    retrySubmitButton.disabled = false;
    if (editDetailsButton) {
      editDetailsButton.disabled = false;
    }
  }
}

function openBookingStage(payloadBody) {
  pendingLeadPayload = payloadBody;
  pendingBooking = null;
  populateLeadSummary(pendingLeadPayload);

  recoveryCard.hidden = true;
  bookingFallback.hidden = true;
  if (directCalendarLink) {
    directCalendarLink.href = buildDirectCalComUrl(pendingLeadPayload);
  }
  if (bookingVideoLink) {
    bookingVideoLink.href = buildPostSubmitPageUrl(pendingLeadPayload);
  }

  form.hidden = true;
  confirmationPanel.hidden = true;
  if (editDetailsButton) {
    editDetailsButton.hidden = true;
  }
  bookingStage.hidden = false;
  setFormStatus("");
  setBookingStatus("Loading the appointment calendar...", "success");
  startBookingStatusPolling(pendingLeadPayload);
  renderPrototypeCalendar(pendingLeadPayload);
}

function populateLeadSummary(payload) {
  summaryName.textContent = payload.contact.fullName || payload.contact.firstName || "Not provided";
  summaryEmail.textContent = payload.contact.email || "Not provided";
  summaryPhone.textContent = formatPhoneForDisplay(payload.contact.phone) || payload.contact.phone || "Not provided";
  summaryAddress.textContent = formatAddressForDisplay(payload.property) || "Not provided";
}

function renderPrototypeCalendar(payload, attempt = 0, token = ++calRenderToken) {
  if (!CAL_COM.calLink || !bookingCalendarInline || !bookingCalendarShell) {
    renderPrototypeFallback("The prototype Cal.com link is not configured.");
    setBookingStatus("Calendar configuration is missing.", "error");
    return;
  }

  bootstrapCal();

  if (typeof window.Cal !== "function") {
    if (attempt < 40) {
      window.setTimeout(() => {
        if (token !== calRenderToken) {
          return;
        }

        renderPrototypeCalendar(payload, attempt + 1, token);
      }, 250);
      return;
    }

    renderPrototypeFallback("The prototype calendar loader did not become ready. Use the direct booking link instead.");
    setBookingStatus("Calendar failed to load. Use the backup link instead.", "error");
    return;
  }

  initializeNamespacedCal();
  registerCalHandlers();

  bookingCalendarInline.innerHTML = "";

  const namespaceApi = window.Cal?.ns?.[CAL_NAMESPACE];
  if (typeof namespaceApi !== "function") {
    if (attempt < 40) {
      window.setTimeout(() => {
        if (token !== calRenderToken) {
          return;
        }

        renderPrototypeCalendar(payload, attempt + 1, token);
      }, 250);
      return;
    }

    renderPrototypeFallback("The prototype calendar namespace did not initialize. Use the direct booking link instead.");
    setBookingStatus("Calendar failed to initialize. Use the backup link instead.", "error");
    return;
  }

  namespaceApi("inline", {
    elementOrSelector: "#my-cal-inline-prototype",
    config: {
      ...buildCalComConfig(payload),
      layout: "month_view",
      useSlotsViewOnSmallScreen: true
    },
    calLink: CAL_COM.calLink
  });

  namespaceApi("ui", {
    hideEventTypeDetails: false,
    layout: "month_view"
  });

  window.setTimeout(() => {
    if (token !== calRenderToken || pendingBooking) {
      return;
    }

    const iframe = bookingCalendarInline.querySelector("iframe");
    if (!iframe) {
      renderPrototypeIframeFallback(payload);
      setBookingStatus("Calendar switched to the direct embedded fallback view.", "success");
    }
  }, 5000);
}

function bootstrapCal() {
  if (typeof window.Cal === "function") {
    return;
  }

  (function bootstrap(C, A, L) {
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
  })(window, "https://app.cal.com/embed/embed.js", "init");
}

function initializeNamespacedCal() {
  window.Cal("init", CAL_NAMESPACE, { origin: "https://app.cal.com" });
}

function registerCalHandlers() {
  if (calHandlersBound || typeof window.Cal !== "function") {
    return;
  }

  window.Cal("on", {
    action: "bookerReady",
    callback() {
      setBookingStatus("Choose a date and time below to continue.", "success");
    }
  });

  window.Cal("on", {
    action: "bookingSuccessfulV2",
    callback(event) {
      pendingBooking = event?.detail?.data || {};
      setBookingStatus("Appointment booked. Preparing your next page...", "success");
      showSuccessConfirmation(
        pendingLeadPayload,
        pendingBooking,
        leadSubmitMessage || "Your request is recorded and your appointment is booked."
      );
    }
  });

  window.Cal("on", {
    action: "linkFailed",
    callback() {
      renderPrototypeIframeFallback(pendingLeadPayload);
      setBookingStatus("Calendar switched to the direct embedded fallback view.", "success");
    }
  });

  calHandlersBound = true;
}

function showSuccessConfirmation(payload, booking, message) {
  clearBookingStatusPollingTimer();
  bookingStage.hidden = true;
  confirmationPanel.hidden = false;
  confirmationCopy.textContent = message || "Your request is recorded and your appointment is booked.";

  if (videoLink) {
    videoLink.href = buildPostSubmitPageUrl(payload, booking);
  }

  if (redirectCopy) {
    redirectCopy.textContent = "Opening your follow-up page now.";
  }

  const formattedStartTime = booking?.startTime ? new Date(booking.startTime).toLocaleString() : "";
  confirmationDetails.innerHTML = `
    ${formattedStartTime ? `<p><strong>Appointment:</strong> ${escapeHtml(formattedStartTime)}</p>` : ""}
    <p><strong>Name:</strong> ${escapeHtml(payload.contact.fullName || payload.contact.firstName || "")}</p>
    <p><strong>Mobile:</strong> ${escapeHtml(formatPhoneForDisplay(payload.contact.phone) || payload.contact.phone || "")}</p>
    <p><strong>Email:</strong> ${escapeHtml(payload.contact.email || "")}</p>
    <p><strong>Property:</strong> ${escapeHtml(formatAddressForDisplay(payload.property))}</p>
    ${POST_SUBMIT_VIDEO_URL ? `<p><strong>Next step:</strong> Follow-up video</p>` : ""}
  `;

  schedulePostSubmitRedirect(payload, booking);
}

function showLeadSubmitRecovery(message) {
  recoveryCopy.textContent = `${message} Retry the lead submit to continue into the calendar, or call ECO Systems directly.`;
  recoveryCard.hidden = false;
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

  if (!pendingLeadPayload || pendingBooking || bookingStage.hidden) {
    return;
  }

  bookingStatusPollTimer = window.setTimeout(() => {
    pollBookingStatusFromServer();
  }, Math.max(0, delayMs));
}

async function pollBookingStatusFromServer() {
  if (!pendingLeadPayload || pendingBooking || bookingStage.hidden) {
    return;
  }

  if (Date.now() - bookingStatusPollingStartedAt > CAL_BOOKING_STATUS_POLL_WINDOW_MS) {
    clearBookingStatusPollingTimer();
    return;
  }

  try {
    const statusUrl = new URL(`${API_BASE}/api/cal/booking-status`);
    statusUrl.searchParams.set("email", pendingLeadPayload.contact.email || "");
    statusUrl.searchParams.set("after", pendingLeadPayload.meta?.submittedAt || new Date().toISOString());

    const response = await fetch(statusUrl.toString(), {
      headers: {
        Accept: "application/json"
      }
    });
    const payload = await response.json().catch(() => ({}));

    if (response.ok && payload?.booking?.confirmed) {
      pendingBooking = {
        uid: payload.booking.bookingUid || "",
        startTime: payload.booking.startTime || "",
        endTime: payload.booking.endTime || "",
        status: payload.booking.status || "accepted"
      };
      setBookingStatus("Appointment confirmed. Preparing your next page...", "success");
      showSuccessConfirmation(
        pendingLeadPayload,
        pendingBooking,
        leadSubmitMessage || "Your request is recorded and your appointment is booked."
      );
      return;
    }
  } catch {
    // Ignore transient polling failures and keep waiting for a confirmed booking.
  }

  queueBookingStatusPoll();
}

function schedulePostSubmitRedirect(payload, booking) {
  clearPostSubmitRedirectTimer();

  if (!POST_SUBMIT_PAGE_PATH) {
    if (redirectCopy) {
      redirectCopy.textContent = "The follow-up video page is not configured. Use the button above if needed.";
    }
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

function clearBookingStatusPollingTimer() {
  if (!bookingStatusPollTimer) {
    return;
  }

  window.clearTimeout(bookingStatusPollTimer);
  bookingStatusPollTimer = 0;
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

function renderPrototypeFallback(message) {
  bookingFallback.hidden = false;
  bookingFallbackCopy.textContent = message;
}

function renderPrototypeIframeFallback(payload) {
  if (!bookingCalendarInline) {
    return;
  }

  bookingCalendarInline.innerHTML = `
    <iframe
      src="${escapeHtmlAttribute(buildDirectCalComUrl(payload, true))}"
      title="Integrated booking calendar"
      loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"
      allow="clipboard-write"
    ></iframe>
  `;

  bookingFallback.hidden = false;
  bookingFallbackCopy.textContent = "If the inline calendar still behaves unexpectedly, open the direct booking page instead.";
}

function buildDirectCalComUrl(payload, embed = false) {
  const url = new URL(CAL_COM.externalUrl);

  applyCalComPrefillParams(url.searchParams, payload);

  if (embed) {
    url.searchParams.set("embed", "1");
  }

  return url.toString();
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

function buildCalComConfig(payload) {
  return buildCalComPrefillValues(payload);
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
    address,
    attendeeAddress: address,
    location: address ? "attendeeInPerson" : "",
    locationType: address ? "attendeeInPerson" : "",
    locationAddress: address,
    notes: address ? `Property address: ${address}` : "",
    YourAddress: address,
    "your-address": address,
    "appointment-address": address,
    "property-address": address,
    "metadata[source]": payload?.meta?.source || "facebook-flat-roof-integrated-prototype",
    "metadata[propertyAddress]": address,
    "metadata[phone]": phone,
    "metadata[utmSource]": payload?.tracking?.utmSource || "facebook-prototype",
    "metadata[utmMedium]": payload?.tracking?.utmMedium || "paid-social",
    "metadata[utmCampaign]": payload?.tracking?.utmCampaign || "integrated-booking-prototype"
  };
}

function resetPrototypeFlow() {
  clearPostSubmitRedirectTimer();
  clearBookingStatusPollingTimer();
  form.reset();
  pendingLeadPayload = null;
  pendingBooking = null;
  bookingSubmitInFlight = false;
  leadSubmitInFlight = false;
  leadSubmitMessage = "";
  bookingStatusPollingStartedAt = 0;
  bookingStage.hidden = true;
  confirmationPanel.hidden = true;
  recoveryCard.hidden = true;
  bookingFallback.hidden = true;
  if (editDetailsButton) {
    editDetailsButton.hidden = false;
  }
  bookingCalendarInline.innerHTML = "";
  form.hidden = false;
  setFormStatus("");
  setBookingStatus("");
  showStep(0);
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

function splitFullName(fullName) {
  const normalized = String(fullName || "").trim().replace(/\s+/g, " ");
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

function normalizeCalComLink(value) {
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) {
    return { calLink: "", externalUrl: "" };
  }

  try {
    const parsedUrl = new URL(trimmedValue);
    const path = parsedUrl.pathname.replace(/^\/+|\/+$/g, "");
    return {
      calLink: path,
      externalUrl: parsedUrl.toString()
    };
  } catch {
    const normalizedPath = trimmedValue.replace(/^https?:\/\/[^/]+\//i, "").replace(/^\/+|\/+$/g, "");
    return {
      calLink: normalizedPath,
      externalUrl: `https://cal.com/${normalizedPath}`
    };
  }
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