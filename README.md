# ECO Systems Facebook Landing

Minimal static landing page plus Cloudflare Worker for a flat-roof Facebook campaign.

## Structure

- `site/` static landing page files
- `worker/` Cloudflare Worker for lead submission, Google review retrieval, and Google Sheets logging
- `docs/` planning and implementation notes

## What is implemented

- Landing page patterned on the existing flat-roofs funnel with minimal deviation in flow
- Three-step form that submits to `POST /api/lead`
- Post-submit scheduling flow that redirects to a dedicated first-party scheduling page with Cal.com prefill values in the URL
- Worker endpoint that validates the form, forwards the lead to JobNimbus, logs every attempt to Google Sheets, and sends an owner notification email for each completed submission attempt
- Worker endpoint that fetches Google review highlights from the Places API and returns a normalized carousel payload
- D1-backed review archive endpoints that can serve a fuller synced Google Business Profile archive plus owner responses
- Protected admin sync endpoint and scheduled sync hook for archived Google Business Profile reviews
- Full-review CTA that sends visitors to the complete Google review profile
- Current live mode on the landing page uses the public Google Places review endpoint directly and does not depend on the archive sync being populated
- Temporary iframe mode can mirror the flat-roofs page by embedding the same LeadConnector Google review widget while Google API approval is pending

## Deploy shape

Recommended deployment:

1. Deploy `site/` to Cloudflare Pages on the root domain.
2. Deploy the `prd` Worker environment and route `/api/*` on that same root domain.
3. Keep all API keys and service-account credentials in Worker secrets.

This lets the static site call `/api/lead` and `/api/reviews` without cross-origin complexity.

## Environment model

The Worker is split into two explicit Cloudflare environments:

- `prd`: production API routed to `https://ecosystemsca.net/api/*` and `https://www.ecosystemsca.net/api/*`
- `devmt`: development API deployed separately on `workers.dev` so testing does not interrupt the live landing flow

Current deployed endpoints:

- Production Worker preview: `https://prd.ecolanding.workers.dev`
- Development Worker: `https://devmt.ecolanding.workers.dev`
- Current production Pages deployment: `https://0b9a18a4.ecosystemsca-facebook-landing.pages.dev`

Wrangler commands:

- Production Worker: `npx wrangler deploy --env prd --config worker/wrangler.toml`
- Development Worker: `npx wrangler deploy --env devmt --config worker/wrangler.toml`
- Production Pages: `npx wrangler pages deploy site --project-name ecosystemsca-facebook-landing --branch production`

Preferred naming model:

- Production worker name: `prd`
- Development worker name: `devmt`
- Production custom domain: `https://ecosystemsca.net`

Important Cloudflare constraint: Cloudflare Workers does not issue bare URLs like `https://prd.workers.dev` or `https://devmt.workers.dev`. The actual URLs include the account Workers subdomain, so the real endpoints will be shaped like:

- `https://prd.ecolanding.workers.dev`
- `https://devmt.ecolanding.workers.dev`

Recommendation: use `https://prd.ecolanding.workers.dev` as the production preview/origin Worker URL behind `https://ecosystemsca.net`, and use `https://devmt.ecolanding.workers.dev` as the isolated development endpoint.

Current domain status: the Worker routes are deployed and healthy, the Pages production deployment is live, and `ecosystemsca.net` plus `www.ecosystemsca.net` are serving the Pages site publicly.

## Worker configuration

Copy [worker/.dev.vars.example](worker/.dev.vars.example) into local secrets for development. For Cloudflare, set secrets separately per environment so `devmt` can use test-only credentials without touching production.

Required values:

