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
- The LeadConnector fallback is a cross-origin iframe, so its internal 3-column layout and any continuous `Load More` behavior are controlled by the widget provider rather than this page's CSS
- Reworked the Cloudflare deployment shape into explicit `prd` and `devmt` Worker environments so production traffic can stay pinned to `ecosystemsca.net` while development runs on a separate Workers.dev deployment without interrupting the live landing. The production worker name now follows the preferred `prd` convention.
- JobNimbus appears to use a legacy `app.jobnimbus.com/api1/contacts` route for this account rather than the newer public reference host, so route verification matters more than doc assumptions
- On the verified legacy JobNimbus contact route, direct schema probes showed `mobile_phone`, `state_text`, and `address_line1` persisting on contacts
- The review archive feature cannot be validated end to end until a D1 binding exists and Google Business Profile OAuth credentials are available for the ECO Systems profile

## Validation Performed

- Verified the reference public page structure before implementation
- Verified the ECO Systems site for brand and trust-signal cues
- Verified a live JobNimbus create request using the provided API key against `app.jobnimbus.com/api1/contacts`
- Verified direct JobNimbus schema probes showing that `mobile_phone` persists on the legacy route and that street-address fields do not appear to persist as first-class top-level contact fields on that route
- Verified a follow-up direct JobNimbus schema probe showing that `address_line1` is the correct persisted street-address field for the legacy contact route
- Cloudflare Workers.dev URLs include the account Workers subdomain, so even with worker names `prd` and `devmt`, the public URLs will be shaped like `prd.<account-subdomain>.workers.dev` and `devmt.<account-subdomain>.workers.dev`, not bare `prd.workers.dev` or `devmt.workers.dev`
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
- Added a temporary iframe review mode that mirrors the live flat-roofs page using LeadConnector's review widget script and iframe source. The API-based Google review wall remains in place behind a frontend config flag so it can be re-enabled quickly after Google Business Profile quota approval.
- Removed developer-facing transitional review copy from the public landing page so the review section reads as customer-facing marketing content while the iframe fallback is active.
- Verified the served local frontend now exposes iframe mode declaratively: `html[data-review-mode="iframe"]`, the review iframe uses the live `msgsndr_reviews` id, the iframe source is populated in the initial HTML, and the preserved API wall is hidden by CSS in iframe mode.
- Added an exit-intent retention modal on the landing page that only targets visitors who have started but not completed the form. The modal shows once per browser session, opens on desktop top-edge exit intent, intercepts same-tab leave navigation, and adds a mobile fallback trigger when an engaged visitor scrolls back toward the top of the page. The YouTube creative is configurable through the frontend bootstrap config so the ad-specific video can be swapped without touching modal logic.
- Created a new production Cloudflare account context for this solution, created the production D1 database `ecosystemsca-review-archive`, and updated the Worker config to target the final account ID plus the new database binding.
- Configured a real Google Sheets service account for production backup logging using `ecosystemslanding@global-bridge-491113-b9.iam.gserviceaccount.com`, validated the JWT bearer flow directly against `oauth2.googleapis.com/token`, and updated the production sheet tab target to `Facebook-Ads-Leads-Backup`.
- Applied the review archive migration to the new development D1 database `ecosystemsca-review-archive-devmt`, deployed the renamed Cloudflare Workers `prd` and `devmt`, provisioned their Cloudflare secrets, and published a production Pages deployment for the landing site.
- Confirmed the actual Workers.dev URLs after Cloudflare created the account subdomain: production preview `https://prd.ecolanding.workers.dev` and development `https://devmt.ecolanding.workers.dev`.
- Confirmed the production Pages deployment is live at `https://661b9799.ecosystemsca-facebook-landing.pages.dev` on the `production` branch, while the custom root domain is still pending attachment inside Cloudflare Pages.
- Verified on March 23, 2026 that both deployed Workers return `{"ok":true}` from `/health` at `https://prd.ecolanding.workers.dev/health` and `https://devmt.ecolanding.workers.dev/health`.
- Verified the production Pages deployment responds successfully at `https://661b9799.ecosystemsca-facebook-landing.pages.dev`.
- Verified `ecosystemsca.net` currently returns a DNS resolution failure for the web root because the Pages project still exposes only its default `.pages.dev` domain and has not yet been attached to the custom domain.
- Verified a live `POST /api/lead` submission against `https://devmt.ecolanding.workers.dev/api/lead` returned `ok: true`, which confirms the Worker-to-JobNimbus path succeeded because this code returns `502` on CRM failure.
- Verified through live `wrangler tail` logs on March 23, 2026 that the same `devmt` request emitted `Google Sheets logging failed Error: Google Sheets fallback logging requires a service-account client email, private key, and spreadsheet ID.` This confirms the deployed `devmt` Worker is currently missing valid Google Sheets secrets at runtime.
- Verified the local `.dev.vars` source currently contains placeholder Google Sheets values rather than the real production service-account credentials: `GOOGLE_SHEETS_CLIENT_EMAIL` is not the known production service-account email, `GOOGLE_SHEETS_PRIVATE_KEY` is effectively empty, and only the spreadsheet ID appears populated. Because both Cloudflare environments were bulk-seeded from that file, `prd` likely needs the Google Sheets secrets repaired as well.
- Repaired the Cloudflare Worker Google Sheets secrets for both `prd` and `devmt` using the real service-account email, private key, and spreadsheet ID. Re-ran a live `devmt` lead submission afterward and confirmed the failure mode changed from missing secret bindings to `Google Sheets append failed with status 403`, which indicates the Worker can now reach Google with the configured credentials but still lacks effective permission to append to the target spreadsheet.
- After the spreadsheet was reportedly shared with the service account, re-ran another live `devmt` lead submission under `wrangler tail` on March 23, 2026 and still observed `Google Sheets append failed with status 403`. That means the blocker is not secret absence anymore. The remaining issue is Google-side authorization for this service account against the target spreadsheet or the surrounding Workspace policy.
- After the production tab was renamed to `Facebook-Ads-Leads-Backup`, re-ran a live `prd` lead submission under `wrangler tail` on March 23, 2026 and still observed `Google Sheets append failed with status 403`. This rules out an empty sheet or the production tab name as the primary cause. The remaining blocker is still spreadsheet-level or Workspace-level authorization for the service account.
- After the development tab `Facebook-Ads-Leads-Backup-Dev` was also created, re-ran multiple live `devmt` lead submissions under `wrangler tail` on March 23, 2026 and still observed `Google Sheets append failed with status 403` each time. This rules out the missing dev tab as the primary cause too. With both environment-specific tab names present, the remaining blocker is still Google authorization or Workspace policy around the spreadsheet itself.
- Repointed `devmt` to a brand-new spreadsheet ID `1bb-HyD8zmEqpaoPlIExwYNaB1XM7pC5xyp0D1ybDTGQ`, redeployed the Worker, and re-ran a fresh live lead submission under `wrangler tail`. The Worker still logged `Google Sheets append failed with status 403`. This isolates the remaining blocker away from the original spreadsheet and confirms the issue is not caused by sheet emptiness, missing headers, or the original spreadsheet ID. The remaining root cause is service-account access or higher-level Google policy.
- Verified on March 23, 2026 that both public Worker environments are operational independent of Google Sheets backup status. `https://prd.ecolanding.workers.dev/health` and `https://devmt.ecolanding.workers.dev/health` both returned `{"ok":true}`. Posting `{}` to both `/api/lead` endpoints returned the expected validation response `{"ok":false,"message":"Name is required."}` instead of a routing or runtime failure. Both `/api/reviews` endpoints returned `ok: true` payloads, and both `/api/reviews/archive/meta` endpoints returned `ok: true` with empty archive metadata. This confirms the production and development API surfaces are working even though Google Sheets append still returns `403` when a real lead is submitted.
- User-confirmed production landing validation on March 23, 2026: a complete submit from the production landing page reached the API successfully and the POST completed, but Google Sheets backup still did not write. This aligns with the direct Worker validation work and confirms the remaining unresolved item is limited to Google Sheets logging rather than the landing page, form flow, Worker routing, or CRM delivery path.
- Added another operational fail-safe on March 23, 2026 while Google Sheets append remains unresolved: the Worker now sends a non-blocking owner notification email for every completed lead submission attempt to `Infoeco411@gmail.com`. The email includes normalized lead fields plus JobNimbus outcome details and uses Worker-side MailChannels delivery by default so no client-side dependency was introduced.
- Validated the new email fail-safe locally on March 23, 2026 by posting a labeled diagnostic lead through the Worker and capturing runtime logs. Result: the lead flow still returned `200 OK`, but the email branch logged `Lead notification email failed with status 401: 401 Authorization Required` from `https://api.mailchannels.net/tx/v1/send`. That confirms the current MailChannels transport is not authorized for this implementation as configured, so owner-email delivery should be treated as not yet operational until the provider is replaced or authenticated correctly.
- Replaced the rejected MailChannels transport on March 23, 2026 with Cloudflare's native Worker email-delivery path using a `send_email` binding. The notification model is now `alerts@ecosystemsca.net` -> `Infoeco411@gmail.com`, which aligns with Cloudflare Email Routing requirements for notification-style sends from a routed domain address to a verified destination inbox.
- Deployed the native Cloudflare email-binding version to both `prd` and `devmt` on March 23, 2026. Wrangler accepted the `Send Email` binding in both environments as `Infoeco411@gmail.com - senders: alerts@ecosystemsca.net`, and both Workers continued returning `{"ok":true}` from `/health` after deployment. That confirms the Cloudflare-side binding configuration is now recognized by the platform.
- Sent a second uniquely labeled live retest through `https://devmt.ecolanding.workers.dev/api/lead` on March 23, 2026 after the native Cloudflare email deploy. The API again returned `{"ok":true}`, and the inbox-verification marker for this retest is: full name `Cloudflare Email Retest 2026-03-23-B`, address `456 Notification Retest Ave`, issue `Cloudflare send_email retest`, and source `cloudflare-send-email-retest`.
- Simplified the Cloudflare email payload on March 23, 2026 from a handcrafted multipart message to a minimal plain-text RFC822 message to remove MIME formatting as a delivery variable. Redeployed both `prd` and `devmt`, then sent a third uniquely labeled live retest through `https://devmt.ecolanding.workers.dev/api/lead`. The API again returned `{"ok":true}`, and the inbox-verification marker for this third retest is: full name `Cloudflare Email Retest 2026-03-23-C`, address `789 Plaintext Notification Ave`, issue `Cloudflare send_email plaintext retest`, and source `cloudflare-send-email-plaintext-retest`.
- Sent a fourth uniquely labeled live retest through `https://devmt.ecolanding.workers.dev/api/lead` on March 23, 2026 after the plain-text email change was already deployed. The API again returned `{"ok":true}`, and the inbox-verification marker for this fourth retest is: full name `Cloudflare Email Retest 2026-03-23-D`, address `1010 Final Retest Ave`, issue `Cloudflare send_email final retest`, and source `cloudflare-send-email-final-retest`.
- Verified the new exit-intent implementation on March 23, 2026 with static file diagnostics: `site/index.html`, `site/assets/app.js`, and `site/assets/styles.css` all returned `No errors found` after adding the modal config, markup, state handling, and responsive styles. Activated the modal creative by setting `window.ECO_LANDING_CONFIG.exitIntentVideoUrl` to `https://youtube.com/shorts/8EWt9JzMjmM`; the frontend normalizes that Shorts URL into a standard YouTube embed at runtime.
- Deployed the updated landing page with the active exit-intent YouTube Shorts creative to Cloudflare Pages on March 23, 2026. Wrangler published the production branch successfully at `https://661b9799.ecosystemsca-facebook-landing.pages.dev`, and a direct HTTPS HEAD request returned `200 OK`.
- Fixed a follow-up production defect in the exit-intent modal on March 23, 2026. Root cause 1: the frontend YouTube URL normalizer handled `youtu.be`, `/embed/`, and standard watch URLs but did not recognize `/shorts/{id}`, which caused the selected Shorts creative to fail to produce a proper embed target. Root cause 2: the modal close control did not have an explicit stacking priority above the iframe container, which made the dismissal interaction unreliable when the video region was present. Updated the frontend to normalize Shorts URLs into `youtube.com/embed/{id}` form and raised the close-control stacking order above the iframe shell.
- Applied a second usability pass on March 23, 2026 after live feedback from the deployed popup. Changed the mobile behavior so the modal no longer auto-opens from scroll-return heuristics; mobile now relies on intentional same-tab leave navigation interception instead of automatic scroll-based exit detection. Also replaced autoplay with click-to-play inside the modal by showing a dedicated play overlay that loads the YouTube iframe only after the visitor clicks, reducing browser autoplay-policy failures and black-screen states.
- Applied a third hardening pass on March 23, 2026 after further live feedback that the popup could remain stuck open. Reworked the modal visibility model so it no longer depends only on the `hidden` attribute and now uses an explicit visible-state class on the backdrop with `opacity`, `visibility`, and `pointer-events` control. Added a second dismiss action (`No Thanks`) plus redundant close handlers on backdrop press and close-button pointer release so the modal has multiple reliable dismissal paths even if a single click path is blocked or swallowed.
- Applied a fourth usability pass on March 23, 2026. Updated the popup headline to `Before you go, watch this quick message from your neighborhood Flat Roof Experts` and changed the primary modal CTA to `Complete No Fee Intake`. Reworked the modal layout so the dialog scrolls within the viewport and the bottom action row stays sticky and visible even after the video area loads. Updated the post-submit confirmation state to auto-reset after 30 seconds so the landing returns to the form instead of leaving the confirmation details on screen indefinitely.
- Sent a fifth uniquely labeled live retest through `https://devmt.ecolanding.workers.dev/api/lead` on March 23, 2026 to re-check Cloudflare native email delivery. The API again returned `{"ok":true,"message":"Thank you. ECO Systems will review your request and reach out shortly."}`, and the inbox-verification marker for this fifth retest is: full name `Cloudflare Email Retest 2026-03-23-E`, address `1111 Final Retest Ave`, issue `Cloudflare send_email final retest E`, and source `cloudflare-send-email-final-retest-e`.
- Inspected the Cloudflare Email Routing dashboard on March 23, 2026. Current dashboard state shows routing enabled, DNS records configured, one custom address, and one destination address for `ecosystemsca.net`. The Email Routing overview still reports `Total received: 0`, and the `Email Workers` tab shows no Email Workers configured. Based on Cloudflare's `send_email` documentation, this does not by itself prove a blocker for outbound Worker-sent notifications because the regular Worker `send_email` binding only requires Email Routing to be enabled plus a verified destination address. These dashboard views appear primarily to reflect inbound routing and Email Worker scripts, not delivery telemetry for outbound notification sends from a standard HTTP Worker.
- Enabled catch-all email routing for `ecosystemsca.net` and re-ran a fresh live notification test on March 23, 2026 to see whether broader routing catches the Worker-sent notification. The new `devmt` retest again returned `{"ok":true,"message":"Thank you. ECO Systems will review your request and reach out shortly."}`, and the inbox-verification marker for this sixth retest is: full name `Cloudflare Email Retest 2026-03-23-F`, address `1212 Catchall Retest Ave`, issue `Cloudflare send_email catch-all retest F`, and source `cloudflare-send-email-catchall-retest-f`.
- Added temporary live lead diagnostics to the `devmt` Worker response on March 23, 2026 so the API itself reports whether Google Sheets logging and owner-email delivery succeeded or threw. Deployed that diagnostic build to `https://devmt.ecolanding.workers.dev` and re-ran a header-forced diagnostic submission. Result: the response included `diagnostics.emailNotification.error = "destination address is not a verified address"` and `diagnostics.googleSheets.error = "Google Sheets append failed with status 403."` This confirms the Worker implementation is invoking Cloudflare's `send_email` binding correctly enough to reach Cloudflare's runtime validation, and the current email blocker is the destination-address verification state inside Cloudflare Email Routing rather than the Worker send call itself. The inbox-verification marker for this diagnostic retest is: full name `Cloudflare Email Retest 2026-03-23-H`, address `1414 Diagnostic Header Ave`, issue `Cloudflare send_email diagnostic retest H`, and source `cloudflare-send-email-diagnostic-retest-h`.
- After the user reported the destination-address verification step completed on March 23, 2026, re-ran another header-forced diagnostic submission against `https://devmt.ecolanding.workers.dev/api/lead`. The API still returned `diagnostics.emailNotification.error = "destination address is not a verified address"`, while Google Sheets remained `403`. This means Cloudflare's runtime still does not see `Infoeco411@gmail.com` as a verified Email Routing destination for outbound `send_email`, so the verification either has not propagated, has not fully completed, or was applied to the wrong destination/address context. The marker for this post-verification retest is: full name `Cloudflare Email Retest 2026-03-23-I`, address `1515 Verified Destination Ave`, issue `Cloudflare send_email verified destination retest I`, and source `cloudflare-send-email-verified-destination-retest-i`.
- Inspected the Cloudflare `Destination addresses` screen on March 23, 2026 and confirmed the destination exists as the lowercase address `infoeco411@gmail.com` with status `Verified`. That exposed a remaining implementation/config mismatch: the Worker defaults and Wrangler `send_email` bindings were still using mixed-case `Infoeco411@gmail.com`. Normalized the recipient email path to lowercase in code, changed both `prd` and `devmt` `send_email` bindings plus `LEAD_NOTIFICATION_EMAIL_TO` vars to `infoeco411@gmail.com`, redeployed `devmt`, and re-ran a header-forced diagnostic submission. Result: `diagnostics.emailNotification.ok = true` and `diagnostics.emailNotification.error = null`, while Google Sheets remained `403`. This confirms the destination-address mismatch was the actual email blocker. The successful post-fix marker is: full name `Cloudflare Email Retest 2026-03-23-J`, address `1616 Lowercase Destination Ave`, issue `Cloudflare send_email lowercase destination retest J`, and source `cloudflare-send-email-lowercase-destination-retest-j`.
- Deployed the same lowercase destination-address fix to `prd` on March 23, 2026 so the production Worker binding now also targets `infoeco411@gmail.com` exactly.
- Used the temporary `devmt` lead diagnostics one final time on March 23, 2026 to capture the full Google Sheets `403` payload before removing the diagnostics path. Google's response was not a spreadsheet-sharing rejection. It explicitly returned `PERMISSION_DENIED` with reason `SERVICE_DISABLED` and message `Google Sheets API has not been used in project 822983483402 before or it is disabled`. That identifies the current Sheets blocker as Google Cloud API enablement for the service-account project, not Worker code, sheet tab naming, or the spreadsheet ID itself. The final debug marker for this capture is: full name `Cloudflare Sheets Detail 2026-03-23-K`, address `1717 Sheets Detail Ave`, issue `Google Sheets detailed 403 retest K`, and source `google-sheets-detailed-403-retest-k`.
- Removed the temporary lead-response diagnostics from the Worker after the final capture and kept the more detailed Google Sheets error text in server-side exceptions so future logs still preserve the upstream reason without exposing debug payloads in normal lead API responses.
- After the user asked for one more post-enable verification on March 23, 2026, temporarily re-enabled the same diagnostics only behind request header `x-lead-debug: 1`, redeployed `devmt`, and sent a fresh labeled live submission to `https://devmt.ecolanding.workers.dev/api/lead`. Result: the API returned `diagnostics.googleSheets.ok = true` and `diagnostics.emailNotification.ok = true`, which confirms the Google Sheets API enablement had propagated and the Worker can now append backup rows successfully while still delivering owner notification emails. The successful post-enable marker is: full name `Cloudflare Post Enablement Debug 2026-03-23-M`, address `1919 Post Enablement Debug Ave`, issue `Post enablement debug retest M`, and source `post-enablement-debug-retest-m`.
- Removed the temporary lead-response diagnostics from the Worker again immediately after that successful verification so the repository and deployed runtime return to the normal public API response shape.
- Simplified the owner-notification email body on March 23, 2026 now that Google Sheets logging is working again. Removed the noisy optional survey lines when they add no value to the inbox view, removed the raw upstream response dump from successful notifications, and upgraded the message to multipart `text/plain` plus `text/html` so the property address is rendered as a clickable Google Maps link in capable email clients while plain-text readers still get the direct map URL. Validated the Worker source after the change with `No errors found` before redeployment.
- Added Cloudflare Turnstile protection to the landing page and lead API on March 24, 2026 using the provided ECO Systems site key and secret. The widget now renders below the full quick-answer form instead of inside the step flow, uses Cloudflare managed mode with `appearance: "interaction-only"` so it stays quiet on initial page load, and sends its token with the final lead payload. The Worker now verifies that token with Cloudflare siteverify before any JobNimbus submission, Google Sheets logging, or owner-notification email work runs. Documented the new Turnstile secret requirement in the Worker setup docs and local env example.
- Stored `TURNSTILE_SECRET_KEY` in both Cloudflare Worker environments on March 24, 2026, deployed the updated Worker to `devmt` and `prd`, and published the updated landing page to Cloudflare Pages at `https://b983147e.ecosystemsca-facebook-landing.pages.dev`. Post-deploy validation confirmed `200 OK` from the new Pages deployment plus `200 {"ok":true}` from both `https://devmt.ecolanding.workers.dev/health` and `https://prd.ecolanding.workers.dev/health`. Full end-to-end lead-submit validation for Turnstile was not executed from the terminal because a valid Turnstile token must be issued by the browser widget at runtime.
- Added Meta Pixel tracking to the landing page on March 24, 2026 using Pixel ID `1093337934791191`. The static page now loads Meta's standard `fbevents.js` bootstrap in the document head, initializes the configured pixel, and tracks the default `PageView` event. Added Meta's `noscript` image fallback immediately inside the body so basic pageview tracking still fires when JavaScript is disabled.
- Deployed the Meta Pixel landing-page update to Cloudflare Pages on March 24, 2026 at `https://0b9a18a4.ecosystemsca-facebook-landing.pages.dev`. Verified the new deployment with a direct HTTPS `HEAD` request returning `200 OK`.
- Validated the Meta Pixel integration on March 24, 2026 by checking the landing markup after the edit and confirming the standard head bootstrap, Pixel ID `1093337934791191`, `PageView` call, and `noscript` fallback are all present in [site/index.html](site/index.html). Also deployed the updated static site to Cloudflare Pages and verified the resulting deployment URL returned `200 OK`. Live Meta Events Manager verification was not run in this session.
- Performed a live Meta tracking audit on March 31, 2026 against both the reference funnel at `https://ecosystemsca.co/flat-roofs` and the deployed landing page at `https://ecosystemsca.net`. Result: both pages include the standard browser Meta Pixel bootstrap (`connect.facebook.net/en_US/fbevents.js`), Pixel ID `1093337934791191`, and `PageView`, but neither page includes any evidence of Facebook Conversions API wiring. No `graph.facebook.com` calls, no server-side Meta event endpoint usage, and no `_fbp` or `_fbc` handoff logic beyond capturing `fbclid` in the landing-page form payload were found. The current Worker records `fbclid` in downstream lead metadata, but it does not send any server-side Meta conversion events.

