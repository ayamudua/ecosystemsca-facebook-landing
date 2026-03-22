# ECO Systems Roofing Landing Implementation

## Objective

Implement a minimal static landing page for Facebook traffic that stays visually close to the current flat-roofs page, submits 3-step form leads to JobNimbus, shows Google review highlights, and logs every submission attempt in Google Sheets.

## Decisions Applied

- Landing target: root domain on Cloudflare
- CRM target: JobNimbus customer lead flow
- Review source: temporary Google place `ChIJZ6r9NmerK4cRuFVIH4BcUxI` until final production credentials are swapped in
- Logging policy: all submissions logged to Google Sheets

## Files Added

- `.gitignore`
- `site/index.html`
- `site/assets/styles.css`
- `site/assets/app.js`
- `worker/package.json`
- `worker/wrangler.toml`
- `worker/.dev.vars.example`
- `worker/src/index.js`
- `README.md`

## Implementation Summary

### Frontend

- Built a single static landing page with a direct-response layout modeled on the existing flat-roofs funnel
- Refined the top of page and the form to match the provided screenshot pattern: centered headline stack plus a strict 3-screen form
- Added the provided ECO Systems logo above the headline and inserted a review-summary band immediately beneath the form
- Tuned the social-proof band so the savings sentence stays on one line at desktop widths and the blue review button opens the Google review profile instead of the direct popup route
- Reworked the reviews section into a multi-card grid with a Load More action so the presentation matches the desired review-wall pattern while still respecting Google API limits
- Upgraded the review wall to a 3-column desktop grid with 2-column tablet fallback, inline show-more toggles for longer reviews, and reviewer avatar support with initials fallback when no photo is available
- Updated the footer navigation so `Home` points to `https://ecosystemsca.com`, `Contact Us` points to `https://ecosystemsca.com/contact-us/`, and added the logo-only favicon to the page head

### Current Form Shape

- Step 1: LA County yes or no
- Step 2: street address, city, state, ZIP code
- Step 3: name, cell phone, email address, then submit

### Worker

- Added `POST /api/lead` for lead validation, JobNimbus forwarding, and Google Sheets logging
- Added `GET /api/reviews` for Google Places review retrieval and response caching
- Added `GET /api/reviews/archive` and `GET /api/reviews/archive/meta` for D1-backed archived Google Business Profile reviews
- Added `POST /api/admin/reviews/sync` plus `GET /api/admin/reviews/sync-status`, and a scheduled sync hook for importing archived Google Business Profile reviews into D1
- Stored credentials server-side only through Worker environment variables and secrets
- Verified a live JobNimbus create route for this account at `https://app.jobnimbus.com/api1/contacts` and updated the Worker defaults to that legacy contact schema
- Verified that `is_archived: false`, `is_active: true`, and `status_name: "New"` place new contacts into Customer Journey as active New records
- Added duplicate-safe retry handling for JobNimbus contacts so repeated names can still submit by retrying with a unique display name suffix when JobNimbus rejects a duplicate display name
- Configured alternate local Google Places credentials and updated the frontend place ID/profile link to the temporary review source while waiting for final production Google credentials
- Updated the local static preview config so localhost automatically calls the Worker at `http://127.0.0.1:8787` for review data instead of trying to hit `/api/reviews` on the static server
- Normalized lead phone numbers to 10-digit mobile values before submission and mapped the persisted JobNimbus phone field to `mobile_phone`, which this verified legacy contact route stores
- Updated the verified legacy JobNimbus address mapping to `address_line1`, which direct live probes confirmed is the field that persists the street line into the Contact Information block
- Added a dedicated post-submit confirmation state on the landing page so successful leads see an assurance message and a summary of the submitted contact/property details before starting a new form
- Added formatted full-address preservation in the lead normalization path, JobNimbus description, and Google Sheets backup row so the entire property address survives even though the verified legacy contact route does not appear to persist a visible street-address field in the contact card response
- Added a review archive sync implementation plan and Phase 1 build that stores normalized Google Business Profile reviews and owner replies in D1 so the landing page can render a larger on-platform review archive

