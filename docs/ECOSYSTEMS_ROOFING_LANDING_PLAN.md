# EcoSystems Roofing Landing Page Plan

## Objective

Create a high-conversion landing page for Facebook traffic that closely mirrors the current [flat-roofs page](https://ecosystemsca.co/flat-roofs), keeps the visual flow familiar for existing customers, and submits the final 3-step form to JobNimbus through a Cloudflare Worker.

The implementation should stay minimal:
- Static frontend
- No primary lead database
- Worker-based integrations only
- Google review carousel fed by the Worker
- Optional failure-only backup logging if JobNimbus submission fails

## Reference Findings

The current page is a direct-response landing page with these visible patterns:
- Strong headline around flat roof restoration and savings
- Immediate trust signals near the top
- Owner credibility callout
- A short multi-step qualification flow
- Minimal navigation and low-distraction layout

The new page should preserve that structure rather than introducing a broader marketing-site layout.

## Recommended Minimal Architecture

```text
Static landing page
    -> POST /api/lead
Cloudflare Worker
    -> JobNimbus API
    -> optional failure-only backup log

Static landing page
    -> GET /api/reviews
Cloudflare Worker
    -> Google Places API
    -> cached review payload
```

### Frontend

Use a plain static site for speed of delivery:
- `index.html` for the landing page
- `assets/styles.css` for page styling
- `assets/app.js` for step form logic, API calls, and review carousel

This avoids unnecessary framework overhead and is the fastest path for a one-page paid-traffic funnel.

### Backend

Use a Cloudflare Worker with two endpoints:
- `POST /api/lead` to validate the final form payload and send it to JobNimbus
- `GET /api/reviews` to fetch Google review data and return a normalized JSON payload for the carousel

### Review Data Constraint

Google Places does not reliably expose every review through the native API. The minimal viable implementation should:
- Display the review subset returned by Google Places
- Show average rating and review count if available
- Link out to the full Google review profile for complete review browsing

If showing every review is a hard requirement, that becomes a separate non-minimal integration problem and likely needs a third-party review platform or a manual sync workflow.

## Development Plan

### Epic 1: Recreate the Landing Page Flow

#### User stories
- As a Facebook visitor, I can immediately understand the offer without reading a full site
- As a prospect, I can complete a short 3-step form on mobile without friction
- As a prospect, I see familiar trust markers before submitting my contact details

#### Planned page sections
1. Hero with headline, subhead, primary CTA, and trust strip
2. Owner credibility block
3. Three-step qualification form
4. Savings or benefits section carried over from the reference tone
5. Google review carousel
6. Final CTA and compact footer

#### Component map
- Hero
- Trust badges or review stars strip
- Three-step form shell
- Step panels
- Inline validation messages
- Submission success state
- Submission error state
- Reviews carousel
- Footer with privacy link

### Epic 2: Lead Submission via Worker

#### User stories
- As the business, I receive new leads in JobNimbus with no manual data entry
- As the site owner, I do not store leads locally unless JobNimbus fails

#### Lead flow
1. User completes step 1 and step 2 locally
2. User enters contact details on step 3
3. Frontend submits JSON to Worker
4. Worker validates and normalizes payload
5. Worker sends lead to JobNimbus
6. Worker returns success or error response

#### Minimal payload
- First name
- Last name
- Phone
- Email
- Property address or ZIP
- Roofing need answers from steps 1 and 2
- Source metadata such as UTM parameters and `fbclid` when present

### Epic 3: Review Carousel via Worker

#### User stories
- As a visitor, I can see recent Google trust signals without leaving the page
- As the site owner, I avoid exposing Google API credentials in the browser

#### Review flow
1. Frontend requests `/api/reviews`
2. Worker fetches review data from Google Places API
3. Worker normalizes the response and applies cache headers
4. Frontend renders a lightweight carousel with stars, author, age, and excerpt

#### Caching plan
- Cache review responses in the Worker for 6 to 24 hours
- If Google is unavailable, serve the last cached payload when possible
- If no cached data exists, fall back to a static placeholder section with a link to Google reviews

### Epic 4: Failure-Only Backup Logging

This should be optional and only enabled if you want a safety net.

Recommended minimal approach:
- Only write backup data when JobNimbus submission fails or times out
- Store only the exact submission payload plus timestamp and failure reason
- Prefer Google Sheets over CSV append files for operational simplicity and visibility

Why Google Sheets is better than CSV here:
- Easier to review from a phone or laptop
- No file-locking or append strategy to design
- Cleaner for one-row-per-failed-submission logging

If strict no-retention is preferred, skip this entirely and rely on Worker logs only.

## System Design

### Architecture Flow

```text
Facebook Ad
    -> Landing Page
        -> local 3-step form state
        -> POST /api/lead
            -> Cloudflare Worker
                -> JobNimbus API
                -> optional Google Sheets failure log

Landing Page
    -> GET /api/reviews
        -> Cloudflare Worker
            -> Google Places API
            -> normalized cached response
            -> review carousel
```

### State Plan

Frontend state only:
- Current form step
- Field values
- Validation errors
- Submission pending state
- Submission success state
- Reviews loading state
- Reviews error state

No client-side persistence is required beyond the current page session.

### Payload Shapes

#### Lead request

```json
{
  "contact": {
    "firstName": "",
    "lastName": "",
    "phone": "",
    "email": ""
  },
  "property": {
    "address": "",
    "zip": "",
    "county": ""
  },
  "survey": {
    "roofType": "flat",
    "propertyType": "",
    "issue": "",
    "timeline": ""
  },
  "tracking": {
    "utmSource": "",
    "utmCampaign": "",
    "utmMedium": "",
    "fbclid": ""
  }
}
```

#### Review response

```json
{
  "rating": 4.9,
  "reviewCount": 123,
  "reviews": [
    {
      "authorName": "",
      "rating": 5,
      "relativeTime": "2 weeks ago",
      "text": ""
    }
  ],
  "sourceUrl": "https://www.google.com/maps/..."
}
```

### Security Notes

- Keep JobNimbus and Google API credentials only in Worker secrets
- Validate and sanitize all incoming form fields in the Worker
- Use basic bot mitigation such as honeypot field and server-side validation
- Return generic error responses to the browser
- Do not expose raw upstream errors or secret-backed URLs

### Performance Notes

- Keep the landing page to one HTML document with minimal JS
- Inline or preload critical hero assets if needed
- Defer review rendering until initial page content is usable
- Avoid heavy sliders or third-party embed widgets for reviews

## Implementation Touch Map

Planned project structure:

```text
/.github/prompts/plan-facebook-roofing-landing.prompt.md
/docs/ECOSYSTEMS_ROOFING_LANDING_PLAN.md
/site/index.html
/site/assets/styles.css
/site/assets/app.js
/worker/src/index.js
/worker/wrangler.toml
/worker/package.json
/README.md
```

Potential optional files if needed:

```text
/worker/src/jobnimbus.js
/worker/src/google-reviews.js
/worker/src/sheets-fallback.js
```

## Validation Plan

Before launch:
1. Confirm visual parity with the reference page structure on mobile and desktop
2. Verify the 3-step form blocks progression until each step is valid
3. Verify the Worker creates the JobNimbus customer correctly
4. Verify tracking parameters are captured and forwarded
5. Verify review endpoint caching and failure fallback behavior
6. Verify privacy-policy and contact links resolve correctly

## Open Questions

1. Do you want the new page hosted at a dedicated path, subdomain, or root domain?
2. What exact JobNimbus object should be created: customer, contact, lead, or job?
3. What Google Business Profile place ID should the reviews endpoint use?
4. Do you want failure-only backup logging enabled, and if so should it be Google Sheets?
5. Are there specific brand assets from the current EcoSystems site that should be reused directly?

## Proposed Minimal Build Order

1. Scaffold static site and Worker
2. Recreate the reference page layout and copy tone with minimal deviation
3. Implement step-form behavior and client validation
4. Implement Worker lead endpoint and connect JobNimbus
5. Implement Worker reviews endpoint and carousel
6. Add optional failure-only logging if approved
7. Validate mobile UX and deploy

## Session Record

- Request: plan a minimal static Facebook landing page modeled closely on the current flat-roofs page, with JobNimbus submission and Google reviews
- Decision: use a plain static frontend plus Cloudflare Worker endpoints for lead submission and reviews
- Constraint identified: native Google Places API does not provide a dependable all-reviews feed
- Validation performed: reviewed the public reference page structure and checked the workspace, which is currently empty aside from git metadata
- Code changes made: added a reusable workspace prompt and this implementation plan document