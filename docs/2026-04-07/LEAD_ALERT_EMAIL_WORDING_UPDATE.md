# April 7, 2026 Lead Alert Email Wording Update

## Objective

Change the owner lead-alert email subject and body wording to use the requested `LA Roof Estimate` format with contact name, phone number, and full address.

## Changes Made

- Updated the default lead-alert subject prefix from `New ECO Systems lead` to `LA Roof Estimate`.
- Changed the subject format to:
  - `LA Roof Estimate - Contact Name - Phone Number - Full Contact Address`
- Simplified the plain-text body to list:
  - `LA Roof Estimate`
  - contact name
  - phone number
  - full contact address
  - Google Maps link when available
- Simplified the HTML email body to show the same information and kept the address clickable through the Google Maps link.
- Preserved the existing CRM failure warning block for failed JobNimbus delivery attempts.

## Messaging Findings

- The new-lead owner alert email wording is controlled by the application in `worker/src/index.js`.
- The on-site appointment-success text shown after a Cal.com booking succeeds is also controlled by the application, not by Cal.com.
- The current frontend success copy lives in `site/assets/app.js` and includes:
  - `Your inspection appointment is scheduled.`
  - `Your inspection is booked for ... Check your email for the calendar invite and reminders.`
- The post-booking follow-up page wording is application-controlled in `site/assets/post-booking.js` and includes:
  - `keep this page open as you review the next-step video and prepare for your upcoming appointment.`
  - `Scheduled appointment: ...`
- The booking interface text inside the embedded Cal.com iframe is controlled by Cal.com.
- Cal.com also controls its own invite and reminder emails.
- The appointment SMS confirmed during this session is controlled by JobNimbus automation, not by this application and not by Cal.com.

## Files Touched

- `worker/src/index.js`
- `site/assets/app.js`
- `site/assets/post-booking.js`
- `docs/2026-04-07/LEAD_ALERT_EMAIL_WORDING_UPDATE.md`

## Validation

- Editor review completed against the current `worker/src/index.js` contents after the user's latest edits.
- `node --check worker/src/index.js` completed successfully after the lead-alert wording update.
- Reviewed the current frontend booking-success copy in `site/assets/app.js`.
- Reviewed the current post-booking copy in `site/assets/post-booking.js`.

## Remaining Notes

- The email subject itself cannot contain a clickable hyperlink, so only the HTML body address remains clickable.
- If the next change is to alter appointment-success wording shown to visitors, update the application files rather than Cal.com unless the text appears inside the embedded Cal.com widget or Cal.com-generated emails.