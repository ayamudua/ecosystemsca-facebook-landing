# March 31, 2026 Meta Tracking Audit

## Objective

Confirm whether the reference flat-roofs funnel already used Facebook Conversions API and whether the deployed landing page had the same implementation.

## Completed

- Inspected the reference page at `https://ecosystemsca.co/flat-roofs`.
- Inspected the deployed landing page at `https://ecosystemsca.net`.
- Compared both public pages against the repository frontend and Worker source.
- Confirmed the landing stack currently uses browser Meta Pixel only and not Facebook Conversions API.

## Main Findings

- Both public pages load the standard Meta browser pixel and `PageView` using Pixel ID `1093337934791191`.
- The frontend captures `fbclid` and passes it to the Worker.
- The Worker persists `fbclid` into downstream lead metadata, but it does not send server-side Meta conversion events to Meta Graph API.
- No delivered HTML or repo code indicated an existing Facebook Conversions API implementation.

## Related Durable Docs

- `docs/ECOSYSTEMS_ROOFING_LANDING_IMPLEMENTATION.md`

## Files Referenced

- `site/index.html`
- `site/assets/app.js`
- `worker/src/index.js`

## Validation

- Live HTML was pulled for both public pages.
- Repository searches covered `fbq`, `fbevents`, `graph.facebook.com`, `_fbp`, `_fbc`, and `fbclid`.

## Follow-Up

- If server-side Meta attribution is still desired, it should be implemented as a new feature rather than assumed to already exist.