## March 31, 2026 Meta Tracking Audit

Issue:

- Needed to verify whether the reference flat-roofs page already used Facebook Conversions API and whether the deployed landing page mirrored that implementation.

Finding:

- The reference page at `https://ecosystemsca.co/flat-roofs` does not expose Facebook Conversions API code in its delivered HTML.
- The deployed landing page at `https://ecosystemsca.net` also does not expose Facebook Conversions API code in its delivered HTML.
- Both pages currently run only the browser Meta Pixel and PageView path.
- In this repository, the frontend captures `fbclid` and the Worker persists that value into lead metadata, CRM notes, and Google Sheets, but the Worker does not post any events to Meta's Graph API.

Files inspected:

- `site/index.html`
- `site/assets/app.js`
- `worker/src/index.js`
- Live HTML from `https://ecosystemsca.co/flat-roofs`
- Live HTML from `https://ecosystemsca.net`

Validation:

- Inspected the repository source for `fbq`, `fbevents`, `graph.facebook.com`, `_fbp`, `_fbc`, and `fbclid` handling.
- Pulled live HTML for both public pages and confirmed the delivered markup includes the standard browser Pixel bootstrap only.

Recommended next step:

- If server-side Meta attribution is still desired, implement Facebook Conversions API deliberately as a new tracked feature rather than assuming it already exists on the reference funnel.

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
- The Worker deployments and secrets are now configured, but the root Pages custom-domain cutover is still pending in Cloudflare

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
4. Confirm four outcomes together: Worker returns success, JobNimbus creates the record, the owner notification email arrives, and Google Sheets logs the attempt when that integration is healthy again.
5. If JobNimbus rejects the payload, use the logged upstream status and response text in Google Sheets or the owner notification email to correct the resource path or field mapping.

## Next Configuration Needed

1. Share spreadsheet `1Z3zdeULyNHtbk6BB-1Pu6c1lFRXPSvrXqBJ6pOZu-38` with the service account `ecosystemslanding@global-bridge-491113-b9.iam.gserviceaccount.com` at Editor level, then re-run a live lead submission to confirm Sheets append succeeds.
2. Confirm the expected tab names exist in that spreadsheet for both environments: production uses `Facebook-Ads-Leads-Backup` and `devmt` currently uses `Facebook-Ads-Leads-Backup-Dev`.
3. Attach `ecosystemsca.net` and `www.ecosystemsca.net` to the Cloudflare Pages project so the landing page resolves on the production domain.
4. Recheck DNS propagation for the root domain after the Pages custom-domain attachment is complete.
5. Once Google Business Profile APIs are approved, run a protected archive sync against `prd` and validate live review import into the production D1 database.
6. Confirm Cloudflare Email Routing is active for `ecosystemsca.net`, `alerts@ecosystemsca.net` is allowed as the sender, and `Infoeco411@gmail.com` is verified as a destination address.
7. After the next Worker deployment, submit a labeled lead and confirm the owner notification email arrives through the native Cloudflare binding path before treating email as the active fail-safe.
