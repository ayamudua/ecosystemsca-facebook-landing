# Flat Roof Appointment Scheduling Options

## Objective

Document the missing post-submit appointment step for the flat-roofs landing flow, confirm what the current repository actually does, and outline implementation options that restore a simple customer-facing calendar flow.

## Finding

The current implementation stops at lead capture.

- The landing page submits the form in `site/assets/app.js` through `submitLead()`.
- After a successful `POST /api/lead`, the frontend calls `showSubmissionConfirmation()` and renders a static success summary instead of continuing to a scheduling step.
- The Worker accepts the lead at `POST /api/lead`, sends it to JobNimbus, logs it to Google Sheets, and sends an owner notification email.
- There is no appointment availability endpoint, no appointment persistence model, no Google Calendar integration, and no customer-facing scheduling UI in this repository.

## Root Cause

The current build implemented a simplified lead-capture funnel and omitted the second-stage booking workflow that the legacy live funnel required.

That missing workflow includes:

1. Showing the submitted customer summary.
2. Offering appointment slots for the next 3 available days only.
3. Letting the customer choose a time and complete booking immediately.
4. Recording the appointment in the client's Gmail-backed Google Calendar.
5. Triggering the expected notifications after booking.

## Evidence Reviewed

- `site/index.html` contains a `submission-confirmation` panel and no scheduling panel.
- `site/assets/app.js` shows successful lead submission ending in `showSubmissionConfirmation()`.
- `worker/src/index.js` exposes `POST /api/lead` only for lead intake and related notifications.
- `README.md` documents lead delivery, Google Sheets logging, and owner email notifications, but no appointment system.
- Live page inspection of `https://ecosystemsca.co/flat-roofs` confirms the visible form and does not expose a scheduling implementation in the current repo copy.
- Live page inspection of `https://ecosystemsca.co/crown-special-thanks-q-5993-8327` confirms the scheduling experience is a hosted LeadConnector / GoHighLevel calendar widget, not custom calendar code owned by this repository.

## Additional Finding: Existing Thank-You Scheduler

The page `https://ecosystemsca.co/crown-special-thanks-q-5993-8327` is not using a custom-built in-repo calendar.

Observed implementation details from the page source:

- Assets and runtime are loaded from `leadconnectorhq.com` and `apisystem.tech`.
- The page bootstraps a `c-calendar` element and `calendarAppointmentBookingMain` container managed by the hosted widget runtime.
- The serialized page state includes a hosted calendar configuration with a calendar id, widget slug, team-member assignment rules, open hours, and a thank-you redirect.
- The scheduler appears to be a GoHighLevel / LeadConnector round-robin calendar configuration, with Google Calendar behavior handled through that platform's connected calendar integrations rather than by custom code on the page.

Practical implication:

- This can likely be reused as an embed or by recreating the same calendar configuration inside the same LeadConnector / GoHighLevel account.
- It cannot be meaningfully "extracted" as standalone custom calendar code that can simply be copied into this repository and maintained independently.
- If ECO Systems still has access to the underlying LeadConnector / GoHighLevel account and calendar configuration, the fastest path may be to embed that hosted scheduler directly after lead submit instead of building a new calendar stack.

### Extracted Hosted Calendar Configuration

The following values were recoverable from the page source of `https://ecosystemsca.co/crown-special-thanks-q-5993-8327`:

- Provider family: LeadConnector / GoHighLevel hosted calendar widget
- Location id: `aYz5UgOHqy3fIQqucEZN`
- Calendar id: `zH5yZNgVOHklR3wX1ZfK`
- Provider id / team calendar id: `YZptfI8XU4ehf4HkPyhH`
- Widget slug: `minyonaclientsales-25a9fd23-1efe-4536-b725-d20276ea7d93/at-home-roof-estimate-and-inspection`
- Calendar slug: `at-home-roof-estimate-and-inspection`
- Visible business label: `Eco Systems Roofing - LA County`
- Event type: `RoundRobin_OptimizeForAvailability`
- Timezone: `America/Los_Angeles`
- Slot duration: `60` minutes
- Buffer before / interval / slot buffer: `30` minutes
- Team member surfaced in config: `Chris Lennon`
- Notification email in config payload: `infoeco411@gmail.com`
- Notification phone in config payload: `+14244074459`
- Office hours in config payload: daily `08:00` to `12:00`