- `JOBNIMBUS_API_KEY`
- `JOBNIMBUS_RESOURCE_PATH`
- `GOOGLE_PLACES_API_KEY`
- `GOOGLE_PLACE_ID`
- `GOOGLE_BUSINESS_CLIENT_ID`
- `GOOGLE_BUSINESS_CLIENT_SECRET`
- `GOOGLE_BUSINESS_REFRESH_TOKEN`
- `GOOGLE_BUSINESS_LOCATION_ID`
- `REVIEW_ARCHIVE_ADMIN_TOKEN`
- `GOOGLE_SHEETS_CLIENT_EMAIL`
- `GOOGLE_SHEETS_PRIVATE_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `TURNSTILE_SECRET_KEY`
- `CAL_COM_WEBHOOK_SECRET`

Recommended lead email values:

- `LEAD_NOTIFICATION_EMAIL_TO` defaults to `infoeco411@gmail.com`
- `LEAD_NOTIFICATION_EMAIL_FROM` defaults to `alerts@ecosystemsca.net`
- `LEAD_NOTIFICATION_EMAIL_FROM_NAME` defaults to `ECO Systems Lead Alerts`
- `LEAD_NOTIFICATION_SUBJECT_PREFIX` is optional if you want to change the email subject prefix without editing code

Turnstile values:

- `TURNSTILE_SECRET_KEY` must be stored as a Worker secret in each environment
- the public Turnstile site key is intentionally embedded in [site/index.html](site/index.html) because Cloudflare site keys are meant to be public

`GOOGLE_BUSINESS_ACCOUNT_ID` is optional when the Google Cloud project has Business Profile account-management API access enabled. If omitted, the Worker will try to discover the first accessible account automatically.

For the archive feature, also bind a D1 database as `REVIEWS_DB` and apply the migration in [worker/migrations/0001_google_review_archive.sql](worker/migrations/0001_google_review_archive.sql).

Recommended separation:

- `prd` should use the real D1 database, live CRM secret, live Sheets backup target, and live Business Profile credentials
- `devmt` should use a separate D1 database and, if possible, separate test CRM / Sheets credentials or no lead-delivery secrets at all until you are ready to test them safely

## JobNimbus note

The Worker is now defaulted to the verified legacy create route `https://app.jobnimbus.com/api1/contacts` with Bearer-token authentication.

This account accepted contact creation on `api1/contacts` and required `display_name` plus legacy snake_case field names. It also honored `is_archived: false`, `is_active: true`, and `status_name: "New"` so new leads land in Customer Journey as active New contacts. If your JobNimbus account uses a different route, update `JOBNIMBUS_API_BASE_URL` and `JOBNIMBUS_RESOURCE_PATH`.

## Google Sheets setup

1. Create a Google Cloud service account with Sheets access.
2. Enable the Google Sheets API in the same Google Cloud project that owns that service account.
3. Share the target spreadsheet with the service-account email.
4. Add the service-account email, private key, and spreadsheet ID to Worker secrets.
5. Create a sheet tab named `Lead Log`, or change `GOOGLE_SHEETS_SHEET_NAME`.

If Google returns `SERVICE_DISABLED` or says `Google Sheets API has not been used in project ... before or it is disabled`, the service account credentials may still be valid. That specific failure means the Google Sheets API itself is disabled for the Google Cloud project behind the service account and must be enabled in Google Cloud before append calls can succeed.

Suggested header row for the sheet:

`timestamp | outcome | jobnimbus_status | first_name | last_name | full_name | phone | email | address | city | state | zip | full_address | county | property_type | issue | timeline | roof_condition | utm_source | utm_medium | utm_campaign | utm_content | fbclid | page_url | ip_address | user_agent | upstream_message | upstream_response`

## Cloudflare Turnstile setup

1. Create a Turnstile widget in Cloudflare.
2. Add the public site key to the inline landing-page config in [site/index.html](site/index.html).
3. Store `TURNSTILE_SECRET_KEY` as a Worker secret for both `prd` and `devmt`.
4. Keep the widget in managed mode with `appearance: "interaction-only"` so it stays quiet on page load and only becomes interactive if Cloudflare decides a challenge is needed.
5. The landing page submits the Turnstile token with the lead payload, and the Worker verifies it before any JobNimbus, Google Sheets, or lead-email side effects run.

Current Turnstile placement: the widget is rendered below the full quick-answer form instead of inside the form steps so the step flow remains uninterrupted.

## Meta Pixel setup

1. The landing page now loads the standard Meta Pixel bootstrap directly in [site/index.html](site/index.html).
2. The configured Pixel ID is `1093337934791191`.
3. The page tracks the default `PageView` event on load and includes Meta's `noscript` image fallback.
4. No Worker secret is required because Meta Pixel IDs are public identifiers.