### Google Sheets Logging

- Implemented direct Sheets API append using a Google service account and JWT bearer flow
- Logged every lead attempt with submission details, tracking parameters, upstream status, and upstream response text

### Review Archive Sync

- Added a D1 migration at `worker/migrations/0001_google_review_archive.sql` for archived reviews and sync-run tracking
- Added Google Business Profile OAuth refresh-token support in the Worker for owner-authorized review syncing
- Added account auto-discovery for Google Business Profile sync so `GOOGLE_BUSINESS_ACCOUNT_ID` can be left blank when the project has account-management API access enabled
- Implemented review upserts keyed by Google `reviewId`, with sync-run tracking and `is_active` management for full-refresh style syncs
- Normalized and stored business owner replies from Google `reviewReply`, then exposed them through the public archive API
- Updated the frontend to prefer the archive endpoint first, paginate through archived reviews, and render `Response from ECO Systems` blocks when replies are available
- Clarified that the manual archive-sync protection token is an internal Worker secret and not a Google-issued OAuth token, while keeping backward compatibility with the original `ADMIN_SYNC_TOKEN` name

## Constraints Captured

- Google Places API exposes only a featured subset of reviews, not the full public review archive and not a native paginated feed of all public reviews
- The on-page review wall can paginate only within the subset returned to the Worker; the complete archive still lives on the Google review profile
- JobNimbus appears to use a legacy `app.jobnimbus.com/api1/contacts` route for this account rather than the newer public reference host, so route verification matters more than doc assumptions
- On the verified legacy JobNimbus contact route, direct schema probes showed `mobile_phone`, `state_text`, and `address_line1` persisting on contacts
- The review archive feature cannot be validated end to end until a D1 binding exists and Google Business Profile OAuth credentials are available for the ECO Systems profile

## Validation Performed