### Redirect And Flow Behavior Extracted From Source

The page source exposes two important downstream URLs:

- Configured success redirect URL: `https://go.ecosystemsca.com/you-are-scheduled-page`
- Funnel next-step URL: `https://go.ecosystemsca.com/flat-roof-important-message-page`

Important nuance:

- The source also includes `action: go-to-next-funnel-step` on the calendar element.
- That means the widget is wired into a larger GoHighLevel funnel, not just a standalone appointment page.
- Without executing and tracing the hosted widget runtime in the original account context, there is some ambiguity about which URL is ultimately used as the user-visible post-booking destination in every scenario.
- The safe conclusion is that both URLs are part of the original scheduling funnel configuration and should be checked inside the originating GoHighLevel account before rebuilding the flow.

## Recommended Options

### Option 1: Cal.com embed after lead submit

Best choice for speed and lowest risk.

Flow:

1. User submits the lead form.
2. Frontend shows the submission summary.
3. Frontend immediately reveals an embedded Cal.com scheduler below the summary.
4. Cal.com enforces availability rules and writes booked events to the client's Google Calendar through Cal.com's Google integration.
5. Cal.com handles invite emails and reminders.

Implementation shape:

- Keep the existing `POST /api/lead` flow.
- Replace the current static confirmation-only state with a two-part post-submit state: summary + embedded scheduler.
- Pass lead fields into Cal.com prefill parameters where supported: name, email, phone, address, and metadata.
- Configure Cal.com event rules to expose only the next 3 days of availability and the allowed time windows.
- Use Cal.com webhooks if ECO Systems also wants the booking mirrored into JobNimbus, Google Sheets, or a Worker endpoint.

Pros:

- Fastest path.
- Lowest engineering effort.
- Google Calendar sync and notification logic already solved by Cal.com.
- Minimal backend expansion.

Cons:

- Third-party UI and branding constraints.
- Ongoing SaaS dependency.
- Availability rules live in Cal.com, not in this repo.

### Option 2: Calendly or similar hosted scheduler

Best choice if stronger branding control is needed without building scheduling logic from scratch.

Flow is similar to Option 1, but with a more customizable scheduler product.

Implementation shape:

- Keep the existing lead capture Worker.
- Add a post-submit embedded booking step.
- Use platform webhooks to notify a Worker route when an appointment is created, changed, or canceled.
- Mirror booked appointments into Sheets and optionally into JobNimbus notes or tags.

Pros:

- Similar time-to-value with a widely familiar booking product.
- Still avoids building calendar math, timezone handling, reminder delivery, and conflict resolution internally.

Cons:

- Less metadata flexibility than Cal.com for a custom follow-up pipeline.
- Still keeps scheduling rules outside this repository.

### Option 3: Native Worker-managed appointment API with Google Calendar integration

Best choice only if ECO Systems wants full control and ownership inside the existing Cloudflare stack.

Required additions:

1. New endpoint to return available time slots for the next 3 days.
2. Availability rules model for working hours, buffers, blocked dates, and timezone.
3. Conflict-safe booking endpoint.
4. Persistent appointment storage, ideally D1.
5. Google Calendar API integration using OAuth or a service account strategy that fits the client's calendar ownership model.
6. Email or SMS notification layer for confirmations and reminders.

Suggested API shape:

- `GET /api/appointments/availability?days=3`
- `POST /api/appointments`
- `POST /api/appointments/webhook/google` only if bidirectional sync is needed later

Suggested frontend flow:

1. Submit lead.
2. Show summary panel.
3. Fetch next 3 days of available slots.
4. Let the user pick a day and time.
5. Confirm booking.
6. Replace the current success panel with a booked-appointment confirmation.

Pros:

- Full control over UI, rules, and data.
- No SaaS lock-in.
- Cleanest long-term fit with the existing Worker architecture.

Cons:

- Highest engineering cost.
- Must solve timezone handling, race conditions, duplicate bookings, reminders, cancellations, and Google auth correctly.
- Highest risk path for a conversion-critical funnel.

## Practical Recommendation

For this landing page, Option 1 is the most pragmatic choice.

Reason:

- The funnel already has a working lead-capture endpoint.
- The missing conversion step is appointment booking, not CRM capture.
- The business requirement is operationally simple: next 3 days only, pick a time, write to Google Calendar, and send notifications.
- A mature scheduling product already solves exactly that with lower failure risk than a custom calendar build.

