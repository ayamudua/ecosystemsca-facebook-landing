# April 2, 2026 JobNimbus Appointment Evaluation

## Objective

Evaluate how a successfully booked appointment is expected to flow into JobNimbus, explain why the appointment-status column may not have populated for a newly booked lead, and outline the lowest-risk solution paths without making runtime changes.

## Findings

- The current production Worker sends the initial lead to JobNimbus only during `POST /api/lead`; there is no later JobNimbus write in the booking webhook path.
- The booking webhook path currently stores booking confirmation data and updates Google Sheets appointment-status columns, but it does not create or update any JobNimbus appointment, task, note, or status.
- The Google Sheets appointment-status update depends on a successful Cal.com webhook delivery plus a row match by email, with property address used only as a soft secondary matcher.
- Because the lead is created in JobNimbus before the booking step, JobNimbus currently receives lead/contact data only unless a separate booking-to-CRM sync is added.

## Evidence Reviewed

- `worker/src/index.js`
  - `handleLead` posts the lead to JobNimbus and then logs the result to Google Sheets.
  - `handleCalWebhook` upserts booking confirmation state and calls `updateAppointmentScheduledInGoogleSheets`, but does not call any JobNimbus writer.
  - `buildLegacyContactPayload` and `buildPlatformPayload` build lead/contact payloads only.
- `docs/ECOSYSTEMS_ROOFING_LANDING_IMPLEMENTATION.md`
  - confirms `POST /api/lead` was built for lead validation, JobNimbus forwarding, and Google Sheets logging.
  - confirms the verified JobNimbus route is the contact-create path `https://app.jobnimbus.com/api1/contacts`.
- `README.md`
  - documents that the verified JobNimbus integration currently creates active `New` contacts through `api1/contacts`.
- `docs/FLAT_ROOF_APPOINTMENT_SCHEDULING_OPTIONS.md`
  - documents that the Worker writes `Appointment Scheduled? = No` at lead-submit time and later relies on Cal.com booking webhooks to update appointment-status columns.
  - records a prior production validation where a signed booking webhook updated the matching Google Sheets row to `Appointment Scheduled? = Yes`.

## Root Cause Assessment

For JobNimbus:

- There is no implemented appointment-sync feature for JobNimbus in this repository today. A successful booking cannot populate JobNimbus appointment data because no webhook or follow-up API call sends booking details into JobNimbus after the initial lead is created.

For the spreadsheet column not populating on today's booking:

- Most likely the Cal.com webhook for that booking did not reach the Worker, was rejected, or did not match the expected lead row strongly enough to update the intended row.
- Less likely but still possible: the sheet header differs from the supported names `Appointment Scheduled?` and `Appointment Completed?`, or the booking updated an older same-email row if duplicate leads exist for the same contact.

## Possible Solutions

### Option 1: Mirror bookings into JobNimbus notes on webhook

Lowest-risk CRM enhancement.

- Keep the current lead-first JobNimbus create path unchanged.
- On confirmed Cal.com webhook delivery, look up the corresponding JobNimbus contact and append a note containing appointment date/time, booking uid, organizer, and property address.
- This gives operations immediate booking visibility in the existing contact record without redesigning the CRM object model.

### Option 2: Mirror bookings into a JobNimbus task or appointment object

Better operational structure if the account supports it cleanly.

- Keep the current lead create flow.
- On booking webhook, create a second JobNimbus object linked to the matching contact if the API/account supports appointments, tasks, or jobs in a stable way.
- This is cleaner than notes, but it requires verifying the exact JobNimbus object and linking model available for this account.

### Option 3: Keep JobNimbus lead-only, rely on Google Sheets for booking status

Smallest operational change.

- Treat JobNimbus as the lead intake system only.
- Use the Cal.com webhook plus Google Sheets as the appointment-tracking system.
- If chosen, the main work is operational monitoring: verify webhook delivery logs, supported sheet headers, and duplicate-email matching behavior.

## Recommended Next Checks

