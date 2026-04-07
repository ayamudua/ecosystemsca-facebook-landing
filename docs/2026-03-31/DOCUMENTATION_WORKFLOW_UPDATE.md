# March 31, 2026 Documentation Workflow Update

## Objective

Stop recording unrelated or repeated session updates in a single long-running document and switch to independent dated session records for easier troubleshooting and follow-up.

## Decision

- Going forward, every session must be documented in its own file under `docs/<YYYY-MM-DD>/`.
- Root-level docs in `docs/` remain for durable feature, plan, and runbook material.
- Session records can reference those durable docs when context is useful, but they should not be merged into one endlessly growing session log.

## Changes Applied

- Added a repo documentation index at `docs/README.md`.
- Updated the repository README to make the dated-session convention explicit.
- Created this dated session note to establish the new workflow in-repo.
- Backfilled recent March work into separate dated session files so completed work is easier to locate by date.

## Files Touched

- `README.md`
- `docs/README.md`
- `docs/2026-03-23/LANDING_INFRASTRUCTURE_AND_OPERATIONS.md`
- `docs/2026-03-24/TURNSTILE_AND_META_PIXEL.md`
- `docs/2026-03-30/APPOINTMENT_SCHEDULING_AND_WEBHOOKS.md`
- `docs/2026-03-31/META_TRACKING_AUDIT.md`
- `docs/2026-03-31/DOCUMENTATION_WORKFLOW_UPDATE.md`

## References

- `docs/ECOSYSTEMS_ROOFING_LANDING_IMPLEMENTATION.md`
- `docs/FLAT_ROOF_APPOINTMENT_SCHEDULING_OPTIONS.md`

## Validation

- Verified the repository now exposes a dedicated docs index and a dated session folder for March 31, 2026.
- Verified recent March work now has separate date-based session records for quick follow-up.
- No code behavior changed in this session.

## Follow-Up

- Future sessions should add a new dated file rather than appending the full update history to the existing root-level implementation documents.