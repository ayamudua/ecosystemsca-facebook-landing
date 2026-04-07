# April 6, 2026 Cal.com Paid API And JobNimbus Status Options

## Objective

Evaluate whether ECO Systems should switch from the current Cal.com webhook pattern to the paid Cal.com API for appointment-status syncing, and determine the most practical way to send scheduled-appointment status into JobNimbus so JobNimbus can send the SMS follow-up.

## Current State Confirmed

- The landing flow creates the lead in JobNimbus only during `POST /api/lead`.
- The booking path currently depends on `POST /api/cal/webhook` for accepted Cal.com booking events.
- The booking webhook path writes booking confirmations to D1 and updates Google Sheets appointment-status columns, but it does not currently write anything back to JobNimbus.
- The repository does not currently persist a JobNimbus contact id for later booking-driven CRM updates.

## External Capability Review

### Cal.com paid API

- Cal.com v2 booking endpoints now support authenticated reads of booking data with booking status, attendee details, booking uid, event type, created-at, and updated-at timestamps.
- The list-bookings endpoint supports filters such as `status`, `attendeeEmail`, `bookingUid`, `eventTypeId`, `afterCreatedAt`, and `afterUpdatedAt`.
- The single-booking endpoint supports direct lookup by booking uid.
- This means a paid account can now be used to fetch booking state programmatically instead of relying only on webhook deliveries for observability.

### Cal.com webhooks

- Cal.com still exposes webhook subscriptions for booking lifecycle events including `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, and `BOOKING_CANCELLED`.
- Webhooks remain the only direct push-style event signal confirmed in this review.
- API access improves recovery and verification, but it does not remove the need for an event trigger if the business wants near-immediate CRM updates and SMS automation.

### JobNimbus platform surface

- The current repository has only verified one JobNimbus path in this account: contact creation through the legacy route `api1/contacts`.
- Official JobNimbus platform docs currently expose `https://api.jobnimbus.com` and include `v1/activities` endpoints, which suggests a structured follow-up object exists for timeline or activity logging.
- This session did not validate a concrete JobNimbus contact-update, note-create, or appointment-create request against the live account, so those paths remain implementation candidates rather than proven behavior.

## Assessment

### Can the paid Cal.com API replace the webhook?

Technically yes, but it is a weaker primary architecture for this funnel.

Why:

- Polling the Cal.com API creates latency between booking and CRM update unless the system polls aggressively.
- Polling increases operational complexity: scheduling, rate-limit handling, deduplication, and replay windows.
- Polling requires a reliable correlation key. Today the Worker does not store a Cal.com booking uid at lead-submit time because the booking does not exist yet.
- Polling by attendee email alone is workable for reconciliation, but weaker than a direct event because duplicates, reschedules, and older bookings must be disambiguated.
- Webhooks are a better fit for "send JobNimbus status as soon as the appointment is set".

### What does the paid API help with now?

It meaningfully improves the existing webhook design.

Best uses:

- Reconcile missing webhook deliveries by querying recent bookings after lead submission.
- Backfill booking state when webhook acceptance is uncertain.
- Verify cancellation and reschedule state by checking the latest booking status for a known attendee or booking uid.
- Build an admin diagnostic or scheduled audit job that compares recent leads against recent Cal.com bookings.

## Option Comparison

### Option 1: Webhook-first, Cal.com API as reconciliation layer

Recommended option.

- Keep `POST /api/cal/webhook` as the primary real-time signal.
- Add paid-API lookup only for retry, repair, validation, and gap-filling.
- On confirmed `BOOKING_CREATED` or accepted booking state, update JobNimbus immediately.
- If the webhook is missed, run a reconciliation job or on-demand lookup by attendee email plus time window to recover the status.

Pros:

- Real-time enough for JobNimbus SMS automation.
- Lowest behavioral drift from the current implementation.
- Better diagnosability than webhooks alone.

Cons:

- Still depends on getting webhook configuration correct.
- Adds secondary sync logic for recovery.

### Option 2: Pure Cal.com API polling

Possible, but not recommended as the primary source.

- After every successful lead, schedule repeated booking lookups for that email over a short time window.
- When a booking appears or changes status, write the result to JobNimbus.

Pros:

- Avoids depending on outbound webhook delivery.
- Easier to inspect and replay from your side once API credentials are working.

Cons:

- Delayed appointment-to-SMS timing unless polling is aggressive.
- More moving parts than event-driven delivery.
- Higher risk of duplicate or ambiguous matches when a contact books multiple times.
- Wasteful compared with a push-based event when the business only needs state change notifications.

### Option 3: Keep JobNimbus lead-only and use Sheets as the appointment tracker

Operationally simplest, but it does not satisfy the stated SMS goal well.

- Maintain the current lead create flow.
- Let Cal.com continue updating internal tracking only.
- Use Sheets or manual follow-up for booked appointments.

Pros:

- Minimal engineering change.

Cons:

- Does not give JobNimbus the appointment event needed to trigger automated SMS in CRM.

## Best JobNimbus Sync Shapes

### Option A: Update the JobNimbus contact status

Most likely best fit if JobNimbus automations can send SMS from a status transition.

- Create the lead/contact exactly as today.
- Persist the returned JobNimbus contact id from the initial create response.
- On confirmed booking, patch that same contact into a status such as `Appointment Scheduled`.
- Let JobNimbus automation send the SMS from the contact status change.

Why this is attractive:

- The current account already accepts `status_name` on contact create, so status-driven workflow is already part of the data model.
- This is usually simpler for sales automation than inventing a second object type.

Main gap:

- The repository does not currently store the created contact id, so a reliable later update path is missing.

### Option B: Create a JobNimbus activity tied to the contact

Best fallback if SMS automation is activity-driven instead of status-driven.

- Keep the contact as created today.
- On confirmed booking, create a structured JobNimbus activity containing appointment date, time, address, Cal.com uid, and booking status.
- Trigger JobNimbus SMS automation from that activity if the account supports it.

Why this is credible:

- Official JobNimbus platform docs expose `v1/activities` endpoints.
- Activities are a more natural place than contact description text for repeated booking lifecycle events.

Main gap:

- This account path has not yet been validated with the current API key and permissions.

### Option C: Append booking details into contact notes or description

Lowest engineering bar, but weaker as an automation trigger.

- Use the booking event to append text such as appointment date/time and booking uid onto the contact record.

Why it is weaker:

- It gives human visibility, but it is often not the cleanest trigger for SMS automations.
- Repeated edits to a description field are harder to manage than a status transition or structured activity.

## Recommended Architecture

1. Keep Cal.com webhook delivery as the primary appointment event path.
2. Use the paid Cal.com API as a reconciliation and diagnostic layer, not as the only source of truth.
3. Change the JobNimbus sync target to one of these, in order:
   - contact status update, if JobNimbus SMS automation can trigger from status change
   - activity creation, if status automation is not a fit but activities are supported by the account
   - note or description update only if neither structured option is available
4. Persist the JobNimbus contact id at lead-create time so later booking-driven updates can target the exact CRM record.

## Practical Next Step Recommendation

Short-term best path:

- Do not replace the webhook architecture with polling.
- Implement a booking-to-JobNimbus sync that fires from accepted webhook events.
- Store the JobNimbus contact id returned by the initial lead create.
- Add a reconciliation tool that queries Cal.com bookings by attendee email and recent timestamps so missed webhook deliveries can still be recovered.

If the business priority is specifically "JobNimbus sends the SMS when appointment is scheduled," the first implementation question is not Cal.com API vs webhook. It is this:

- Which JobNimbus event is the SMS automation built on: contact status change, activity creation, task creation, or something else?

That answer should determine the exact write target in JobNimbus.

## Files Reviewed

- `worker/src/index.js`
- `README.md`
- `docs/FLAT_ROOF_APPOINTMENT_SCHEDULING_OPTIONS.md`
- `docs/2026-03-30/APPOINTMENT_SCHEDULING_AND_WEBHOOKS.md`
- `docs/2026-04-02/JOBNIMBUS_APPOINTMENT_EVALUATION.md`

## Validation

- Read the current Worker lead and Cal.com webhook handlers.
- Verified the current repository does not write booking data back into JobNimbus after lead creation.
- Reviewed Cal.com v2 booking API documentation and webhook API documentation.
- Reviewed JobNimbus public developer docs enough to confirm the platform API base URL and the existence of `v1/activities` endpoints.
- Did not execute live Cal.com API calls or live JobNimbus API calls in this session.

## Follow-Up

- Verify which exact JobNimbus automation trigger should send the SMS.
- Validate one live JobNimbus update path against this account: contact status update first, activity creation second.
- If implementation proceeds, add a durable feature doc for booking-to-JobNimbus sync and a separate dated implementation record for the actual code change.