1. In Cal.com, confirm a `Booking Created` webhook still points to the production Worker endpoint and is showing successful recent deliveries.
2. In Worker logs, look for today's booking at `POST /api/cal/webhook` and confirm whether it was accepted or rejected.
3. In Google Sheets, confirm the exact header text still includes `Appointment Scheduled?` or `Appointment Completed?`.
4. Check whether the booked lead email appears on multiple rows; if so, verify whether the newest same-email row is the one that should have been updated.
5. Decide whether JobNimbus should show booked appointments as a note, a task/appointment object, or remain lead-only.

## Files Referenced

- `worker/src/index.js`
- `README.md`
- `docs/ECOSYSTEMS_ROOFING_LANDING_IMPLEMENTATION.md`
- `docs/FLAT_ROOF_APPOINTMENT_SCHEDULING_OPTIONS.md`

## Validation

- Read the Worker lead and Cal.com webhook handlers.
- Verified the JobNimbus submission path is tied to `POST /api/lead` only.
- Verified the booking webhook path updates Google Sheets status columns and does not contain a JobNimbus write.
- Did not inspect live Cal.com account logs, live Worker tail output, or the production spreadsheet directly in this session.

## Follow-Up

- Use this note when deciding whether the next change should be webhook diagnostics only or a new JobNimbus booking-sync feature.

## April 2, 2026 Webhook URL and Signature Follow-Up

### Verified webhook URL

- The correct production Cal.com webhook target is `https://ecosystemsca.net/api/cal/webhook`.
- This is consistent across the implementation notes and the Worker route configuration.
- `worker/wrangler.toml` binds the production Worker to `ecosystemsca.net/api/*` and `www.ecosystemsca.net/api/*` while also leaving `workers_dev = true` enabled.
- For operational consistency, the intended production Cal.com target should remain the custom-domain URL `https://ecosystemsca.net/api/cal/webhook` instead of a preview hostname.

### Verified signature format

- The Worker expects header `x-cal-signature-256`.
- The Worker strips an optional `sha256=` prefix, lowercases the remainder, and compares it to a locally generated HMAC-SHA256 digest.
- The digest is computed over the exact raw request body text before JSON parsing.
- The expected digest format is lowercase hexadecimal, not base64.
- The shared secret source is Worker secret `CAL_COM_WEBHOOK_SECRET`.

### Practical implication

- Any change to whitespace, key order, or serialization of the JSON body before signing will break verification.
- Any mismatch between the Cal.com configured secret and Worker secret `CAL_COM_WEBHOOK_SECRET` will return `401 Webhook signature verification failed.` before a booking row is stored.
- Because no booking confirmation row exists for April 2, a signature failure remains one of the most credible explanations for today's missing appointment-status update.

### Evidence captured

- Production D1 `cal_booking_confirmations` returned no rows for April 2.
- The latest stored production booking record remains the March 30 test booking.
- That stored row includes `raw_payload_json`, which confirms the Worker persists the exact request body after successful verification.
- Local `.dev.vars` in this workspace does not contain `CAL_COM_WEBHOOK_SECRET`, and Cloudflare does not expose stored secret values back through Wrangler, so the exact production signature value could not be regenerated from this workspace alone.

### Recreate-signature procedure

Use the exact raw JSON body and the exact Cal.com shared secret value currently configured in production.

PowerShell example:

```powershell
$rawBody = '{"triggerEvent":"BOOKING_CREATED","createdAt":"2026-03-30T22:53:53.7204329Z","payload":{"uid":"booking-20260330175251","status":"accepted","type":"at-home-roof-estimate-and-inspection","eventTitle":"At Home Roof Estimate and Inspection","startTime":"2026-03-31T18:00:00.0000000Z","endTime":"2026-03-31T19:00:00.0000000Z","createdAt":"2026-03-30T22:52:53.7309188Z","organizer":{"name":"ECO Systems","email":"infoeco411@gmail.com"},"attendees":[{"name":"Appointment WebhookTest","email":"appt-test-20260330175251@ecosystemsca.net"}],"responses":{"YourAddress":"123 Test Ave 20260330175251","attendeePhoneNumber":"4244074459","email":"appt-test-20260330175251@ecosystemsca.net","name":"Appointment WebhookTest"},"metadata":{"propertyAddress":"123 Test Ave 20260330175251","phone":"4244074459"}}}'
$secret = 'REPLACE_WITH_CAL_COM_SHARED_SECRET'
$hmac = [System.Security.Cryptography.HMACSHA256]::new([System.Text.Encoding]::UTF8.GetBytes($secret))
$bytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($rawBody))
$hex = -join ($bytes | ForEach-Object { $_.ToString('x2') })
"x-cal-signature-256: sha256=$hex"
```

