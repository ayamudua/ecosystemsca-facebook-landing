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

## March 30, 2026 Prototype Flow Revision

The isolated prototype route was revised again after testing showed that waiting until the Cal.com booking success event to submit the lead left too many strong-intent prospects out of JobNimbus and Google Sheets when they abandoned before finishing the calendar step.

Revised prototype behavior:

1. Step 1 through Step 3 remain in-page.
2. The final contact-step CTA stays `Next: Pick Appointment`.
3. Clicking that CTA now submits the lead immediately to the development Worker so JobNimbus and Google Sheets receive the record before the calendar opens.
4. Only after that lead submit succeeds does the page transition into the inline Cal.com prototype event.
5. Booking completion is now treated as a separate follow-up event rather than the trigger for lead capture.
6. If the lead submit fails, the prototype does not open the calendar and instead shows a retry state plus direct phone fallback.
7. After a successful booking, the prototype still shows the short success layer and then redirects to the dedicated prototype follow-up video page.

Files touched for this revision:

- `site/prototype-integrated-booking.html`
- `site/assets/prototype-booking.js`

## March 30, 2026 Prototype Copy And Follow-Up Layout Cleanup

The prototype booking flow received a public-facing copy cleanup after the booking and webhook mechanics were confirmed working.

What changed:

- Removed visible development-oriented labels and explanatory copy from the prototype booking page so the experience reads like a customer-facing flow rather than an internal test harness.
- Kept the underlying prototype route and config names in code, but rewrote headings, callouts, banner text, confirmation language, and booking fallback messaging to be appropriate for public viewing.
- Moved the follow-up page action links below the video frame so the media area stays clean and can be reused later for post-booking marketing or referral content.
- Simplified the follow-up page header and video-stage messaging so the page feels like a normal branded next-step screen instead of a prototype/debug page.
- Removed internal-only confirmation details that referenced the dev Worker and prototype-only flow from the visible success summary.

Files touched for this cleanup:

- `site/prototype-integrated-booking.html`
- `site/prototype-post-submit-video.html`
- `site/assets/prototype-booking.css`
- `site/assets/prototype-booking.js`

Validation status:

- Editor validation should be re-run on the updated HTML, CSS, and JS files after the copy/layout cleanup.
- No deploy was run as part of this cleanup step.

Validation status:

- Static editor validation still needs to be run after this last prototype rewrite.
- End-to-end browser validation of the revised lead-first prototype flow still needs to be run against the localhost preview and dev Worker.

## March 30, 2026 Prototype Usability Follow-Up

After local testing feedback that the first-step `Next` button appeared unresponsive on the county question, the prototype stepper was tightened so the first step advances immediately when the county radio option is selected and any validation error now scrolls the shared status message into view instead of failing silently below the fold.

Files touched for this follow-up:

- `site/assets/prototype-booking.js`

Validation status:

- Static editor validation still needs to be run after this usability adjustment.

## March 30, 2026 Prototype Post-Booking Handoff Fallback

Local validation confirmed the lead-first prototype can record the lead and complete the booking, but the post-booking video handoff still depends on Cal.com sending a success callback back to the parent page. That callback is not guaranteed in every embed or fallback mode, so the prototype now exposes a manual backup link to the video page directly inside the booking stage.

Files touched for this follow-up:

- `site/prototype-integrated-booking.html`
- `site/assets/prototype-booking.js`
- `site/assets/prototype-booking.css`

Validation status:

- Static editor validation still needs to be run after this fallback handoff update.
- End-to-end browser validation should confirm both paths: automatic redirect when the Cal.com callback fires and manual video access when it does not.

## March 30, 2026 Webhook-Backed Booking Confirmation

The Worker now supports a proper Cal.com webhook-backed confirmation path so booking completion no longer depends entirely on the frontend embed callback.

What changed:

