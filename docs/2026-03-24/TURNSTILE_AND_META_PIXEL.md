# March 24, 2026 Turnstile And Meta Pixel

## Objective

Add anti-spam verification to the lead flow and add browser-side Meta Pixel tracking to the landing page.

## Completed

- Added Cloudflare Turnstile to the landing page and Worker lead API.
- Stored the Turnstile secret in both Cloudflare Worker environments.
- Deployed the updated Worker and landing page.
- Added Meta Pixel using Pixel ID `1093337934791191`.
- Added the standard Meta `PageView` browser event and `noscript` fallback image.

## Main Findings

- Turnstile was integrated at the Worker verification layer, not just the frontend widget layer.
- Meta tracking added on this date was browser-side Pixel only; no server-side Meta Conversions API was implemented in this session.

## Related Durable Docs

- `docs/ECOSYSTEMS_ROOFING_LANDING_IMPLEMENTATION.md`

## Files Referenced

- `site/index.html`
- `site/assets/app.js`
- `worker/src/index.js`
- `worker/.dev.vars.example`

## Validation

- Static validation passed on the updated landing markup.
- Pages deploy returned `200 OK` on the deployed URL.
- Worker `/health` checks returned `200` for both `prd` and `devmt`.
- Browser-issued Turnstile token validation was not fully exercised from the terminal because that requires a real browser widget token.

## Follow-Up

- Use this file when tracking the history of Turnstile and browser Meta Pixel changes.