Node.js example:

```javascript
const crypto = require('crypto');

const rawBody = '{"triggerEvent":"BOOKING_CREATED","createdAt":"2026-03-30T22:53:53.7204329Z","payload":{"uid":"booking-20260330175251","status":"accepted","type":"at-home-roof-estimate-and-inspection","eventTitle":"At Home Roof Estimate and Inspection","startTime":"2026-03-31T18:00:00.0000000Z","endTime":"2026-03-31T19:00:00.0000000Z","createdAt":"2026-03-30T22:52:53.7309188Z","organizer":{"name":"ECO Systems","email":"infoeco411@gmail.com"},"attendees":[{"name":"Appointment WebhookTest","email":"appt-test-20260330175251@ecosystemsca.net"}],"responses":{"YourAddress":"123 Test Ave 20260330175251","attendeePhoneNumber":"4244074459","email":"appt-test-20260330175251@ecosystemsca.net","name":"Appointment WebhookTest"},"metadata":{"propertyAddress":"123 Test Ave 20260330175251","phone":"4244074459"}}}';
const secret = 'REPLACE_WITH_CAL_COM_SHARED_SECRET';
const hex = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
console.log(`x-cal-signature-256: sha256=${hex}`);
```

### Validation

- Read the Worker route registration and signature verification logic.
- Read the production Worker routing configuration.
- Queried production D1 booking confirmations to confirm the latest accepted booking payload and absence of April 2 webhook receipts.

## April 2, 2026 Production Webhook Secret Rotation

### Objective

- Rotate the production Cal.com webhook signing secret so production no longer shares the same secret previously used outside production.

### Action taken

- Generated a fresh random production secret value.
- Uploaded the new value to the production Worker environment as `CAL_COM_WEBHOOK_SECRET` using Wrangler secret management.
- Kept the existing verified production endpoint unchanged: `https://ecosystemsca.net/api/cal/webhook`.

### Operational implication

- Production webhook deliveries from Cal.com will now fail signature verification until the same new secret is saved into the active Cal.com webhook configuration that targets the production endpoint.
- No Worker code change or redeploy is required for this rotation because the verifier already reads `CAL_COM_WEBHOOK_SECRET` at runtime.

### Validation

- Wrangler reported successful upload of secret `CAL_COM_WEBHOOK_SECRET` to Worker environment `prd`.
- No live production webhook replay or new booking test was run after the rotation in this session.

## April 2, 2026 Cal.com Webhook Placement Guidance

### Scope finding

- Cal.com documents that webhook subscriptions can be associated at the user level and also with individual event types, including team event types.
- Because this landing flow depends on one specific booking experience, the safest operational setup is to attach the production webhook to the exact public event type used by the landing page instead of relying on a broader account-level webhook unless you intentionally want all event types to post to the same Worker.

### Recommended production setup

- Use one active production webhook for the actual event type used by the landing page booking flow.
- Point it to `https://ecosystemsca.net/api/cal/webhook`.
- Store the same new secret value in that webhook.
- Subscribe to `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, and `BOOKING_CANCELLED` because the Worker already maps those trigger names.
- Do not keep both a user-level webhook and an event-level webhook active for the same production booking events unless duplicate deliveries are intentional.

### Why this matters

- If the webhook is attached at the wrong scope, the public booking event type may never emit to the production Worker.
- If both scopes are active, the Worker may receive duplicate deliveries for the same booking and make troubleshooting harder even if idempotent storage protects the database path.

### Validation

- Reviewed Cal.com webhook documentation for subscription creation, secret usage, and scope behavior.
- Confirmed the Worker recognizes `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, and `BOOKING_CANCELLED` trigger names in the booking-status mapper.

## April 2, 2026 Cal.com Production Webhook Configuration Update

### Change applied

- Removed the broader system-level production webhook.
- Updated the event-level production webhook to use the rotated production secret.
- Kept the target endpoint as `https://ecosystemsca.net/api/cal/webhook`.