- Verified the reference public page structure before implementation
- Verified the ECO Systems site for brand and trust-signal cues
- Verified a live JobNimbus create request using the provided API key against `app.jobnimbus.com/api1/contacts`
- Verified direct JobNimbus schema probes showing that `mobile_phone` persists on the legacy route and that street-address fields do not appear to persist as first-class top-level contact fields on that route
- Verified a follow-up direct JobNimbus schema probe showing that `address_line1` is the correct persisted street-address field for the legacy contact route
- Verified a full end-to-end local Worker submission returned success after aligning the payload to `Customer Journey / Active / New` and adding duplicate display-name retry behavior
- Verified a second end-to-end local Worker submission using a formatted phone number like `(310) 555-0147` returned success after phone normalization changes
- Verified another end-to-end local Worker submission returned success after switching the legacy contact payload to `address_line1`
- Verified the local `/api/reviews` endpoint with the temporary Google Places key, and confirmed that the provided temporary place ID resolves successfully but points to `Zenox Physical Therapy & Wellness`, not ECO Systems
- Verified from Google Business Profile reference documentation that archive reviews include reviewer profile data plus `reviewReply`, and that owner replies are first-class data on the review object
- Verified the local archive sync endpoint and D1 migration with temporary Google Business Profile credentials: the Worker reached the OAuth refresh step and correctly recorded the failed sync run in D1, but Google returned `unauthorized_client`, which indicates the provided temporary client ID, client secret, and refresh token are not currently authorized as a working set for this app flow
- Re-tested the archive sync after receiving a replacement refresh token value and confirmed the token matched the one already stored locally; the Google OAuth refresh result remained `unauthorized_client`, so the blocker is still the Google client/refresh-token authorization state rather than Worker logic or D1 setup
- Re-tested again with a genuinely different Google Business Profile refresh token and confirmed the OAuth refresh still fails with `unauthorized_client`, which strongly indicates the Google OAuth client configuration itself is not authorized for this refresh-token flow or the refresh token was not minted for this exact client pair
- Re-tested the local archive sync with a fresh credential set using client ID `1033034472443-1o7tuj5atvq4mrfutrqbnvfgjbi8au5m.apps.googleusercontent.com`, account ID `112218435679712657618`, and location ID `12249021452620888415`; Google returned `deleted_client` during the refresh-token exchange, which is a definitive signal that this OAuth client no longer exists in Google Cloud and cannot be used for Business Profile sync until replaced or recreated
- Reproduced the OAuth failure outside the Worker by calling `https://oauth2.googleapis.com/token` directly with the current values from `worker/.dev.vars`; Google still rejected the refresh-token exchange before any Business Profile API call. The direct request returned `unauthorized_client` while the local Worker dev session continued returning `deleted_client`, which indicates the blocker is still the Google OAuth client and refresh-token state rather than D1 storage, archive logic, or the review-list API call itself
- Re-tested again on March 22, 2026 with the newest ECO Systems credential set using client ID `385952202644-at52nkklgr3ju01624nc8bfnhgfgfgt4.apps.googleusercontent.com`, location ID `3545934449422391897`, and a new refresh token. This time the refresh-token exchange succeeded, which confirms the OAuth credential trio is finally valid. Google then blocked the next calls at the API layer instead: `mybusinessaccountmanagement.googleapis.com` returned `RESOURCE_EXHAUSTED` with quota `0 requests/minute`, and `mybusiness.googleapis.com` returned `SERVICE_DISABLED`. That means the remaining blocker is now Google Cloud API enablement and Business Profile project approval, not the Worker code and not the OAuth refresh token.
- While waiting on Google quota approval, switched the landing page review UI into live Places-only mode so it no longer attempts the D1 archive first. Also replaced the old temporary Zenox review links with the ECO Systems public place record resolved from the contact address: `Eco Roof Solar`, place ID `ChIJt45P39m6woARDs_3xzLtiRY`. Google currently returns the live Maps URI for that place but no rating or featured review fields, so the page now shows a truthful fallback state that opens the real Google profile instead of displaying the old unrelated business reviews.
- Updated the public review CTA links again using the user-provided Google Maps listing URL for `ECO Systems` so the page now opens the exact reviewed profile the user supplied, even though Google Places still does not expose review objects or rating counts for that listing through the current public Places response.

## Google Business Profile OAuth Remediation Notes

- The local Worker reaches Google's token endpoint successfully, so the failure is not caused by the request originating from the Worker instead of the browser.
- For this architecture, the browser should never call Google Business Profile directly. The Worker should hold the refresh token and exchange it server-side.
- Google Business Profile documentation still lists `https://www.googleapis.com/auth/business.manage` as a valid scope for review access, and the reviews API also accepts the legacy `https://www.googleapis.com/auth/plus.business.manage` scope.
- If Google shows `invalid_scope` at the browser authorization URL stage, the issue is usually not URL encoding alone. The more likely causes are that the Google Cloud project has not been approved for Business Profile API access, the required Business Profile APIs are not enabled for that project, or the OAuth client is not a `Web application` client configured for this flow.
- Google Business Profile basic setup explicitly requires the project to be approved for GBP API access before the APIs appear correctly in the project and before the recommended OAuth flow works reliably.
- `unauthorized_client` at the token refresh step usually points to one of these issues:
	1. The refresh token was minted for a different OAuth client ID than the one currently configured.
	2. The client secret does not match the client ID used to mint the refresh token.
	3. The OAuth client type or consent-screen configuration is not valid for this flow.
	4. The refresh token was issued without the needed Business Profile scope or the user/account linkage changed afterward.