1. Added `POST /api/cal/webhook` to accept signed Cal.com webhook deliveries.
2. Added `GET /api/cal/booking-status` so the frontend can look up a recent booking by attendee email and submission timestamp.
3. Added D1 migration `worker/migrations/0002_cal_booking_confirmations.sql` to persist booking confirmations.
4. Updated the integrated prototype so it polls Worker booking status while the booking stage is open. If Cal.com creates the booking but the embed callback does not return to the parent page, the prototype can still transition to the success state and follow-up video via the webhook-backed status endpoint.

Operational setup required:

1. In Cal.com, open `/settings/developer/webhooks`.
2. Create a webhook for at least `Booking Created`.
3. Point it at the correct Worker environment endpoint:
	- development: `https://devmt.ecolanding.workers.dev/api/cal/webhook`
	- production: `https://ecosystemsca.net/api/cal/webhook`
4. Set a shared secret in Cal.com and store the same value in Worker secret `CAL_COM_WEBHOOK_SECRET`.
5. Apply migration `0002_cal_booking_confirmations.sql` to the D1 database before testing booking-status polling.

Validation status:

- Static validation should be run on the updated Worker, prototype script, migration, and documentation files.
- End-to-end validation still needs one real booking with the webhook configured so both webhook receipt and polling-based confirmation can be verified in the dev environment.

## March 30, 2026 Background Follow-Up Video

The prototype follow-up page now renders the ECO Systems MP4 as a muted looping background video so it can autoplay immediately under current browser autoplay policies.

What changed:

1. Removed the foreground player-style presentation from the prototype follow-up page.
2. Switched the MP4 to `autoplay`, `muted`, `loop`, and `playsinline` so mobile and desktop browsers can start playback automatically.
3. Added a full-screen overlay/content treatment so the page still carries confirmation copy and navigation controls above the moving video.

Files touched for this follow-up:

- `site/prototype-post-submit-video.html`
- `site/assets/prototype-booking.css`

Validation status:

- Static editor validation should be run after this background-video update.
- Browser validation should confirm autoplay behavior on the local prototype page after a hard refresh.

## March 30, 2026 Follow-Up Header Consistency

The follow-up page header was separated from the video frame so the ECO Systems logo and page heading stay in a top section that visually matches the booking page. This preserves the video stage below as a reusable marketing surface for future referral prompts and related service offers.

Files touched for this follow-up:

- `site/prototype-post-submit-video.html`
- `site/assets/prototype-booking.css`

Validation status:

- Static editor validation should be run after this header-layout adjustment.

## March 30, 2026 Appointment Step Reveal Refinement

The Step 4 booking state was refined twice during local usability testing.

What changed:

- The premature-display bug was fixed by forcing the full Step 4 booking stage to respect the HTML `hidden` attribute even though the stage layout uses `display: grid`.
- After that fix, the extra Step 4 click-to-open CTA was removed because it added friction the customer does not need.
- The current behavior is: the Step 4 booking stage stays fully hidden until the original form button `Next: Pick Appointment` is clicked, and then the calendar opens automatically as soon as the lead submit succeeds.

Files touched for this refinement:

- `site/prototype-integrated-booking.html`
- `site/assets/prototype-booking.css`
- `site/assets/prototype-booking.js`
- `site/prototype-post-submit-video.html`

Validation status:

- Static editor validation should be run after this appointment-step reveal update.

## Minimum Implementation Scope For Option 1

## March 30, 2026 Production Integration Plan

## Objective

Promote the confirmed lead-first integrated booking flow into production without changing the rest of the production landing experience. The production rollout should keep Cloudflare Turnstile active, preserve the current hero/reviews/pixel/exit-intent behavior, and limit production change scope to the lead-collection and immediate booking handoff only.

## Scope Constraint

Only these production behaviors should change in the rollout:

- The current production lead flow in `site/index.html` and `site/assets/app.js` that submits the lead and redirects to `site/schedule.html`.
- The immediate post-submit scheduling handoff so the customer stays inside the same lead-first integrated flow already validated in the prototype.

Everything else should remain unchanged for the first production pass:

- hero and offer copy
- reviews and review-widget mode
- Meta Pixel
- exit-intent modal behavior
- Turnstile protection
- Worker lead-delivery integrations outside the booking handoff

## Development Plan

