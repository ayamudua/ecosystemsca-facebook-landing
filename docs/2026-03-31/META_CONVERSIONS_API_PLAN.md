# March 31, 2026 Meta Conversions API Plan

## Objective

Implement Meta Conversions API for the landing flow using the existing Cloudflare Worker as the server-side event sender, while keeping the current browser Meta Pixel in place for deduped browser-plus-server attribution.

## Current State

- The landing page already loads the standard Meta Pixel and tracks `PageView`.
- The frontend currently captures `fbclid` from the URL and includes it in the lead payload.
- The Worker persists lead metadata and already has the right execution point to send server-side conversion events after successful lead processing.
- No current code posts any event to Meta Graph API.

## Required Inputs

- Meta Pixel ID
- Meta Conversions API access token for that pixel
- Optional Meta test event code for Events Manager validation in `devmt`
- Confirmation that the production Pixel ID remains `1093337934791191`

## Development Plan

### Epic 1: Browser Tracking Enrichment

Feature:

- Capture the browser identifiers Meta expects for strong attribution and deduplication.

User stories:

- As a visitor arriving from a Meta ad, my session should preserve `fbclid`, `_fbp`, and derived `_fbc` so the server-side event can be matched accurately.
- As the business owner, I want lead attribution to survive browser blocking and client-side script loss better than browser pixel alone.

Planned work:

- Extend frontend tracking payload to include `_fbp` cookie value when present.
- Derive `_fbc` from `fbclid` when present and capture the existing `_fbc` cookie if Meta already set one.
- Generate a browser event id for `Lead` so browser Pixel and Worker CAPI can be deduplicated.
- Fire a browser `Lead` pixel event only after successful `POST /api/lead` completion.

### Epic 2: Worker Meta CAPI Lead Event

Feature:

- Send a server-side `Lead` event from the Worker after a successful lead submission.

User stories:

- As marketing operations, I want successful lead submissions to appear in Meta through Conversions API even if browser-only tracking is incomplete.
- As engineering, I need the Meta send to be non-blocking so CRM delivery and user response are not made less reliable by Meta uptime.

Planned work:

- Add a Worker helper to normalize and SHA-256 hash user data fields required by Meta.
- Send `Lead` to Meta only when the Worker returns success for the submission flow.
- Include `event_id`, `event_time`, `action_source`, `event_source_url`, client IP, client user agent, hashed email, hashed phone, city, state, zip, and country where available.
- Include `fbp` and `fbc` when present.
- Log Meta failures server-side without failing the user-facing lead request.

### Epic 3: Worker Meta CAPI Appointment Event

Feature:

- Send a server-side booking event from the Cal.com webhook path.

User stories:

- As marketing operations, I want scheduled appointments to be attributable inside Meta separately from raw leads.
- As engineering, I need webhook retries and booking updates to avoid sending duplicate Meta appointment events.

Planned work:

- Use the existing `POST /api/cal/webhook` flow to send a Meta `Schedule` event when a booking is confirmed or rescheduled.
- Persist a lightweight event-delivery record in D1 so repeated webhook deliveries do not emit duplicate Meta events for the same booking and event type.
- Reuse attendee email, phone, and property data from the booking confirmation record for Meta user data.

### Epic 4: Validation And Operations

Feature:

- Make the integration testable in `devmt` and support production troubleshooting.

User stories:

- As engineering, I need a safe way to validate server-side Meta events before trusting production attribution.
- As operations, I need enough logs to diagnose failed Meta sends without exposing secrets or raw personal data publicly.

Planned work:

- Add optional `META_TEST_EVENT_CODE` environment support for `devmt` and temporary production verification.
- Add concise Worker logs for Meta event name, result, and response code.
- Validate one successful lead event and one successful booking event in Meta Events Manager test mode before production signoff.

## System Design

### Architecture Flow

1. Visitor lands on the page and Meta Pixel tracks `PageView`.
2. Frontend captures `fbclid`, `_fbp`, `_fbc`, and generates a dedupe `eventId` for the lead submission.
3. Frontend submits the lead to `POST /api/lead` with tracking metadata.
4. Worker validates and processes the lead as it does today.
5. On successful lead outcome, Worker sends a Meta CAPI `Lead` event using the same `eventId` as the browser event.
6. Frontend fires browser `fbq("track", "Lead", ..., { eventID })` after the Worker returns success.
7. User books an appointment through Cal.com.
8. Cal.com webhook reaches `POST /api/cal/webhook`.
9. Worker upserts booking confirmation and sends a server-side `Schedule` event to Meta if that booking-event combination has not already been sent.

### Component Map

- Frontend landing page bootstrap in `site/index.html`
- Frontend lead submit flow in `site/assets/app.js`
- Worker lead handler in `worker/src/index.js`
- Worker Cal.com webhook handler in `worker/src/index.js`
- D1 booking confirmation storage in `worker/migrations/0002_cal_booking_confirmations.sql`
- New D1 Meta conversion event log migration for idempotency and troubleshooting

### State Plan

Frontend state additions:

- `tracking.fbp`
- `tracking.fbc`
- `tracking.leadEventId`

Worker state additions:

- Meta config availability at runtime
- Lead event send result
- Booking event send result

D1 state additions:

- Meta event log row keyed by source object plus event name to prevent duplicate webhook-triggered appointment sends

### API Routes