- The safest recovery path is to mint a new refresh token using the exact same client ID and client secret that the Worker will use in production, then retest the Worker exchange unchanged.
- If Google returns `deleted_client`, stop retesting refresh tokens for that client immediately. A new refresh token cannot fix a deleted OAuth client. The next action is to create or recover a live OAuth client in Google Cloud, then mint a new refresh token from that live client.
- If Google returns `unauthorized_client` for a direct refresh-token request, the most likely causes are: the refresh token was minted for a different client ID, the client secret does not match the client ID, the project was not approved or enabled for Business Profile access, or the OAuth client type/consent configuration is not valid for this flow.
- If the refresh-token exchange succeeds but `accounts.list` returns quota `0` or `reviews.list` returns `SERVICE_DISABLED`, the OAuth client is working and the next fix is in Google Cloud: enable `mybusinessaccountmanagement.googleapis.com`, enable `mybusiness.googleapis.com`, and complete any required Business Profile API approval for the project.
- In either case, both `deleted_client` and `unauthorized_client` are failing at the OAuth token exchange layer, which means the review archive implementation itself has not yet been exercised against Google Business Profile data.

### Recommended Refresh-Token Generation Flow

- Use a Google OAuth client of type `Web application`.
- In the same Google Cloud project, confirm that Business Profile API access has been approved and that the Business Profile APIs are enabled. If the Google My Business APIs are missing from the API Library or quota remains at `0 QPM`, the project is not approved yet.
- Add an authorized redirect URI dedicated to local testing, for example:
	- `http://127.0.0.1:8788/oauth/google-business/callback`
- Build the consent URL with these required parameters:
	- `client_id=<your Google Business client id>`
	- `redirect_uri=http://127.0.0.1:8788/oauth/google-business/callback`
	- `response_type=code`
	- `scope=https://www.googleapis.com/auth/business.manage`
	- `access_type=offline`
	- `prompt=consent`
- If that exact scope still throws `invalid_scope`, retry once with the legacy fallback scope documented on the reviews API reference:
	- `scope=https://www.googleapis.com/auth/plus.business.manage`
- Sign into the Google account that actually has access to the target Business Profile account and location.
- After Google redirects back with `?code=...`, exchange that authorization code using the exact same client ID, client secret, and redirect URI.
- Store only the returned `refresh_token` in Worker secrets. The Worker will handle the refresh exchange server-side after that.

### Fastest Isolation Path

- Use OAuth Playground with your own OAuth credentials and the exact scope `https://www.googleapis.com/auth/business.manage`.
- Google Business Profile's own setup guide recommends OAuth Playground for a first-pass validation of project approval and OAuth configuration.
- If OAuth Playground also rejects the scope, the blocker is the Google Cloud project and API-access state, not the Worker.
- If OAuth Playground accepts the scope but your local consent URL does not, the blocker is your OAuth client configuration, redirect URI, or client type.

### Exact Local Test Pattern

- Authorization URL pattern:
	- `https://accounts.google.com/o/oauth2/v2/auth?client_id=<CLIENT_ID>&redirect_uri=http%3A%2F%2F127.0.0.1%3A8788%2Foauth%2Fgoogle-business%2Fcallback&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fbusiness.manage&access_type=offline&prompt=consent`
- Token exchange pattern:
	- `POST https://oauth2.googleapis.com/token`
	- form fields:
		- `code=<authorization code from redirect>`
		- `client_id=<CLIENT_ID>`
		- `client_secret=<CLIENT_SECRET>`
		- `redirect_uri=http://127.0.0.1:8788/oauth/google-business/callback`
		- `grant_type=authorization_code`
- Added configuration examples and deployment guidance in `README.md`

## Validation Not Yet Run

- Google Places can now be validated locally with the temporary API key and place ID
- The temporary Google Places credential pair is functional, but the provided place ID must be replaced before production because it resolves to the wrong business profile
- Google Sheets backup logging is still blocked because the local configuration uses a regular Gmail address instead of a Google service-account client email, and the provided short token is not a PEM private key, so the JWT auth flow still cannot obtain an OAuth token for Sheets append even after correcting the spreadsheet ID
- The local D1 archive binding and migration now exist for testing, but the temporary Google Business Profile OAuth values still fail at token refresh with `unauthorized_client`, so no review archive data has been imported yet
- No deployment was run because the target root domain and Cloudflare secrets are not yet configured in this workspace

## Google Reviews Activation