### Expected result

- New bookings for the landing-page event type should now deliver a single signed webhook to the production Worker.
- This removes the prior ambiguity between account-level scope and event-level scope while also isolating production from any reused non-production secret.

### Remaining validation

- A fresh booking or webhook replay is still required to confirm production delivery, signature acceptance, D1 persistence, and Google Sheets appointment-status update.

## April 2, 2026 Cal.com Free-Plan API Limitation Assessment

### New hypothesis reviewed

- Cal.com pricing publicly lists `Custom APIs` as a Teams-plan feature rather than a Free-plan feature.
- Cal.com public webhook documentation still documents creating webhook subscriptions, scope selection, trigger selection, and secret verification without calling out a paid-plan requirement on the webhook help page reviewed during this investigation.

### Assessment

- The current landing integration in this repository does not call the Cal.com API to create, fetch, or manage bookings.
- The current booking-status flow depends on Cal.com sending an outbound webhook to `POST /api/cal/webhook` after a booking is created, rescheduled, or cancelled.
- Because of that architecture, a Free-plan limitation on API keys or custom API endpoints does not by itself explain the missing spreadsheet appointment-status update.
- If the Cal.com account or UI truly prevents saving or delivering webhooks on the current plan, then that would explain the failure, but that is a webhook-availability problem rather than an API-consumption problem in this codebase.

### Practical conclusion

- Treat `Free plan does not include custom APIs` as a possible product-plan constraint, but not as the primary root cause for this specific implementation unless webhook creation or webhook delivery is also blocked on that plan.
- The more direct validation remains: confirm whether the event-level webhook can be saved, replayed, and delivered successfully to `https://ecosystemsca.net/api/cal/webhook`.
- If Cal.com support confirms that outbound webhooks are unavailable on the current plan, then the current spreadsheet appointment-status automation cannot work on that account without upgrading plans or switching to a different scheduling platform that supports outbound events.

### Validation

- Reviewed Cal.com pricing page for plan-scoped API language.
- Reviewed Cal.com webhook help documentation for webhook scope, trigger, and secret behavior.
- Cross-checked that this repository uses inbound webhooks rather than outbound Cal.com API requests for booking-status automation.

## April 3, 2026 Fresh Appointment Verification After Webhook Rotation

### Test performed

- After the production secret rotation and event-level webhook update, a fresh appointment was scheduled through the live flow.
- Production D1 was queried immediately afterward for the newest rows in `cal_booking_confirmations` and `meta_conversion_events`.

### Result

- No new booking confirmation row was created in `cal_booking_confirmations`.
- The latest stored booking confirmation remains the March 30 test record `booking-20260330175251`.
- No new `Schedule` record appeared in `meta_conversion_events`.

### Interpretation

- The fresh appointment still did not enter the Worker's accepted Cal.com webhook path.
- Because there is no new booking-confirmation row at all, the failure is happening before or during webhook acceptance, not later in Google Sheets matching.

## April 3, 2026 Event-Level Webhook Retest On Live Booking Event

### Test performed

- The broader system-level webhook was turned off again.
- The event-level webhook was re-enabled for the live Cal.com booking page `https://cal.com/eco-systems-roofing-la-county/at-home-roof-estimate-and-inspection`.
- A fresh booking was submitted from that exact public event page.
- Production D1 was queried immediately afterward for the newest rows in `cal_booking_confirmations` and `meta_conversion_events`.

### Result

- `cal_booking_confirmations` still contains only the previously accepted March 30 test booking row.
- No new `Schedule` event was written to `meta_conversion_events`.
- The event-level retest therefore produced no accepted booking receipt in production.

### Interpretation

- Reverting from system-level webhook back to the event-level webhook did not restore booking delivery.
- The public event slug in the stored successful March 30 record matches the event under test, so the failure is not explained by using the wrong event type slug alone.
- The strongest remaining explanations are now on the Cal.com delivery side: webhook trigger configuration, account-plan webhook availability, hidden delivery failure, or a request rejected before persistence.

### Validation

- Queried production D1 `cal_booking_confirmations` after the event-level retest and confirmed the newest row is still `booking-20260330175251`.
- Queried production D1 `meta_conversion_events` for `Schedule` records and confirmed no new downstream schedule event was created.

