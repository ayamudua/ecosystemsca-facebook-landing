const scheduleConfig = window.ECO_SCHEDULE_CONFIG || {};
const scheduleFrame = document.querySelector("#schedule-frame");
const scheduleFrameShell = document.querySelector("#schedule-frame-shell");
const scheduleFrameStatus = document.querySelector("#schedule-frame-status");
const scheduleFrameFallback = document.querySelector("#schedule-frame-fallback");
const scheduleFrameFallbackCopy = document.querySelector("#schedule-frame-fallback-copy");
const scheduleSummaryStatus = document.querySelector("#schedule-summary-status");
const scheduleDirectLink = document.querySelector("#schedule-direct-link");
const scheduleHomeLink = document.querySelector("#schedule-home-link");
const schedulePhoneLink = document.querySelector("#schedule-phone-link");
const scheduleName = document.querySelector("#schedule-name");
const scheduleEmail = document.querySelector("#schedule-email");
const schedulePhone = document.querySelector("#schedule-phone");
const scheduleAddress = document.querySelector("#schedule-address");

const SCHEDULE_PAGE_PARAMS = new URLSearchParams(window.location.search);
const CAL_COM_URL = String(scheduleConfig.calComLink || "").trim();
const SUPPORT_PHONE_DISPLAY = scheduleConfig.supportPhoneDisplay || "310-340-7777";
const SUPPORT_PHONE_HREF = scheduleConfig.supportPhoneHref || "tel:3103407777";
const HOME_PATH = scheduleConfig.homePath || "./index.html";

initializeSchedulePage();

function initializeSchedulePage() {
  hydrateSummary();
  wireStaticLinks();

  if (!CAL_COM_URL) {
    showFallback("The scheduling page is not configured yet. Call or text ECO Systems and they can book your inspection manually.");
    return;
  }

  if (!hasLeadPrefillData()) {
    showFallback("This scheduling page is missing your lead details. Return to the form, submit your information again, and then book your appointment.");
    return;
  }

  const directUrl = buildCalComUrl({ embed: false });
  const iframeUrl = buildCalComUrl({ embed: true });

  if (scheduleDirectLink) {
    scheduleDirectLink.href = directUrl;
  }

  if (!scheduleFrame) {
    showFallback("The scheduling frame is unavailable on this page. Use the direct scheduling link above instead.");
    return;
  }

  scheduleFrame.src = iframeUrl;
  scheduleFrameShell.hidden = false;
  scheduleFrameStatus.textContent = "Choose a time below to complete your booking.";
}

function hydrateSummary() {
  const name = firstParamValue(["name", "firstName"]);
  const email = firstParamValue(["email"]);
  const phone = firstParamValue([
    "attendeePhoneNUmber",
    "attendeePhoneNumber",
    "phone",
    "phoneNumber"
  ]);
  const address = firstParamValue([
    "YourAddress",
    "your-address",
    "appointment-address",
    "property-address",
    "address"
  ]);

  if (scheduleName) {
    scheduleName.textContent = name || "Not provided";
  }

  if (scheduleEmail) {
    scheduleEmail.textContent = email || "Not provided";
  }

  if (schedulePhone) {
    schedulePhone.textContent = formatPhoneForDisplay(phone) || phone || "Not provided";
  }

  if (scheduleAddress) {
    scheduleAddress.textContent = address || "Not provided";
  }

  if (scheduleSummaryStatus) {
    scheduleSummaryStatus.textContent = SCHEDULE_PAGE_PARAMS.get("submitted") === "1"
      ? "Lead captured. Your details are ready for booking."
      : "Review your details, then choose a time.";
  }
}

function wireStaticLinks() {
  if (scheduleHomeLink) {
    scheduleHomeLink.href = HOME_PATH;
  }

  if (schedulePhoneLink) {
    schedulePhoneLink.href = SUPPORT_PHONE_HREF;
    schedulePhoneLink.textContent = `Call or text ECO Systems at ${SUPPORT_PHONE_DISPLAY}`;
  }
}

function hasLeadPrefillData() {
  return Boolean(
    firstParamValue(["name", "firstName"]) &&
      firstParamValue(["email"]) &&
      firstParamValue(["YourAddress", "your-address", "appointment-address", "property-address", "address"])
  );
}

function buildCalComUrl({ embed }) {
  const url = new URL(CAL_COM_URL);

  SCHEDULE_PAGE_PARAMS.forEach((value, key) => {
    if (!value || key === "submitted") {
      return;
    }

    url.searchParams.set(key, value);
  });

  if (embed) {
    url.searchParams.set("embed", "1");
  }

  return url.toString();
}

function showFallback(message) {
  if (scheduleFrameShell) {
    scheduleFrameShell.hidden = true;
  }

  if (scheduleFrameFallback) {
    scheduleFrameFallback.hidden = false;
  }

  if (scheduleFrameFallbackCopy) {
    scheduleFrameFallbackCopy.textContent = message;
  }

  if (scheduleFrameStatus) {
    scheduleFrameStatus.textContent = "Scheduling could not be loaded automatically.";
  }
}

function firstParamValue(keys) {
  for (const key of keys) {
    const value = String(SCHEDULE_PAGE_PARAMS.get(key) || "").trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function formatPhoneForDisplay(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return value;
}