### Epic 1: Productionize the confirmed lead-first booking flow

User stories:

- As a production visitor, I complete the same 3-step lead form already live on the landing page.
- As a production visitor, once I click the final CTA, my lead is recorded first and the booking calendar opens automatically with no extra click.
- As ECO Systems, I continue receiving JobNimbus, Google Sheets, and lead-notification email records exactly as today before the customer finishes booking.

Planned production behavior:

1. Keep the current 3-step production form and Turnstile placement.
2. Submit the lead through the existing `POST /api/lead` route.
3. If lead submit succeeds, open the in-page booking stage automatically on the production landing page.
4. Keep webhook-backed booking confirmation and polling fallback enabled for booking completion.
5. Keep the production page otherwise visually and behaviorally stable outside the new lead-to-booking handoff.

### Epic 2: Preserve operational safety and rollback

User stories:

- As operations, I can observe whether Turnstile or the integrated booking handoff affects production lead completion.
- As the site owner, I can revert quickly to the current redirect-based scheduling flow if production metrics or user behavior regress.

Rollback model:

1. Keep `site/schedule.html` and `site/assets/schedule.js` intact during the rollout.
2. Treat the current redirect-based scheduler path as the rollback target.
3. If conversion, Turnstile completion, or lead delivery regresses, restore the current `index.html` + `app.js` redirect path and redeploy only the static site.

## System Design

### Architecture flow

Current production flow:

`site/index.html` form
-> `site/assets/app.js`
-> `POST /api/lead`
-> redirect to `site/schedule.html`
-> Cal.com iframe page

Target production flow:

`site/index.html` form
-> `site/assets/app.js` integrated booking state
-> `POST /api/lead`
-> reveal in-page production booking stage automatically
-> Cal.com embed
-> frontend success callback or `GET /api/cal/booking-status`
-> follow-up page or success state

### Component hierarchy

Production touch map should stay narrow:

- `site/index.html`
	- keep existing landing sections
	- replace current confirmation-only or redirect handoff area with integrated booking-stage markup
- `site/assets/app.js`
	- replace redirect-to-scheduler behavior with the confirmed lead-first integrated booking controller
	- preserve Turnstile submit gating
	- preserve current payload normalization and tracking behavior
- `site/assets/styles.css`
	- add only the minimum integrated-booking styles needed if they are ported from the prototype
- `site/schedule.html`
	- leave in place for rollback only during the first production observation window
- `site/assets/schedule.js`
	- leave in place for rollback only during the first production observation window

### API routes

No new public production lead endpoint is required for rollout if the current Worker state is kept:

- `POST /api/lead`
- `POST /api/cal/webhook`
- `GET /api/cal/booking-status`

### Data and secret prerequisites

Before production cutover, confirm:

1. `prd` has a valid `TURNSTILE_SECRET_KEY`.
2. `prd` has a valid `CAL_COM_WEBHOOK_SECRET`.
3. Production D1 has migration `worker/migrations/0002_cal_booking_confirmations.sql` applied.
4. Cal.com production webhook is pointed to `https://ecosystemsca.net/api/cal/webhook`.
5. Production Cal.com event configuration matches the tested event behavior and still writes bookings to the correct Google Calendar.

### Security notes

- Keep Turnstile enabled exactly as production uses it today; do not bypass it in production.
- Do not widen the lead payload or expose webhook diagnostics in public responses.
- Do not remove the current lead-first ordering; JobNimbus, Sheets, and email should still happen before booking opens.
- Do not change review, pixel, or modal logic in the same deploy.

### Performance notes

- Avoid introducing extra third-party scripts beyond what production already loads.
- Reuse the existing Cal.com loader pattern validated in the prototype rather than layering multiple fallback models at once.
- Keep the first production pass to a single-path integrated booking experience with the existing webhook fallback.

## Implementation Touch Map

Expected files for the production rollout implementation:

- `site/index.html`
- `site/assets/app.js`
- `site/assets/styles.css`
- `worker/src/index.js` only if a production-specific gap is discovered during prereq verification
- `worker/migrations/0002_cal_booking_confirmations.sql` only for production D1 application, not code change
- `docs/FLAT_ROOF_APPOINTMENT_SCHEDULING_OPTIONS.md`

Files that should remain unchanged in the first production pass unless a blocker is found:

- `site/schedule.html`
- `site/assets/schedule.js`
- review-widget integration
- Meta Pixel setup
- exit-intent modal implementation

## Rollout Sequence

### Phase 0: Production readiness checks

1. Confirm production Worker health.
2. Confirm `prd` secrets for Turnstile and Cal.com webhook.
3. Confirm production D1 has the Cal.com booking-confirmation migration.
4. Confirm Cal.com production webhook delivery target and secret.
5. Confirm the production Turnstile widget still issues valid browser tokens on the live domain.

### Phase 1: Minimal production code cutover

1. Port only the confirmed integrated lead-first flow into the production landing page files.
2. Preserve current page copy and non-booking UI outside the changed lead collection area.
3. Keep `schedule.html` in the repo as rollback support.
4. Deploy Pages only after static validation is clean.

### Phase 2: Observation window with Turnstile enabled

Monitor these signals after deploy:

1. Production `POST /api/lead` success rate.
2. Turnstile rejection rate and user-facing challenge behavior.
3. JobNimbus lead creation continuity.
4. Google Sheets append continuity.
5. Lead-notification email continuity.
6. Cal.com webhook receipts.
7. Booking-confirmation polling success rate when embed callbacks do not return.
8. Drop-off rate between lead-submit and booking-complete compared with the current production baseline.

Recommended observation periods:

- first 30 minutes: live smoke monitoring
- first 24 hours: operational monitoring for delivery regressions
- first 3 to 7 days: conversion and abandonment comparison against baseline traffic

### Phase 3: Decision gate

If the observation window shows stable lead delivery and no Turnstile-related friction spike:

- keep the integrated flow as the new production default
- then decide whether to retire the dedicated `schedule.html` path later

If the observation window shows regression:

- revert only the static production handoff from integrated booking back to redirect-based scheduling
- keep Worker webhook support and D1 booking confirmation storage intact because they are additive and low-risk

## Validation Plan

Pre-deploy:

1. Static validation on changed production files.
2. Local preview with a real browser and Turnstile active on a production-like host where possible.
3. One full production smoke test immediately after deploy with real lead creation and booking completion.

Post-deploy:

1. Confirm one successful lead reaches JobNimbus.
2. Confirm one successful lead writes to Google Sheets.
3. Confirm one successful lead triggers the owner-notification email.
4. Confirm Turnstile does not block a normal production user path.
5. Confirm one real booking creates a Cal.com webhook record and can be confirmed by the Worker booking-status path.

## Recommended Next Step

Do not deploy a broad production refactor. Implement a narrow production cutover that ports only the confirmed prototype lead-collection handoff into the existing production landing page, keep Turnstile on, and observe it against the current delivery baseline before removing the legacy scheduler page.

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

## March 29, 2026 Operational Clarification: Cal.com To Google Calendar

## Objective

Clarify what is required so appointments booked through the deployed Cal.com scheduling flow actually appear on the client's Google Calendar.

## Finding

The repository already passes the lead into a Cal.com booking page. There is no code in this repository that writes bookings directly into Google Calendar.

- `site/index.html` stores the Cal.com event URL in frontend config.
- `site/assets/app.js` redirects successful leads into the scheduling flow.
- `site/assets/schedule.js` builds the Cal.com booking URL and iframe from the submitted lead data.
- `worker/src/index.js` does not create or update Google Calendar events.

## Root Cause

Whether a booked appointment lands in Google Calendar depends on the Cal.com account and event configuration for the linked host calendar, not on any Worker route or frontend code in this repository.

## What Must Be Configured In Cal.com