## April 7, 2026 Task Trigger Correction

### New finding

- The JobNimbus SMS automation shown in the account is not activity-driven.
- It listens for `Task is Created` with `Task Type = Initial Appointment` and uses `{{TaskDateStart}}` plus `{{TaskTimeStart}}` in the outgoing SMS body.

### Live validation

- Direct `POST https://app.jobnimbus.com/api1/tasks` probes confirmed this account accepts `record_type_name` during task creation.
- A payload containing `title`, `customer`, `date_start`, `all_day: false`, and `record_type_name: "Initial Appointment"` created a task stored back as `record_type = 4` and `record_type_name = "Initial Appointment"`.
- A linked contact can also be passed through the `related` array and is preserved on the created task.

### Decision

- The earlier activity-based implementation is now superseded.
- Booking sync should create JobNimbus tasks, not activities, because the live SMS automation is watching task creation and task type.

### Implementation follow-up

- The Worker booking sync was updated to create `Initial Appointment` tasks through `api1/tasks`.
- The D1 tracking schema was renamed from booking activities to booking tasks, and contact-link rows now also store the JobNimbus `customer` id needed by the task API.
- See the durable doc `docs/JOBNIMBUS_BOOKING_TASK_SYNC.md` and the dated implementation record `docs/2026-04-07/JOBNIMBUS_INITIAL_APPOINTMENT_TASK_SYNC.md` for the finalized task-based design.

## April 6, 2026 Fresh Production Test Appointment Check

### Test performed

- A fresh production Cal.com test appointment was completed after the paid-plan evaluation.
- Production D1 was queried immediately afterward for the newest rows in `cal_booking_confirmations`.
- Production D1 was also queried for the newest `Schedule` rows in `meta_conversion_events`.
- The local Worker secrets file was checked for a Cal.com API credential name so a live paid-API booking lookup could also be attempted from this workspace.

### Result

- Production `cal_booking_confirmations` still contains only the March 30 accepted booking record `booking-20260330175251`.
- Production `meta_conversion_events` still returned no `Schedule` rows.
- The local Worker secrets file still does not expose any Cal.com API credential name; only JobNimbus-related credential names were present in the local check performed in this session.

### Interpretation

- The fresh production test appointment still did not enter the accepted Worker webhook path.
- As of this check, there is still no production evidence that the paid Cal.com account is successfully delivering booking webhooks to `https://ecosystemsca.net/api/cal/webhook`.
- As of this check, there is also still no local workspace evidence that a Cal.com API token has been configured for live paid-API validation from this environment.

### Practical blocker before Option B

- Do not implement JobNimbus activity sync yet.
- First prove one of these:
   - a fresh production booking creates a new row in `cal_booking_confirmations`, or
   - a live Cal.com API lookup from this workspace can retrieve the fresh booking by attendee or time window.

### Next recommended validation

- In Cal.com, inspect the webhook delivery log for the exact test booking and confirm whether the request was delivered, skipped, or failed.
- Add a Cal.com API token locally under a Worker secret name such as `CAL_COM_API_KEY` so this workspace can query the paid API directly.
- After the token exists, run a live booking lookup for the just-created test appointment.

## April 6, 2026 Production Endpoint Reachability Check

### Question tested

- Is the production webhook URL itself wrong because `https://devmt.ecolanding.workers.dev/api/cal/webhook` behaves differently from `https://ecosystemsca.net/api/cal/webhook`?

### HTTP comparison performed

- `GET https://ecosystemsca.net/api/cal/webhook`
- `GET https://prd.ecolanding.workers.dev/api/cal/webhook`
- `POST https://ecosystemsca.net/api/cal/webhook` with an unsigned JSON body
- `POST https://prd.ecolanding.workers.dev/api/cal/webhook` with an unsigned JSON body
- `POST https://devmt.ecolanding.workers.dev/api/cal/webhook` with an unsigned JSON body

### Result

- Both production webhook URLs returned `404` on plain `GET`, which is expected because the Worker only accepts `POST` on `/api/cal/webhook`.
- The production custom-domain webhook URL and the production `workers.dev` webhook URL both returned `401` on unsigned `POST`, matching the expected Worker behavior when the signature is missing.
- The development `workers.dev` webhook URL also returned `401` on the same unsigned `POST` test.