## April 3, 2026 Webhook Scope Reversal and Frontend Flow Clarification

### Operational change

- The event-level webhook was disabled.
- The broader system-level webhook was re-enabled using the same rotated production secret and the same production endpoint `https://ecosystemsca.net/api/cal/webhook`.
- This change was made because the only previously verified successful booking-status update happened while the webhook was configured at the broader calendar or system scope rather than the event scope.

### What this does and does not prove yet

- This scope change does not retroactively validate the webhook path.
- A fresh booking or webhook replay after the system-level webhook change is still required to confirm whether that broader subscription is the one Cal.com actually emits for the live booking flow.

### Frontend clarification

- The standalone scheduling page implemented in `site/assets/schedule.js` only embeds the Cal.com scheduler iframe and does not currently listen for a Cal.com booking-success callback or redirect to the post-booking page.
- The integrated landing-page flow implemented in `site/assets/app.js` does register Cal.com callbacks, including `bookingSuccessfulV2`, and does call `showBookedConfirmation` plus `schedulePostSubmitRedirect` after success.
- Because of that split, a missing post-booking page load only helps diagnose the integrated landing-page flow; it is not evidence by itself when testing through the standalone `schedule.html` flow.

### Current recommended validation

- Keep the production tail or direct D1 checks ready.
- Trigger one fresh booking after the system-level webhook change.
- If a new row appears in `cal_booking_confirmations`, the webhook scope was the problem.
- If no row appears again, the remaining likely causes are plan-level webhook restrictions, incorrect trigger selection, or delivery rejection before persistence.
- With the endpoint corrected and the secret rotated, the remaining likely causes are:
  - the event-level webhook is attached to the wrong Cal.com event type,
  - the relevant booking triggers are not enabled on that webhook,
  - the Cal.com account plan does not actually deliver outbound webhooks for this configuration,
  - or the webhook request is still being rejected before persistence.

### Practical next action

- In Cal.com, verify the webhook is attached to the exact public event type used by the landing page and that `BOOKING_CREATED` is enabled.
- If Cal.com supports webhook replay or delivery logs for that event-level subscription, inspect whether the latest attempt shows delivered, skipped, or failed.
- If delivery logs are unavailable or webhooks appear plan-restricted, treat plan capability as the most likely root cause.

### Validation

- Queried production D1 table `cal_booking_confirmations` for the most recent accepted booking rows.
- Queried production D1 table `meta_conversion_events` for the most recent `Schedule` rows.

## April 3, 2026 Fresh Appointment Verification After System-Level Webhook Re-Enable

### Test performed

- After disabling the event-level webhook and re-enabling the broader system-level webhook with the same rotated production secret, a fresh appointment was scheduled through the live flow.
- Production D1 was queried immediately afterward for the newest rows in `cal_booking_confirmations` and `meta_conversion_events`.

### Result

- No new booking confirmation row was created in `cal_booking_confirmations`.
- The latest stored booking confirmation is still the March 30 test record `booking-20260330175251`.
- No new `Schedule` record appeared in `meta_conversion_events`.

### Interpretation

- Reverting from event-level scope back to system-level scope did not restore booking webhook delivery for the fresh test appointment.
- Because no booking-confirmation row exists for the fresh test, the Worker still did not accept any webhook request for that booking.
- This makes Google Sheets row matching and JobNimbus follow-up behavior non-factors for the current failure because the booking never entered the accepted webhook path.

### Narrowed likely causes

- Cal.com is not delivering outbound webhooks for the current account or plan configuration.
- The system-level webhook is enabled but the relevant trigger such as `BOOKING_CREATED` is not selected.
- Cal.com is sending the webhook to a different endpoint or environment than the production Worker target `https://ecosystemsca.net/api/cal/webhook`.
- The request is being rejected before persistence, although the repeated absence of any accepted row now makes an account-side delivery issue more likely than a downstream matching problem.

### Validation

- Queried production D1 table `cal_booking_confirmations` after the fresh booking and confirmed no new accepted booking row.
- Queried production D1 table `meta_conversion_events` after the fresh booking and confirmed no new `Schedule` event.