1. Sign into the Cal.com account that owns the event `eco-systems-roofing-la-county/at-home-roof-estimate-and-inspection`.
2. Connect the target Google account inside Cal.com's calendar connections or apps area.
3. Set that Google Calendar as the active calendar for the event host so Cal.com can both read availability and create the booked event.
4. If the event is a team or round-robin event, confirm every assigned host has an active connected calendar or that the event uses a shared booking calendar.
5. Verify the event is not connected only for availability checking while writing bookings somewhere else.
6. Run a live test booking and confirm a Google Calendar event appears on the intended calendar with the attendee invite attached.

## Optional Repository Work

No repository change is required just to get Cal.com bookings onto Google Calendar.

Repository work is only needed if ECO Systems also wants one of these secondary outcomes:

- webhook logging of created bookings into Google Sheets or JobNimbus
- a local confirmation screen populated from Cal.com booking callbacks
- internal reporting of booked, rescheduled, or canceled appointments

## Validation Performed

- Reviewed the existing frontend scheduling handoff and confirmed it only embeds and parameterizes a Cal.com booking URL.
- Reviewed the Worker routes and confirmed there is no Google Calendar booking write path in this repository.
- Did not log into Cal.com or Google Calendar from this session, so live account-level connection status remains unverified.

## Recommended Next Action

Open the Cal.com event configuration and verify the correct Google account is connected as the host booking calendar. If that connection is already present, perform one test booking and inspect which calendar receives the event. If no event is created, the fix belongs in Cal.com account settings rather than this codebase.

## March 29, 2026 Evaluation: Make Scheduling Part Of The Primary Form Flow

## Objective

Evaluate the feasibility of changing the funnel so the current final form action becomes `Next`, the customer completes calendar booking inside the form flow, and only then finishes the lead capture instead of treating scheduling as a follow-up page.

## Current Behavior Confirmed

- The landing page currently validates the three-step form and submits the lead to `POST /api/lead` before the customer books an appointment.
- After a successful Worker response, the frontend redirects the browser to `site/schedule.html` with Cal.com prefill values in the URL.
- Booking completion is currently handled only on the frontend Cal.com callback side for confirmation UX and does not drive the original Worker submission.

## Feasibility

This change is feasible.

It is a frontend-led change with optional backend expansion, not a platform rewrite. The repo already has:

- local multi-step form state
- Cal.com launch and booking-success event handling
- a working lead API
- prefill generation for contact and property data

That means the main work is orchestration and state flow, not building a scheduling system from scratch.

## Key Product Decision

There are two distinct versions of this idea.

### Variant A: Manual final submit after booking

Flow:

1. Customer completes contact fields.
2. Customer clicks `Next`.
3. Calendar opens inside the same page.
4. Customer books a time.
5. Customer returns to the form and clicks a final `Submit` button.

This is possible, but it introduces a bad failure mode:

- Cal.com may create the appointment successfully.
- The customer may then leave before clicking the final local `Submit` button.
- Result: the calendar booking exists, but the Worker never receives the lead.

That would make scheduling more tightly coupled in the UX while making internal lead capture less reliable.

### Variant B: Booking success triggers final lead submission

Flow:

1. Customer completes contact fields.
2. Customer clicks `Next`.
3. Calendar opens inside the same page.
4. Customer books a time.
5. The frontend submits the lead automatically after Cal.com reports `bookingSuccessfulV2`.
6. The page shows one final confirmation state.

This is the safer implementation.

Reason:

- It preserves the user's mental model that booking is part of the main process.
- It removes the extra post-booking click.
- It avoids orphaned appointments caused by users dropping off after booking but before local form completion.

## Recommendation

If this change is approved, implement the integrated booking flow using Variant B, not Variant A.

If the business still wants a visible final control, it should be a confirmation-only action such as `Done` or `Finish`, not the actual lead-delivery trigger.

## Proposed Approved-Scope Flow

1. Step 1 stays the same.
2. Step 2 stays the same.
3. Step 3 collects name, phone, email, and passes Turnstile.
4. The current `Submit` button becomes `Next: Pick Appointment`.
5. The page transitions into an inline or modal Cal.com booking state without leaving `index.html`.
6. On `bookingSuccessfulV2`, the frontend submits the lead to the Worker.
7. The Worker returns the normal success response.
8. The page shows a final confirmation with booked time plus submitted details.