Recommended delivery sequence:

1. Keep `POST /api/lead` as the first transaction.
2. Replace the current confirmation-only UX with summary + embedded scheduler.
3. Configure scheduler availability to next 3 days only.
4. Connect the scheduler to the client's Gmail Google Calendar.
5. Add a webhook from the scheduler to a Worker endpoint only if ECO Systems needs internal appointment logging or CRM updates.

## March 27, 2026 Implementation Update

The quick Cal.com path has now been implemented in this repository at the frontend level.

What changed:

- After a successful `POST /api/lead`, the landing page now redirects to a dedicated first-party scheduling page instead of opening the Cal.com modal.
- The new scheduling page lives at `site/schedule.html` and receives the submitted lead values in the page URL so the booking handoff is visible and debuggable.
- That dedicated page builds the Cal.com iframe URL directly from the current query string and also exposes a full-page fallback link to the same prefilled Cal.com booking URL.
- The Cal.com embed is driven by `window.ECO_LANDING_CONFIG.calComLink` in `site/index.html`.
- The Cal.com handoff now includes the exact booking-question identifiers confirmed by Cal.com support for this event type: `name`, `email`, `attendeePhoneNUmber`, and `YourAddress`.
- If that URL is blank or invalid, the dedicated scheduling page shows a clear fallback notice instead of silently failing.
- The Worker lead pipeline remains unchanged for this quick solution.

Validation status:

- Verified in code that the frontend now redirects to a dedicated scheduling page and appends the exact confirmed identifier keys alongside the broader fallback aliases already present in the prefill payload.
- Static validation confirmed no editor-reported errors in the updated frontend files.
- Live browser validation against the actual Cal.com event was not run in this session, so final confirmation still depends on testing one end-to-end submission against the production booking page and confirming the Cal.com fields auto-populate from the URL-driven iframe source.
- Added explicit asset-version query strings to the static CSS and JS includes so production browsers stop serving stale cached frontend code after Pages deploys.

Operational note:

- The implementation is code-complete for the quick Cal.com option, but it is not live until the real Cal.com booking link is inserted into `site/index.html` and the Cal.com event is configured for next-3-days availability plus Google Calendar sync.
- On March 27, 2026, the Cloudflare Wrangler session was reconnected to the correct account (`infoeco411@gmail.com` / account id `eaacedc62504d7b5ae02d4f82e05bfb1`) and the production Pages deployment succeeded after overriding a stale `CF_ACCOUNT_ID` environment value that had been forcing Wrangler onto the wrong Cloudflare account context.
- The initial Cal.com live embed did not open reliably because the page was loading `https://app.cal.com/embed/embed.js` as a plain external script instead of using Cal.com's bootstrap loader pattern. Replaced that direct script include with the official queued bootstrap inside `site/assets/app.js`, redeployed Pages, and published the loader fix.
- The post-submit UX was then adjusted so the customer no longer sees the request summary before scheduling. After a successful lead submit, the page now goes directly into the scheduler state. The summary/details are only shown after Cal.com reports a successful booking.
- On the next live retest, the Cal.com JS embed still stalled on an inline loading spinner for this booking link. Added a timed direct-iframe fallback using the same Cal.com event URL with `?embed=1` so the inline scheduler is replaced automatically if the JS embed does not become ready quickly, while still preserving the new-tab fallback link.
- The generic team-level Cal.com link was then replaced with the exact event-level embed path and namespace from Cal.com's generated snippet: `eco-systems-roofing-la-county/at-home-roof-estimate-and-inspection` with namespace `at-home-roof-estimate-and-inspection`. Updated the bootstrap logic to match Cal.com's generated namespace-aware loader pattern and redeployed production.
- After the next production retest, the inline scheduler rendered but still showed three follow-up issues: the property address was not prefilling into Cal.com's attendee address field, the external new-tab CTA was no longer needed, and the page visually duplicated Step 2 by rendering both the confirmation heading and a second scheduler heading. Updated the frontend to prefill Cal.com with `address` and `attendeePhoneNumber`, removed the new-tab CTA, and reduced the scheduling state to a single visible Step 2 heading.
- A subsequent production retest exposed a new failure state where the page incorrectly showed the fallback message claiming the Cal.com link was not configured, even though the configured event URL was present in page config. Simplified the runtime by switching the primary post-submit scheduler rendering path to the direct inline Cal.com iframe and added the missing HTML-attribute escape helper used by the iframe renderer.
- A later retest still showed the calendar failing to appear. Replaced the direct-iframe-first approach with the simplest official Cal.com inline embed flow using the default embed API path and default event listeners, while retaining the inline iframe fallback only as a secondary recovery path if Cal.com's embed reports a link failure.
- Once the inline flow was finally rendering reliably, the remaining UX issues were speed, missing address prefill, and the confusing placement of the local `Start over` action below the embedded calendar. Updated the frontend again to auto-launch Cal.com as a modal immediately after lead submission, preload the modal for faster open, hide the local reset action during scheduling, restore the reset button only on the final booked summary state, and send the property address through both `address` and `attendeeAddress` prefill keys alongside first and last name fields.
- After the next retest, the modal launch was confirmed working but the attendee address still was not landing in Cal.com's address field. Updated the frontend a final time so both the modal launch link and iframe fallback now carry the property address as URL query params under the generic address keys and the attendee-location keys Cal.com uses for attendee in-person events: `address`, `attendeeAddress`, `location=attendeeInPerson`, `locationType=attendeeInPerson`, and `locationAddress`. Validation for whether the live event honors one of those keys still needs a browser retest against production.
- A follow-up review of the live booking form showed two separate address-related destinations: the attendee-location input under the system `Location` field and a second custom address field labeled `Your Address`. Updated the frontend again so the property address is also sent through Cal.com's `notes` field as a guaranteed fallback and through likely slugified custom-field keys derived from the visible labels, including `your-address`, `organizer-address`, `appointment-address`, and `property-address`.
- A later live review confirmed the popup flow itself is acceptable, but the remaining prefill gaps were specifically the visible phone input and the visible `Your Address` field. Refined the frontend again so the popup now sends the phone value through the Cal.com system phone slug and several common phone aliases (`attendeePhoneNumber`, `phone`, `phoneNumber`, `mobile`, `phone-number`, `your-phone-number`) plus a default US phone-country hint, while retaining the existing `your-address` address targeting.