## Cal.com setup

The landing page now supports a fast post-submit Cal.com handoff without changing the Worker lead pipeline.

How it works:

1. The user completes the existing 3-step lead form.
2. The Worker still receives the lead through `POST /api/lead`.
3. The frontend redirects the user to a dedicated scheduling page on the same domain.
4. That scheduling page reads the submitted values from the URL and passes them into the Cal.com booking URL and iframe.
5. Cal.com is responsible for appointment availability, Google Calendar sync, invite emails, and reminder delivery.

Required setup:

1. Put the actual Cal.com booking link into `window.ECO_LANDING_CONFIG.calComLink` in [site/index.html](site/index.html).
2. In Cal.com, configure the event to expose only the next 3 days of availability and the allowed time windows.
3. Connect that Cal.com event to the client's Google Calendar so scheduled appointments land in the Gmail-backed calendar and trigger notifications.

Current repository state:

- The redirect-based scheduling page is implemented at `site/schedule.html`.
- If `calComLink` is blank or invalid, the scheduling page falls back to a visible notice instead of rendering the booking iframe.
- Static asset URLs are versioned in the HTML so production browsers refresh the latest deployed JS and CSS after Pages deploys.
- The Worker now supports `POST /api/cal/webhook` for signed Cal.com booking webhooks and `GET /api/cal/booking-status` so the prototype can confirm bookings from the server side when the embed callback does not return to the parent page.

Recommended webhook setup:

1. In Cal.com, open `/settings/developer/webhooks`.
2. Create a webhook subscription for at least `Booking Created`.
3. Set the subscriber URL to the correct Worker environment endpoint:
	- development: `https://devmt.ecolanding.workers.dev/api/cal/webhook`
	- production: `https://ecosystemsca.net/api/cal/webhook`
4. Set a secret in Cal.com and store the same value in the Worker as `CAL_COM_WEBHOOK_SECRET`.
5. Apply the D1 migration `worker/migrations/0002_cal_booking_confirmations.sql` before testing the webhook-backed booking-status flow.

Prototype fallback behavior:

- The prototype still listens for Cal.com's frontend `bookingSuccessfulV2` event for immediate success UX.
- In parallel, the prototype now polls `GET /api/cal/booking-status` using the submitted lead email and submission timestamp.
- If Cal.com completes the booking but the embed callback never returns to the parent page, the webhook-backed status endpoint can still confirm the booking and continue the follow-up video handoff.

## Lead email fail-safe

The Worker now sends a non-blocking owner notification email for every completed lead submission attempt after the JobNimbus request finishes. This runs independently of Google Sheets logging so operations still receive the lead details even when Sheets append remains unavailable.

Default behavior:

- recipient: `infoeco411@gmail.com`
- sender: `alerts@ecosystemsca.net`
- sender name: `ECO Systems Lead Alerts`
- reply-to: the lead's submitted email address when present
- transport: Cloudflare Email Routing `send_email` binding from the Worker

Prerequisites:

- enable Cloudflare Email Routing on `ecosystemsca.net`
- verify `infoeco411@gmail.com` as a destination address in Email Routing
- make sure `alerts@ecosystemsca.net` is a routed sender on the same domain
- keep the Wrangler `send_email` binding named `LEAD_NOTIFICATION_EMAIL` deployed with that sender/destination relationship

## Google Review Archive Setup

1. Create a D1 database for review storage.
2. Bind it to the Worker as `REVIEWS_DB` in `wrangler.toml`.
3. Apply [worker/migrations/0001_google_review_archive.sql](worker/migrations/0001_google_review_archive.sql).
4. Create a Google OAuth client that can access the verified ECO Systems Business Profile.
5. Generate a refresh token with `business.manage` scope for a user who has access to the ECO Systems profile.
6. Add `GOOGLE_BUSINESS_CLIENT_ID`, `GOOGLE_BUSINESS_CLIENT_SECRET`, `GOOGLE_BUSINESS_REFRESH_TOKEN`, and `GOOGLE_BUSINESS_LOCATION_ID` to Worker secrets. Add `GOOGLE_BUSINESS_ACCOUNT_ID` too if you already know it or if the project cannot use account auto-discovery.
7. Add `REVIEW_ARCHIVE_ADMIN_TOKEN` to protect the manual sync endpoint.
8. Run `POST /api/admin/reviews/sync` with that admin token to seed the archive.

