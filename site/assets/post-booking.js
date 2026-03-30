const followUpConfig = window.ECO_POST_BOOKING_CONFIG || {};
const followUpVideo = document.querySelector("#follow-up-video");
const followUpHomeLink = document.querySelector("#follow-up-home-link");
const followUpHeaderCopy = document.querySelector("#follow-up-header-copy");
const followUpBodyCopy = document.querySelector("#follow-up-body-copy");
const followUpAppointment = document.querySelector("#follow-up-appointment");

const followUpParams = new URLSearchParams(window.location.search);
const followUpName = followUpParams.get("name") || "";
const followUpAppointmentTime = followUpParams.get("appointment") || "";
const followUpVideoUrl = followUpParams.get("video") || followUpConfig.videoUrl || "";

if (followUpVideo && followUpVideoUrl) {
  followUpVideo.src = followUpVideoUrl;
}

if (followUpHomeLink && followUpConfig.homePath) {
  followUpHomeLink.href = followUpConfig.homePath;
}

if (followUpHeaderCopy && followUpName) {
  followUpHeaderCopy.textContent = `${followUpName}, keep this page open as you review the next-step video and prepare for your upcoming appointment.`;
}

if (followUpBodyCopy && followUpName) {
  followUpBodyCopy.textContent = `${followUpName}, here is what to expect next from ECO Systems before your inspection.`;
} else if (followUpBodyCopy) {
  followUpBodyCopy.remove();
}

if (followUpAppointment) {
  const formatted = formatAppointmentTime(followUpAppointmentTime);
  followUpAppointment.textContent = formatted
    ? `Scheduled appointment: ${formatted}`
    : "Your appointment is booked. Check your email for the invite and reminders.";
}

function formatAppointmentTime(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}