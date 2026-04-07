# April 7, 2026 JobNimbus Initial Appointment Task Sync

## Objective

Replace the earlier JobNimbus activity-based booking sync with task creation that matches the live SMS automation trigger: `Task is Created` with `Task Type = Initial Appointment`.

## Root Cause

- The first implementation targeted JobNimbus activities because that API surface was validated first.
- A later review of the live JobNimbus automation showed the SMS trigger is task-based, not activity-based.
- The automation template also depends on task-level date/time fields, so booking sync needed to create a real JobNimbus task with `date_start` rather than only a CRM note.

## Changes Made

- Updated the Worker booking sync path from `api1/activities` to `api1/tasks`.
- Set the outbound task payload to use `record_type_name = Initial Appointment`.
- Populated `date_start` from the Cal.com booking start time and included `date_end` when an end time was available.
- Linked the task to the resolved JobNimbus contact through the `related` array.
- Added schema migration `worker/migrations/0005_jobnimbus_booking_tasks.sql` to:
  - add `customer_jnid` to `jobnimbus_contact_links`
  - rename the booking idempotency table from `jobnimbus_booking_activities` to `jobnimbus_booking_tasks`
  - rename `activity_jnid` to `task_jnid`
- Added Worker config defaults for `JOBNIMBUS_BOOKING_TASK_TITLE` and `JOBNIMBUS_BOOKING_TASK_TYPE`.

## Files Touched

- `worker/src/index.js`
- `worker/migrations/0005_jobnimbus_booking_tasks.sql`
- `worker/wrangler.toml`
- `worker/.dev.vars.example`
- `README.md`
- `docs/README.md`
- `docs/2026-04-06/CALCOM_PAID_API_AND_JOBNIMBUS_STATUS_OPTIONS.md`
- `docs/JOBNIMBUS_BOOKING_TASK_SYNC.md`

## Validation Performed

- Live JobNimbus task probe without explicit task type returned `record_type_name = Phone Call`.
- Live JobNimbus task probe with `record_type_name = Initial Appointment` returned `record_type = 4` and `record_type_name = Initial Appointment`.
- Live JobNimbus task probe with a linked contact in `related` preserved the contact link on the created task.
- Confirmed the task API accepted `date_start` and stored it on the created task.
- `node --check worker/src/index.js` completed successfully.
- Applied `worker/migrations/0005_jobnimbus_booking_tasks.sql` to remote `prd` and `devmt` D1.
- Deployed the updated Worker to `devmt` version `b18ee8ae-b5e5-4340-b87c-8003f63b546a`.
- Deployed the updated Worker to `prd` version `04faed2f-7832-4a23-8841-a633ff6571b3`.
- Verified `https://devmt.ecolanding.workers.dev/health` returned `200 {"ok":true}`.
- Verified `https://prd.ecolanding.workers.dev/health` returned `200 {"ok":true}`.
- Verified a fresh production booking created the expected JobNimbus `Initial Appointment` task.
- User confirmed the downstream JobNimbus SMS message was sent for that task.

## Validation Pending

- None for the task-based SMS trigger path.

## Remaining Risks

- JobNimbus's delete endpoint returned `405` during probe cleanup, so the temporary probe records created during API validation were not removed through the API.
- The current idempotency model still tracks one success row per booking uid, so a later reschedule flow may need additional logic if operations want a new task or a task update when appointment time changes.