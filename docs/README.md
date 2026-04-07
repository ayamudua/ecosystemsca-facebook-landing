# Documentation Layout

This repository uses two documentation layers so implementation history stays easy to follow.

## Root Docs

Use root-level files in `docs/` for durable, topic-based documentation:

- plans
- implementation references
- runbooks
- feature-specific technical notes

These files should explain the system or feature, not absorb every future session update forever.

## Session Records

Every work session must be recorded independently in its own dated file under `docs/<YYYY-MM-DD>/`.

Rules:

1. Create the date folder if it does not already exist.
2. Create a separate file for the session instead of appending the full session narrative into an older catch-all file.
3. Include the objective, findings or changes, files touched, validation performed, and follow-up items.
4. Add references to related root-level docs when that helps connect the session to a broader feature history.

Example:

- `docs/2026-03-31/DOCUMENTATION_WORKFLOW_UPDATE.md`

Current durable docs:

- `docs/ECOSYSTEMS_ROOFING_LANDING_PLAN.md`
- `docs/ECOSYSTEMS_ROOFING_LANDING_IMPLEMENTATION.md`
- `docs/FLAT_ROOF_APPOINTMENT_SCHEDULING_OPTIONS.md`
- `docs/GOOGLE_REVIEW_ARCHIVE_SYNC.md`
- `docs/JOBNIMBUS_BOOKING_TASK_SYNC.md`

Backfilled recent session records:

- `docs/2026-03-23/LANDING_INFRASTRUCTURE_AND_OPERATIONS.md`
- `docs/2026-03-24/TURNSTILE_AND_META_PIXEL.md`
- `docs/2026-03-30/APPOINTMENT_SCHEDULING_AND_WEBHOOKS.md`
- `docs/2026-03-31/META_TRACKING_AUDIT.md`
- `docs/2026-03-31/DOCUMENTATION_WORKFLOW_UPDATE.md`

Current March 31 planning docs:

- `docs/2026-03-31/META_CONVERSIONS_API_PLAN.md`

Current March 31 Meta decision records:

- `docs/2026-03-31/META_CONVERSIONS_API_OPTION_SELECTION.md`

Current March 31 implementation records:

- `docs/2026-03-31/META_CONVERSIONS_API_IMPLEMENTATION.md`

Current March 31 validation records:

- `docs/2026-03-31/META_CONVERSIONS_API_TEST_EVENT_VALIDATION.md`

Current April 2 investigation records:

- `docs/2026-04-02/JOBNIMBUS_APPOINTMENT_EVALUATION.md`

Current April 6 evaluation records:

- `docs/2026-04-06/CALCOM_PAID_API_AND_JOBNIMBUS_STATUS_OPTIONS.md`

Current April 7 implementation records:

- `docs/2026-04-07/JOBNIMBUS_INITIAL_APPOINTMENT_TASK_SYNC.md`
- `docs/2026-04-07/LEAD_ALERT_EMAIL_WORDING_UPDATE.md`