## Minimum Implementation Scope For Option 1

Frontend:

- Update `site/index.html` to include a hidden scheduling container after successful form submit.
- Update `site/assets/app.js` so the post-submit state no longer ends at `showSubmissionConfirmation()`.
- Prefill scheduler fields with submitted lead data.

Backend:

- Existing `POST /api/lead` can remain intact.
- Optional new Worker route for booking webhooks if downstream logging is needed.

Operational setup:

- Connect the scheduler platform to the client's Gmail Google Calendar.
- Configure appointment duration, buffers, working hours, and email reminders.
- Restrict visible availability to the next 3 days.

## Validation Performed

- Inspected local landing page markup and frontend submit flow.
- Inspected Worker routes and lead-processing behavior.
- Compared repository behavior against the live `https://ecosystemsca.co/flat-roofs` landing page.
- Confirmed no scheduling or calendar booking implementation exists in the current repo.
- Reviewed Cal.com source and docs to confirm booking-field prefills are keyed by URL query params matching the booking-field slug.
- Verified the scheduler launch code now generates a prefilled Cal.com modal link and matching iframe fallback URL that include attendee-address location keys.
- Verified the scheduler launch code now also duplicates the property address into the Cal.com `notes` field and several likely custom-field slug keys so the value still reaches the booking if the visible address input is backed by a separate custom field.
- Verified the scheduler launch code now also duplicates the phone number across the Cal.com system phone slug and several common custom phone slugs, plus a default US phone-country hint for the visible phone input.
- Production browser validation of the live Cal.com address field prefill has not been run in this session after this last code change.

## Files Reviewed

- `site/index.html`
- `site/assets/app.js`
- `worker/src/index.js`
- `README.md`

## Files Touched

- `docs/FLAT_ROOF_APPOINTMENT_SCHEDULING_OPTIONS.md`
- `README.md`
- `site/index.html`
- `site/assets/app.js`
- `site/assets/styles.css`

## Next Action

Insert the real Cal.com booking link into `window.ECO_LANDING_CONFIG.calComLink` in `site/index.html`, then verify that the configured Cal.com event limits availability to the next 3 days and writes booked inspections into the client's Google Calendar.