### Interpretation

- The production custom-domain endpoint `https://ecosystemsca.net/api/cal/webhook` is not obviously misrouted.
- The production custom-domain endpoint is reaching the Worker and behaving consistently with the `workers.dev` endpoint.
- That makes the production URL itself a weak root-cause candidate.

### More likely causes after this check

- The Cal.com webhook configuration has not been saved or enabled successfully.
- The configured webhook secret in Cal.com does not match Worker secret `CAL_COM_WEBHOOK_SECRET`.
- Cal.com's ping behavior is not the same as a real signed booking webhook.
- A Cloudflare security rule may be blocking Cal.com specifically while still allowing manual tests from this workspace.

### Practical implication for the screenshot evidence

- A failed Cal.com ping with `403` does not by itself prove the production URL is wrong.
- The stronger evidence is the direct HTTP comparison from this workspace, which shows the production endpoint responds like the Worker endpoint should.
- If Cal.com is the only client getting `403`, then the next place to inspect is Cloudflare security or the exact Cal.com request shape, not the route path alone.

## April 6, 2026 Production Webhook URL Decision

### Decision

- Use `https://prd.ecolanding.workers.dev/api/cal/webhook` as the production Cal.com webhook subscriber URL instead of `https://ecosystemsca.net/api/cal/webhook`.

### Reason

- Cal.com's webhook endpoint tester was able to reach the production `workers.dev` URL successfully.
- The same Cal.com-side test did not validate the custom-domain URL reliably.
- Since both URLs route to the same production Worker behavior in direct manual tests, the safer operational choice is to use the URL Cal.com itself can reach successfully.

### Implementation impact

- No Worker code change is required.
- The change is operational: update the Cal.com production webhook subscriber URL and keep the same shared secret.
- Defer Option B implementation until a fresh booking creates a new production row in `cal_booking_confirmations` or until the paid Cal.com API is validated directly from this workspace.

## April 6, 2026 Option B Implementation Result

### Outcome

- Option B has now been implemented using the working legacy JobNimbus activities API surface.

### What changed

- The Worker now stores JobNimbus contact ids returned by successful lead creation.
- Confirmed Cal.com booking webhooks now resolve the matching JobNimbus contact and create one linked JobNimbus activity note per booking.
- D1 now stores contact-link cache rows plus booking-activity idempotency rows through migration `0004_jobnimbus_booking_activities.sql`.

### Deployment and validation

- Applied migration `0004_jobnimbus_booking_activities.sql` to both `prd` and `devmt`.
- Deployed the updated Worker to `prd` and `devmt`.
- Verified both health endpoints returned `200` with `{"ok":true}` after deploy.
- Validated the JobNimbus activity payload shape directly against the live API key using a controlled contact-linked probe activity.

### Remaining follow-up

- Trigger one fresh labeled production booking after the new Worker deployment if you want explicit end-to-end confirmation that the webhook now creates a JobNimbus activity automatically.
- Backfill earlier April 6 bookings separately if those appointments also need JobNimbus activity history.

## Fresh Production Booking Verification After Task-Based Sync

### Test performed

- A fresh labeled production booking was submitted after the Worker was switched from JobNimbus activities to JobNimbus `Initial Appointment` tasks.
- Production D1 was queried for the newest rows in `cal_booking_confirmations`.
- JobNimbus was queried for the newest task records in the account.

### Result

- Production D1 now includes booking `wyUeqEAdh56vMnuCQ1Sxxp` with:
   - `booking_status = accepted`
   - `booker_email = bsobot@gmail.com`
   - `property_address = 4003 New Appointment Notice St, Appoinment, CA, 87676`
   - `start_time = 2026-04-30T15:00:00.000Z`
- JobNimbus now includes task `#4831` with:
   - `title = Initial Appointment`
   - `record_type_name = Initial Appointment`
   - linked contact `Tested10 APPOINTMENT` / contact number `3440`
   - description containing the same Cal.com booking uid `wyUeqEAdh56vMnuCQ1Sxxp`
   - task start time matching the booking start time

### Interpretation

- The deployed production webhook path is now creating the intended JobNimbus `Initial Appointment` task end to end for a fresh booking.
- This resolves the task-creation portion of the SMS automation requirement.
- JobNimbus SMS delivery was then confirmed manually after the task was created, which closes the end-to-end automation check for the current flow.