## Required State Changes

Frontend state would need to distinguish these phases:

- form entry in progress
- ready for booking
- booking in progress
- booking completed but lead submit pending
- lead submit success
- lead submit failure after booking

The last state matters because it becomes the new operational edge case: the appointment may be booked successfully in Cal.com while the Worker submission fails.

## Main Risks

1. Cal.com booking can succeed while `POST /api/lead` fails, which creates a scheduled appointment without the matching CRM lead.
2. If the flow remains cross-page, browser navigation adds more abandonment points; keeping the entire flow on `index.html` is cleaner for this idea.
3. Turnstile token timing may need attention if the user spends a long time in the calendar before the final Worker submission attempt.
4. If booking metadata is not captured at submit time, JobNimbus and Sheets will still receive only lead data and not appointment details.

## Mitigation Strategy

1. Submit the lead immediately on Cal.com booking success instead of waiting for a manual final click.
2. Include the returned booking date and time in the Worker payload so internal systems know the customer actually booked.
3. Add a visible recovery state if the Worker submit fails after booking, with direct call/text fallback and an internal retry path.
4. Consider adding a Cal.com webhook later so bookings can still be reconciled server-side even if the browser drops during final handoff.

## Development Plan

### Epic 1: Reshape the frontend funnel

User story:

As a prospect, I complete the qualification form and calendar selection as one continuous flow instead of being redirected to a separate scheduling step after submitting.

Work:

- remove the post-submit redirect dependency on `schedule.html`
- replace the final form CTA with a booking-transition CTA
- render the scheduler inside the main form experience
- keep the final booked confirmation on the main landing page

### Epic 2: Submit lead on booking completion

User story:

As the business, I want the lead recorded only after the customer completes the booking step, while minimizing the chance of losing a booked appointment from internal records.

Work:

- wire Cal.com success callback to final lead submission
- send booking timestamp and identifiers with the final payload when available
- add a failure state for post-booking submit errors

### Epic 3: Preserve operational recoverability

User story:

As operations, I need to reconcile bookings even if the browser fails during the final handoff.

Work:

- optionally add Cal.com webhook support later
- optionally log booking metadata into Google Sheets and JobNimbus
- keep support-phone fallback visible in failure states

## System Design

### Architecture flow

```text
Landing Page
		-> local step validation
		-> Cal.com embedded or modal booking
				-> bookingSuccessfulV2 callback
						-> POST /api/lead with lead + booking summary
								-> Cloudflare Worker
										-> JobNimbus
										-> Google Sheets
										-> owner notification email
		-> final confirmation state
```

### Component hierarchy

- existing 3-step form shell
- new integrated booking panel inside `index.html`
- final confirmation panel
- optional error recovery panel for booked-but-submit-failed scenarios

### Payload shape impact

Current lead payload is enough for the existing Worker.

For the approved integrated flow, the preferred payload expansion would be:

```json
{
	"contact": {},
	"property": {},
	"tracking": {},
	"meta": {},
	"booking": {
		"startTime": "2026-03-29T17:00:00.000Z",
		"bookingUid": "...",
		"eventTypeSlug": "at-home-roof-estimate-and-inspection"
	}
}
```

### Security notes

- Turnstile still needs to be validated before final Worker submission.
- No Google Calendar credentials should move into this repo; Cal.com should continue owning appointment creation.
- Booking identifiers returned from Cal.com should be treated as untrusted client input unless later confirmed by webhook.

### Performance notes

- Keeping the calendar on `index.html` removes one full-page navigation and should reduce drop-off.
- Modal or inline embed performance should be tested on mobile because calendar load latency is conversion-sensitive.

## Implementation Touch Map

Expected files to change if approved:

- `site/index.html`
- `site/assets/app.js`
- `site/assets/styles.css`
- `worker/src/index.js`
- `README.md`
- `docs/FLAT_ROOF_APPOINTMENT_SCHEDULING_OPTIONS.md`

Possible no-change file:

- `site/schedule.html` may remain temporarily for fallback or be retired later depending on rollout choice.

