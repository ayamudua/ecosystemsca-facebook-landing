# March 30, 2026 Appointment Scheduling And Webhooks

## Objective

Move the landing flow from lead capture only into a booking-aware appointment flow, including post-booking follow-up handling, webhook-backed Cal.com confirmation, and spreadsheet appointment-status updates.

## Completed

- Refined the appointment prototype flow and follow-up experience.
- Added webhook-backed Cal.com booking confirmation support.
- Added `POST /api/cal/webhook` and `GET /api/cal/booking-status` in the Worker.
- Added D1 storage for Cal.com booking confirmations.
- Prepared and applied the production webhook secret and production D1 migration.
- Implemented the production post-booking follow-up page.
- Updated Google Sheets appointment-status synchronization so confirmed bookings could mark the latest lead row correctly.
- Patched the spreadsheet updater so it recognizes both `Appointment Scheduled?` and `Appointment Completed?` headers and tolerates address-format mismatches.
- Deployed the production Worker with the appointment-status update fix.

## Main Findings

- Booking confirmation could not rely only on the frontend Cal.com callback; webhook-backed confirmation was required for reliability.
- Spreadsheet appointment tracking needed both header alias support and softer address matching to avoid leaving confirmed bookings marked `No`.

## Related Durable Docs

- `docs/FLAT_ROOF_APPOINTMENT_SCHEDULING_OPTIONS.md`

## Files Referenced

- `worker/src/index.js`
- `worker/migrations/0002_cal_booking_confirmations.sql`
- `site/schedule.html`
- `site/post-booking-video.html`
- `site/assets/schedule.js`
- `site/assets/post-booking.js`
- `site/assets/prototype-booking.js`
- `site/assets/prototype-booking.css`

## Validation

- Static validation was completed for the Worker appointment-status fix.
- `node --check worker/src/index.js` completed successfully.
- Production Worker deployment succeeded after clearing the conflicting Cloudflare token environment variable.
- Signed webhook replay and booking-status lookup were documented as successful for the production appointment-status path.
- One real production booking is still the final live confirmation step for end-to-end spreadsheet completion state.

## Follow-Up

- Use this file as the first stop for March 30 booking-flow completion work.