No new public routes are required.

Existing routes to extend:

- `POST /api/lead`
- `POST /api/cal/webhook`

### Payload Shapes

Frontend lead payload additions:

```json
{
  "tracking": {
    "utmSource": "facebook",
    "utmMedium": "paid-social",
    "utmCampaign": "...",
    "utmContent": "...",
    "fbclid": "...",
    "fbp": "fb.1.1234567890.1234567890",
    "fbc": "fb.1.1234567890.fbclid-value",
    "leadEventId": "uuid-or-random-id"
  }
}
```

Worker-to-Meta `Lead` event shape:

```json
{
  "data": [
    {
      "event_name": "Lead",
      "event_time": 1711843200,
      "event_id": "lead-event-id",
      "action_source": "website",
      "event_source_url": "https://ecosystemsca.net",
      "user_data": {
        "em": ["sha256-email"],
        "ph": ["sha256-phone"],
        "client_ip_address": "...",
        "client_user_agent": "...",
        "fbc": "...",
        "fbp": "..."
      },
      "custom_data": {
        "content_name": "Flat Roof Lead",
        "value": 1,
        "currency": "USD"
      }
    }
  ]
}
```

Worker-to-Meta appointment event shape:

```json
{
  "data": [
    {
      "event_name": "Schedule",
      "event_time": 1711843260,
      "event_id": "cal-booking-uid:schedule",
      "action_source": "website",
      "event_source_url": "https://ecosystemsca.net/schedule.html",
      "user_data": {
        "em": ["sha256-email"],
        "ph": ["sha256-phone"]
      },
      "custom_data": {
        "content_name": "Roof Inspection Scheduled"
      }
    }
  ]
}
```

### Security Notes

- Store `META_PIXEL_ID`, `META_CONVERSIONS_API_TOKEN`, and optional `META_TEST_EVENT_CODE` as Worker secrets or protected environment variables only.
- Never expose the Conversions API access token to the browser.
- Normalize and hash personal identifiers before sending to Meta where Meta expects hashed values.
- Keep Meta sends non-blocking and redact sensitive payload content from public responses.

### Performance Notes

- Meta delivery should run as a best-effort side effect after core lead success is established.
- Use `ctx.waitUntil(...)` style background execution if the Worker structure is adjusted to support it cleanly, or keep the send lightweight and non-fatal if done inline.
- Limit log volume to event name, source path, response status, and failure summary.

## Data Model Plan

### New Worker Config

- `META_PIXEL_ID`
- `META_CONVERSIONS_API_TOKEN`
- `META_TEST_EVENT_CODE` optional

### Proposed D1 Table

`meta_conversion_events`

Fields:

- `id`
- `source_type` (`lead` or `booking`)
- `source_key` (lead event id or booking uid)
- `event_name`
- `meta_event_id`
- `delivery_status`
- `response_status`
- `response_body`
- `created_at`

Purpose:

- prevent duplicate appointment webhook sends
- support troubleshooting of CAPI delivery status

## Implementation Touch Map

Files expected to change or be added:

- `site/assets/app.js`
  browser identifier capture, lead event id generation, browser `Lead` pixel send after successful submit
- `site/index.html`
  optional bootstrap helper exposure only if needed; existing Meta Pixel stays in place
- `worker/src/index.js`
  Meta config checks, hashing helpers, Meta event sender, lead event dispatch, booking event dispatch, non-fatal logging
- `worker/wrangler.toml`
  `devmt` and `prd` variables for non-secret Meta config if Pixel ID is stored there
- `worker/.dev.vars.example`
  local config placeholders for Meta secrets
- `worker/migrations/0003_meta_conversion_events.sql`
  D1 table for Meta event idempotency and troubleshooting
- `README.md`
  operational setup and validation notes
- `docs/2026-03-31/META_CONVERSIONS_API_PLAN.md`
  this plan
- `docs/<implementation date>/...`
  dated implementation record once approved and executed

## Validation Plan

1. Static validation on updated frontend and Worker files.
2. Local lead-submit payload verification to confirm `fbclid`, `fbp`, `fbc`, and `leadEventId` are present.
3. `devmt` Worker validation using `META_TEST_EVENT_CODE` and Meta Events Manager.
4. One successful lead submission should produce deduped browser and server `Lead` events.
5. One successful Cal.com booking should produce one server-side `Schedule` event.
6. Repeat webhook delivery should not create duplicate `Schedule` sends.

## Risks And Mitigations

- Risk: duplicate events from browser plus server.
  Mitigation: share the same `event_id` for the lead event.
- Risk: duplicate appointment events from webhook retries.
  Mitigation: persist a Meta event delivery log keyed by booking uid and event name.
- Risk: weak attribution from missing browser identifiers.
  Mitigation: capture `_fbp`, preserve `_fbc`, and derive `_fbc` from `fbclid` when needed.
- Risk: Meta outage or rejection impacts lead UX.
  Mitigation: keep Meta sending non-blocking and never fail the user response because of Meta.

## Approval Gate

This is a substantial cross-cutting change touching frontend tracking, Worker logic, secrets, and D1 storage. Per repo standards, implementation should start only after approval of this plan.

## Recommended Implementation Scope

- Phase 1: `Lead` browser plus server deduped event
- Phase 2: `Schedule` server-side event from Cal.com webhook
- Phase 3: test-mode validation and production rollout