## Approval Guidance

Approve this change only if the desired behavior is:

- booking is part of the main flow on the same page
- the local Worker submit happens after successful calendar booking
- the final CTA is not the actual source of truth for lead capture unless the business explicitly accepts the orphaned-booking risk

If approval is granted, the recommended implementation is to keep scheduling inside the landing page and trigger the final API submit from the Cal.com booking-success callback, while showing a final confirmation state after the Worker responds.

## March 29, 2026 Prototype Route Approved

The isolated prototype approach has been approved for implementation before any production rollout.

Prototype isolation rules:

- do not modify the current production entry flow in `site/index.html`
- do not replace the existing production Cal.com event
- use a separate prototype route in the static site
- use the separate Cal.com event `eco-systems-roofing-la-county/prototype`
- point final lead submission at the development Worker URL `https://devmt.ecolanding.workers.dev`

Prototype route added for testing:

- `site/prototype-integrated-booking.html`

Prototype assets:

- `site/assets/prototype-booking.js`
- `site/assets/prototype-booking.css`
- `site/prototype-post-submit-video.html`

Prototype behavior target:

1. Step 1 through Step 3 remain in-page.
2. The final contact-step CTA becomes `Next: Pick Appointment`.
3. The page opens the prototype Cal.com event inline on the same route.
4. Cal.com booking success triggers the final `POST /api/lead` call automatically.
5. The page shows a final confirmation only after both booking and lead submit succeed.
6. If booking succeeds but the lead submit fails, the page shows a recovery state with retry plus phone fallback.
7. The prototype page intentionally skips Turnstile so the calendar experiment can be tested without the security checkpoint interrupting the flow.
8. After successful booking plus final lead submit, the prototype shows a short success layer and then redirects to a separate prototype follow-up page with the provided ECO Roof Solar MP4 embedded.

Operational caution:

- This prototype keeps the live production page unchanged, but the prototype still performs a real end-to-end lead submit to the development Worker. Test submissions should therefore be treated as operational test traffic and labeled accordingly during QA.
- The development Worker bypass for this prototype is scoped only to requests whose source is `facebook-flat-roof-integrated-prototype` and whose browser origin is localhost, so production lead traffic still requires normal Turnstile verification.
- The localhost-only prototype bypass has been deployed to `https://devmt.ecolanding.workers.dev`.

## Validation Performed

- Inspected local landing page markup and frontend submit flow.
- Inspected Worker routes and lead-processing behavior.
- Compared repository behavior against the live `https://ecosystemsca.co/flat-roofs` landing page.
- Confirmed no scheduling or calendar booking implementation exists in the current repo.
- Reviewed Cal.com source and docs to confirm booking-field prefills are keyed by URL query params matching the booking-field slug.
- Verified the scheduler launch code now generates a prefilled Cal.com modal link and matching iframe fallback URL that include attendee-address location keys.
- Verified the scheduler launch code now also duplicates the property address into the Cal.com `notes` field and several likely custom-field slug keys so the value still reaches the booking if the visible address input is backed by a separate custom field.
- Verified the scheduler launch code now also duplicates the phone number across the Cal.com system phone slug and several common custom phone slugs, plus a default US phone-country hint for the visible phone input.
- Removed Turnstile from the isolated prototype page and narrowed the development Worker so only localhost requests from the prototype source bypass Turnstile validation.
- Deployed the updated development Worker successfully after clearing the conflicting Cloudflare token/account environment variables from the deployment shell.
- Added a separate prototype post-submit video page and wired the integrated-booking success state to auto-redirect there after the booking and lead submission are both confirmed.
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

## March 30, 2026 Risk Assessment: Remove Turnstile And Rely On Cloudflare Edge Bot Protection

## Objective

Assess whether the production funnel should remove Turnstile entirely and rely instead on Cloudflare bot protection at the edge.

## Finding

Removing Turnstile entirely is possible, but it weakens the last-mile protection on lead submission.

Cloudflare's bot products and Turnstile solve different problems:

