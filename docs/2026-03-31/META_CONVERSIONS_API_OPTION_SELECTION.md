# March 31, 2026 Meta Conversions API Option Selection

## Objective

Determine which Meta Conversions API setup option fits the ECO Systems landing implementation.

## Decision

- The correct option for this implementation is `Set up the Conversions API manually`.

## Why This Is The Right Fit

- The landing page is a custom static site, not a partner-managed platform like Shopify, Wix, WordPress, or WooCommerce.
- The server-side event sender needs to be the existing Cloudflare Worker, not a partner integration.
- The implementation requires custom event timing tied to the existing `POST /api/lead` flow and the existing Cal.com webhook flow.
- The plan includes deduped browser plus server `Lead` events and a separate server-side `Schedule` event from the booking webhook, which is not a standard partner-template use case.

## Why The Other Options Do Not Fit Well

### Partner Setup

- Not a fit for this stack because the site is not running on the supported partner platforms shown in the Meta UI.
- It would not give the needed control over the existing Cloudflare Worker logic and Cal.com webhook event mapping.

### Conversions API Gateway

- It could work in a broad technical sense, but it is not the best fit for this implementation.
- Gateway is more useful when the goal is low-code website event forwarding.
- This project already has a custom Worker backend and needs custom event construction, hashing, deduplication, and webhook-based appointment tracking.
- Adding Gateway would introduce another layer without removing the need for custom logic around booking events and lead-flow timing.

## Recommended Next Step

- Continue with the manual implementation plan in `docs/2026-03-31/META_CONVERSIONS_API_PLAN.md`.
- Once the Meta Conversions API access token is available, implement both events:
  - `Lead` from successful Worker lead submission with browser deduplication
  - `Schedule` from the Cal.com webhook confirmation path

## References

- `docs/2026-03-31/META_CONVERSIONS_API_PLAN.md`

## Validation

- Reviewed the Meta setup options shown in the UI screenshot.
- Compared those setup models against the current repository architecture: custom static frontend, Cloudflare Worker backend, and Cal.com webhook flow.