- The frontend does not call Google directly. It requests `/api/reviews` from the Worker.
- The Worker then calls Google Places using `GOOGLE_PLACES_API_KEY` and `GOOGLE_PLACE_ID`.
- If those values are missing, the landing page shows the review fallback state instead of live reviews.
- The on-page `Load More` button only expands the review subset already returned by Google Places. It does not fetch the full public archive because Google does not expose that as a paginated native API feed.
- For local testing, run the Worker with those env values set and point the static page at the local Worker base URL.
- For production, deploy the Worker on the same domain and route `/api/*` through it so the page can call `/api/reviews` directly.

## Review Display Optimization Notes

- A 3-column review grid is appropriate on desktop, with 2 columns on tablet and 1 column on mobile.
- Consistent review card heights should come from text clamping, not masonry. Clamp body copy to a fixed number of lines so the grid stays orderly.
- Longer reviews can start clamped and expand inline within the card. Keep the default collapsed state short enough that the wall stays tidy on first render.
- Reviewer profile images can be shown only if Google returns an image URL in the review payload. If not present, use initials or a neutral avatar fallback.
- The current `Load More` pattern can reveal more cards from the subset already returned by Google Places, but it cannot reveal the full public archive.
- Native Google Places data does not provide a complete paginated all-reviews feed for a business profile. To expose every review on-site, a different review-source strategy is required.

## Owned Full-Archive Strategy

- The strongest “quasi third-party within our platform” approach is to sync reviews from a verified Google Business Profile into our own backend store instead of relying on the public Places subset.
- Google Business Profile exposes a paginated owner API for verified locations: `accounts.locations.reviews.list`, with up to 50 reviews per page plus `nextPageToken`.
- A practical implementation for this project would be:
	1. Connect a verified ECO Systems Business Profile through OAuth with `business.manage` scope.
	2. Add an admin-only Worker sync route or scheduled job that pages through the review list until `nextPageToken` is exhausted.
	3. Normalize and store reviews in D1 or KV using review ID plus update time so syncs are incremental.
	4. Serve a new internal endpoint such as `/api/reviews/archive` from that stored dataset.
	5. Keep attribution, author name, rating, review text, review date, and Google source URL on every record.
	6. Refresh on a schedule, such as daily, and provide a manual resync action for operations.
- This keeps the visitor experience native to the landing page while avoiding dependence on an external embed vendor.
- The main requirements are verified profile ownership, OAuth setup, a small persistence layer, and compliance review for how Google-sourced content is stored and displayed.
- If profile ownership cannot be granted, the fallback remains the current featured-review wall plus a direct link to Google for the complete public archive.

## All Reviews Constraint

- If the goal is to let visitors browse every public Google review without leaving the landing page, native Places API is insufficient.
- The practical options are:
	1. Keep the on-page grid for featured reviews and link to the full Google profile for all reviews.
	2. Use a third-party review platform that legally syncs and hosts a fuller review feed for embedding.
	3. Maintain a curated internal reviews dataset and display it on-site while still linking to Google for verification.

## JobNimbus Test Path

1. Set `JOBNIMBUS_API_KEY` and the verified `JOBNIMBUS_RESOURCE_PATH` in Worker secrets or local `.dev.vars`.
2. Run the Worker locally with `npm install` then `npm run dev` from `worker/`.
3. Submit the landing page form or post a sample payload to `POST /api/lead`.
4. Confirm three outcomes together: Worker returns success, JobNimbus creates the record, and Google Sheets logs the attempt.
5. If JobNimbus rejects the payload, use the logged upstream status and response text in Google Sheets to correct the resource path or field mapping.

## Next Configuration Needed

1. Set the Worker secrets for JobNimbus, Google Places, and Google Sheets.
2. Confirm the correct JobNimbus `JOBNIMBUS_RESOURCE_PATH` for the customer lead object in your account.
3. Share the target spreadsheet with the Google service account.
4. Bind the Worker to `/api/*` on the Cloudflare root domain.
