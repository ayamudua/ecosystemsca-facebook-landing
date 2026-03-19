# ECO Systems Facebook Landing

Minimal static landing page plus Cloudflare Worker for a flat-roof Facebook campaign.

## Structure

- `site/` static landing page files
- `worker/` Cloudflare Worker for lead submission, Google review retrieval, and Google Sheets logging
- `docs/` planning and implementation notes

## What is implemented

- Landing page patterned on the existing flat-roofs funnel with minimal deviation in flow
- Three-step form that submits to `POST /api/lead`
- Worker endpoint that validates the form, forwards the lead to JobNimbus, and logs every attempt to Google Sheets
- Worker endpoint that fetches Google review highlights from the Places API and returns a normalized carousel payload
- D1-backed review archive endpoints that can serve a fuller synced Google Business Profile archive plus owner responses
- Protected admin sync endpoint and scheduled sync hook for archived Google Business Profile reviews
- Full-review CTA that sends visitors to the complete Google review profile

## Deploy shape

Recommended deployment:

1. Deploy `site/` to Cloudflare Pages on the root domain.
2. Deploy the Worker and route `/api/*` on that same root domain.
3. Keep all API keys and service-account credentials in Worker secrets.

This lets the static site call `/api/lead` and `/api/reviews` without cross-origin complexity.

## Worker configuration

Copy [worker/.dev.vars.example](worker/.dev.vars.example) into local secrets for development and set the same values in Cloudflare for production.

Required values:

- `JOBNIMBUS_API_KEY`
- `JOBNIMBUS_RESOURCE_PATH`
- `GOOGLE_PLACES_API_KEY`
- `GOOGLE_PLACE_ID`
- `GOOGLE_BUSINESS_CLIENT_ID`
- `GOOGLE_BUSINESS_CLIENT_SECRET`
- `GOOGLE_BUSINESS_REFRESH_TOKEN`
- `GOOGLE_BUSINESS_ACCOUNT_ID`
- `GOOGLE_BUSINESS_LOCATION_ID`
- `REVIEW_ARCHIVE_ADMIN_TOKEN`
- `GOOGLE_SHEETS_CLIENT_EMAIL`
- `GOOGLE_SHEETS_PRIVATE_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`

For the archive feature, also bind a D1 database as `REVIEWS_DB` and apply the migration in [worker/migrations/0001_google_review_archive.sql](worker/migrations/0001_google_review_archive.sql).

## JobNimbus note

The Worker is now defaulted to the verified legacy create route `https://app.jobnimbus.com/api1/contacts` with Bearer-token authentication.

This account accepted contact creation on `api1/contacts` and required `display_name` plus legacy snake_case field names. It also honored `is_archived: false`, `is_active: true`, and `status_name: "New"` so new leads land in Customer Journey as active New contacts. If your JobNimbus account uses a different route, update `JOBNIMBUS_API_BASE_URL` and `JOBNIMBUS_RESOURCE_PATH`.

## Google Sheets setup

1. Create a Google Cloud service account with Sheets access.
2. Share the target spreadsheet with the service-account email.
3. Add the service-account email, private key, and spreadsheet ID to Worker secrets.
4. Create a sheet tab named `Lead Log`, or change `GOOGLE_SHEETS_SHEET_NAME`.

Suggested header row for the sheet:

`timestamp | outcome | jobnimbus_status | first_name | last_name | full_name | phone | email | address | city | state | zip | full_address | county | property_type | issue | timeline | roof_condition | utm_source | utm_medium | utm_campaign | utm_content | fbclid | page_url | ip_address | user_agent | upstream_message | upstream_response`

## Google Review Archive Setup

1. Create a D1 database for review storage.
2. Bind it to the Worker as `REVIEWS_DB` in `wrangler.toml`.
3. Apply [worker/migrations/0001_google_review_archive.sql](worker/migrations/0001_google_review_archive.sql).
4. Create a Google OAuth client that can access the verified ECO Systems Business Profile.
5. Generate a refresh token with `business.manage` scope for a user who has access to the ECO Systems profile.
6. Add `GOOGLE_BUSINESS_CLIENT_ID`, `GOOGLE_BUSINESS_CLIENT_SECRET`, `GOOGLE_BUSINESS_REFRESH_TOKEN`, `GOOGLE_BUSINESS_ACCOUNT_ID`, and `GOOGLE_BUSINESS_LOCATION_ID` to Worker secrets.
7. Add `REVIEW_ARCHIVE_ADMIN_TOKEN` to protect the manual sync endpoint.
8. Run `POST /api/admin/reviews/sync` with that admin token to seed the archive.

Public archive endpoints:

- `GET /api/reviews/archive?page=1&pageSize=6`
- `GET /api/reviews/archive/meta`

Protected admin endpoints:

- `POST /api/admin/reviews/sync`
- `GET /api/admin/reviews/sync-status`

`REVIEW_ARCHIVE_ADMIN_TOKEN` is not a Google credential and should not be entered into Google OAuth setup screens. It is just an internal shared secret used by this Worker to protect manual archive-sync endpoints.

The landing page now prefers the archived review endpoint first. If the archive is not configured or empty, it falls back to the current Places-based featured reviews.

## Local development

Worker:

```bash
cd worker
npm install
npm run dev
```

Manual review sync after secrets are configured:

```bash
curl -X POST http://127.0.0.1:8787/api/admin/reviews/sync \
	-H "X-Admin-Token: replace-with-your-worker-admin-secret"
```

Static page:

Serve the `site/` folder with any static server, or upload it directly to Cloudflare Pages.
