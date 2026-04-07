# March 31, 2026 Meta Conversions API Test Event Validation

## Objective

Validate that the deployed Meta Conversions API implementation can send a server-side test event to Meta using the Events Manager test code.

## Inputs Used

- Meta test event code: `TEST10022`
- Pixel: `1093337934791191`

## Completed

- Stored `META_TEST_EVENT_CODE` as a Worker secret in both `prd` and `devmt`.
- Sent a controlled test lead through the `devmt` Worker so validation did not depend on the production API route.
- Confirmed the `devmt` Worker emitted a server-side Meta `Lead` event successfully.

## Validation Evidence

- `devmt` health check returned `{"ok":true}` before validation.
- A labeled test lead submission to `https://devmt.ecolanding.workers.dev/api/lead` returned:
  - `{"ok":true,"message":"Thank you. ECO Systems will review your request and reach out shortly."}`
- The Worker runtime tail then logged a successful Meta send:
  - `Meta conversion event sent { eventName: 'Lead', sourceType: 'lead', sourceKey: 'meta-test-lead-20260331101742', responseStatus: 200 }`

## Result

- The server-side `Lead` event path is validated end to end against Meta test-mode configuration.
- The validated test event id was `meta-test-lead-20260331101742`.

## Schedule Validation Status

- `Schedule` was not validated in this session.
- The Worker implementation is deployed, but a real Cal.com booking or a correctly signed Cal.com webhook replay is still required to exercise that path.
- The webhook secret is stored in Cloudflare and is not retrievable from the current environment, so a synthetic unsigned POST would not validate the production logic.

## Files Referenced

- `worker/src/index.js`
- `worker/wrangler.toml`
- `docs/2026-03-31/META_CONVERSIONS_API_IMPLEMENTATION.md`

## Follow-Up

- Refresh Meta Events Manager test events and confirm the `Lead` test event appears under `TEST10022`.
- If `Schedule` also needs explicit validation, either create one clearly labeled Cal.com test booking or replay one signed webhook from Cal.com with the shared secret still configured.