# JobNimbus Booking Task Sync

## Objective

Mirror confirmed Cal.com bookings into JobNimbus as `Initial Appointment` tasks so JobNimbus SMS automation can trigger from task creation and use the task start date/time fields.

## Implementation Summary

- The Worker caches the JobNimbus contact `jnid` returned by successful lead creation and now also stores the related JobNimbus `customer` id when available.
- On confirmed Cal.com booking webhooks, the Worker resolves the matching JobNimbus contact and customer record.
- The Worker creates one JobNimbus task per tracked booking through the legacy `api1/tasks` endpoint.
- The created task uses `record_type_name = Initial Appointment`, carries the booking start timestamp in `date_start`, and includes the linked contact in `related`.
- D1 stores booking-task delivery state so repeated webhook retries do not create duplicate JobNimbus tasks for the same booking uid.

## Data Model

Migrations:

- `worker/migrations/0004_jobnimbus_booking_activities.sql`
- `worker/migrations/0005_jobnimbus_booking_tasks.sql`

Tables:

- `jobnimbus_contact_links`
  - stores lead email to JobNimbus contact mappings captured from successful lead creation
  - now also stores `customer_jnid` for later task creation
- `jobnimbus_booking_tasks`
  - stores one record per Cal.com booking uid for JobNimbus task idempotency and troubleshooting

## Runtime Behavior

### Lead submit path

- `POST /api/lead` still creates the JobNimbus contact first.
- When JobNimbus returns a contact payload with a `jnid`, the Worker stores the mapping in D1 keyed by lead email.
- If the payload also includes the JobNimbus `customer` id, that id is stored alongside the contact link for later task creation.

### Booking webhook path

- `POST /api/cal/webhook` still verifies the signature, stores the booking confirmation, and updates Google Sheets.
- For booking statuses `accepted` and `rescheduled`, the Worker now attempts JobNimbus task sync.
- Contact resolution order:
  - first: cached D1 contact link by email, preferring matching address when available
  - fallback: live JobNimbus contact lookup through `api1/contacts?email=...`
- The created task contains booking status, event title, booking start and end time, property address, attendee details, and the Cal.com booking uid in its description.

## External API Notes

- The working JobNimbus task-create path for this account is the legacy route `https://app.jobnimbus.com/api1/tasks`.
- This account accepts `record_type_name` on task creation, and `record_type_name = "Initial Appointment"` stores back as task type `Initial Appointment`.
- A minimal valid payload requires at least `title`, `customer`, and `date_start`.
- A linked contact can be included in `related` so the task stays attached to the correct JobNimbus contact.

## Files Touched

- `worker/src/index.js`
- `worker/migrations/0005_jobnimbus_booking_tasks.sql`
- `worker/wrangler.toml`
- `worker/.dev.vars.example`
- `README.md`
- `docs/JOBNIMBUS_BOOKING_TASK_SYNC.md`
- `docs/2026-04-07/JOBNIMBUS_INITIAL_APPOINTMENT_TASK_SYNC.md`

## Validation

- Verified JobNimbus task creation directly against the live API key using controlled probe payloads.
- Confirmed `record_type_name = "Initial Appointment"` is accepted and stored back correctly by JobNimbus.
- Confirmed `date_start` persists on the created task and a linked contact in `related` is preserved.
- `node --check worker/src/index.js` completed successfully.
- Applied migration `0005_jobnimbus_booking_tasks.sql` to both remote D1 databases: `prd` and `devmt`.
- Deployed updated Workers to both `prd` and `devmt`.
- Verified both Worker health endpoints returned `{"ok":true}` after deployment.
- Verified a fresh production booking created both a new `cal_booking_confirmations` row and a matching JobNimbus `Initial Appointment` task linked to the booked contact.
- User confirmed JobNimbus also sent the downstream SMS message for the fresh production `Initial Appointment` task.

## Remaining Notes

- The earlier activity-based sync is superseded because the live SMS automation is task-based.
- A future enhancement may be needed if rescheduled bookings should update an existing JobNimbus task instead of creating only the first task per booking uid.