- Turnstile is a form-level or action-level attestation step tied directly to the submit event.
- Cloudflare edge bot protection screens incoming requests before they reach the origin, but it does not inherently replace per-form human verification on a specific business action.

## External Reference Comparison

The external page `https://ecosystemsca.co/flat-roofs` did not show Turnstile markers in the fetched raw HTML, but it did show signs of:

- Cloudflare edge protection via `server: cloudflare` and `__cf_bm` bot-management cookie
- LeadConnector / GoHighLevel hosted form infrastructure
- reCAPTCHA-capable configuration in the hosted page application bundle

That means the external reference is not equivalent to a page with no bot protection at all.

## Risk Assessment

### Option A: Remove Turnstile entirely

Pros:

- lowest visible friction in the funnel
- eliminates any chance that the Turnstile widget state is blocking the submit path

Cons:

- higher spam and junk-lead risk reaching JobNimbus, Google Sheets, and owner email
- more exposure to scripted real-browser abuse that edge filtering may still allow through
- less confidence that the final lead-submission event came from a human interaction

Assessment:

This is the highest-conversion but highest-abuse option. It may be acceptable only if spam volume is low and the business is willing to trade lead quality controls for maximum completion rate.

### Option B: Replace Turnstile with Cloudflare edge bot protection only

Pros:

- protection moves away from the form UI, so the customer sees less friction
- blocks or challenges some bad traffic before it reaches the page or API

Cons:

- edge bot protection is not a precise replacement for submit-time attestation
- browser-like automation may still load the page and submit the form
- effectiveness depends heavily on plan level and Cloudflare configuration

Assessment:

Better than no protection, but still weaker than keeping some form-level verification on the lead action.

### Option C: Keep edge bot protection and downgrade Turnstile friction

Pros:

- strongest balance between completion rate and lead-quality protection
- preserves a submit-time signal while making the widget less intrusive
- reduces the chance that obvious bot traffic even reaches the form

Cons:

- still requires some Turnstile integration and verification logic
- needs live testing to confirm the lower-friction mode actually improves completion

Assessment:

This is the recommended production path.

## Recommended Production Direction

If the concern is that Turnstile is too aggressive, do not jump straight to removing it entirely.

Recommended sequence:

1. Keep Cloudflare edge protection enabled.
2. Prefer Cloudflare bot products at the zone edge where available for the domain.
3. Reduce Turnstile friction instead of removing it first.
4. Re-test booking completion and form conversion.
5. Remove Turnstile only if the lower-friction model still demonstrably harms conversion and spam remains operationally acceptable.

## Practical Cloudflare Options

Depending on plan availability for the production zone:

- Bot Fight Mode or Super Bot Fight Mode on the zone
- WAF custom rules or Browser Integrity Check on the form/API paths
- Turnstile in a less intrusive mode rather than full removal

Cloudflare Bot Management for Enterprise is the strongest edge-only option, but that is an Enterprise-tier product and should not be assumed available by default.

## Most Important Caveat

The successful prototype result without Turnstile does not prove that Turnstile is the root cause of the production booking issue.

The prototype differs from production in multiple ways:

- same-page integrated flow instead of post-submit redirect
- separate Cal.com prototype event
- development Worker target
- localhost-only bypass behavior for testing

Therefore, Turnstile is a credible hypothesis, but not yet proven root cause.

## Recommendation

For production, the most defensible choice is:

- use Cloudflare edge bot protection where available
- keep a lower-friction Turnstile mode or narrow its scope
- only remove Turnstile entirely after a controlled production test shows it is the actual conversion blocker and spam remains acceptable

## Validation Performed

- Reviewed Cloudflare Turnstile documentation and confirmed it is designed as an action-level challenge mechanism with non-interactive, managed, and invisible widget modes.
- Reviewed Cloudflare bot-product documentation and confirmed bot protection at the edge is a separate capability from Turnstile and varies by plan tier.
- Fetched the external reference page and confirmed it does not expose Turnstile markers in raw HTML, but does expose Cloudflare edge presence plus LeadConnector and reCAPTCHA-capable markers.