Public archive endpoints:

- `GET /api/reviews/archive?page=1&pageSize=6`
- `GET /api/reviews/archive/meta`

Protected admin endpoints:

- `POST /api/admin/reviews/sync`
- `GET /api/admin/reviews/sync-status`

`REVIEW_ARCHIVE_ADMIN_TOKEN` is not a Google credential and should not be entered into Google OAuth setup screens. It is just an internal shared secret used by this Worker to protect manual archive-sync endpoints.

Current ECO Systems Google credential status: the latest client ID, client secret, and refresh token can mint an access token successfully, but Google is still rejecting Business Profile account and review API calls because the Cloud project either has the relevant APIs disabled or still has `0` quota for them. Until `mybusiness.googleapis.com` and `mybusinessaccountmanagement.googleapis.com` are enabled and approved for the project, the archive sync cannot enumerate accounts or import reviews.

The landing page now prefers the archived review endpoint first. If the archive is not configured or empty, it falls back to the current Places-based featured reviews.

Temporary ECO Systems operating mode while Google Business Profile quota approval is pending: the landing page is configured to use the live public Google Places listing only. The current place record resolved from the ECO Systems contact address is `Eco Roof Solar` at `2633 Lincoln Blvd, Santa Monica, CA 90405` with place ID `ChIJt45P39m6woARDs_3xzLtiRY`. Google is currently returning the public listing link for that place but not any rating or review fields, so the landing page opens the real Google profile even when featured review cards are unavailable.

Temporary iframe fallback while approval is pending: the page can be switched to `iframe` review mode through the inline config in [site/index.html](site/index.html). That mode mirrors the live flat-roofs page by loading:

- LeadConnector widget script: `https://apisystem.tech/js/reviews_widget.js`
- LeadConnector review iframe: `https://backend.leadconnectorhq.com/appengine/reviews/get_widget/aYz5UgOHqy3fIQqucEZN`

When iframe mode is active, the page now declares that mode in the initial HTML, uses the live flat-roofs iframe id `msgsndr_reviews`, and hides the preserved API review wall with CSS so the user does not see the stale `Loading review highlights...` placeholder.

The iframe is cross-origin, so the widget's internal 3-column layout and any `Load More` behavior must come from the LeadConnector widget itself. Parent-page CSS cannot restyle the contents inside that iframe.

The direct API review wall remains intact in [site/assets/app.js](site/assets/app.js) and is only bypassed by the `reviewDisplayMode` flag so it can be restored quickly once Google Business Profile API access and quota are approved.

## Local development

Worker:

```bash
cd worker
npm install
npm run dev
```

Deploy production Worker:

```bash
cd worker
npm run deploy:prd
```

Deploy development Worker:

```bash
cd worker
npm run deploy:devmt
```

Manual review sync after secrets are configured:

```bash
curl -X POST http://127.0.0.1:8787/api/admin/reviews/sync \
	-H "X-Admin-Token: replace-with-your-worker-admin-secret"
```

Static page:

Serve the `site/` folder with any static server, or upload it directly to Cloudflare Pages.

## March 23, 2026 deployment result

- `prd` deployed successfully to `https://prd.ecolanding.workers.dev`
- `devmt` deployed successfully to `https://devmt.ecolanding.workers.dev`
- Production D1 migration state: already applied on `ecosystemsca-review-archive`
- Development D1 migration state: `0001_google_review_archive.sql` applied on `ecosystemsca-review-archive-devmt`
- Worker secrets provisioned for both `prd` and `devmt`, including JobNimbus, Google Places, Google Business Profile, Google Sheets, and admin sync token bindings
- Cloudflare Pages production deployment published successfully at `https://661b9799.ecosystemsca-facebook-landing.pages.dev`
- Health verification passed for both Workers at `/health`
- Remaining cutover task: attach `ecosystemsca.net` and `www.ecosystemsca.net` to the Pages project in Cloudflare Pages, then recheck DNS propagation
