# Google Review Archive Sync Plan

## Objective

Add a dedicated archived-review system inside the existing Cloudflare Worker stack so the landing page can serve a fuller, platform-owned review archive instead of relying only on the limited Google Places featured subset.

This phase should also capture and display business owner replies because Google Business Profile reviews include `reviewReply`, and showing those replies strengthens credibility on the landing page.

## Scope Decision

This is a substantial backend feature, so implementation should proceed in two stages:

1. Phase 1: archive storage, sync pipeline, read endpoints, and frontend rendering of archived reviews plus owner replies.
2. Phase 2: optional owner-reply management endpoint if ECO Systems wants to publish or update replies from inside this platform.

Phase 1 is the correct next build target. Phase 2 should remain optional because it adds operational risk and requires stronger access controls.

## Development Plan

### Epic 1: Review Archive Storage

Feature:
- Persist Google Business Profile reviews in a queryable local datastore.

User stories:
- As a visitor, I want to browse many more reviews on the landing page without leaving the site.
- As an operator, I want synced reviews to remain available even if Google API calls are slow or temporarily unavailable.

Deliverables:
- D1 database binding for review archive storage.
- Normalized review table keyed by Google review resource name or `reviewId`.
- Sync-run table for observability and incremental refresh tracking.

### Epic 2: Review Sync Pipeline

Feature:
- Pull paginated reviews from Google Business Profile and upsert them into D1.

User stories:
- As an operator, I want the archive to stay current without manual copy-paste.
- As a developer, I want sync failures and token failures to be diagnosable.

Deliverables:
- Admin sync endpoint.
- Scheduled cron sync.
- OAuth refresh-token exchange flow using Google Business Profile credentials.
- Incremental upsert strategy using `reviewId` and `updateTime`.

### Epic 3: Archive Read API

Feature:
- Serve a dedicated archive endpoint for the frontend.

User stories:
- As a visitor, I want paginated archived reviews with stable ordering and filtering.
- As a marketer, I want owner replies shown when available because they increase trust.

Deliverables:
- `GET /api/reviews/archive`
- `GET /api/reviews/archive/meta`
- Shared normalization for reviewer profile image, rating, comment, dates, and owner reply.

### Epic 4: Frontend Archive Presentation

Feature:
- Let the landing page consume archived reviews and display owner replies cleanly.

User stories:
- As a visitor, I want to see more reviews in a consistent grid.
- As a visitor, I want to see when the business owner responded.

Deliverables:
- Frontend support for archive pagination.
- Card layout for owner reply block.
- Fallback order: archive endpoint first, Places subset second, Google profile link third.

### Epic 5: Operations And Auditability

Feature:
- Make sync state observable and safe to operate.

User stories:
- As an operator, I want to know when the last sync succeeded and how many reviews were imported.
- As a developer, I want failed sync attempts captured with actionable diagnostics.

Deliverables:
- Sync-run status logging in D1.
- Admin-only status endpoint.
- Minimal secret model for Google OAuth credentials.

## System Design

### Architecture Flow

1. Landing page requests `GET /api/reviews/archive?page=1&pageSize=9`.
2. Worker reads archived rows from D1, ordered by review freshness and rating policy.
3. Worker returns normalized review cards including reviewer identity, profile image, comment, rating, Google source URL, and optional owner reply.
4. Separately, a scheduled Worker job or admin-triggered sync calls Google Business Profile `accounts.locations.reviews.list`.
5. Worker paginates through all available reviews using `nextPageToken`.
6. Worker upserts rows into D1 and records a sync-run summary.
7. Frontend uses archive data when available; otherwise it falls back to the current Places-based highlights.

### Component Map

Backend components:
- Review archive repository for D1 reads and writes.
- Google Business Profile client for token refresh and review pagination.
- Sync orchestrator for paging, normalization, and upserts.
- Public archive controller for read endpoints.
- Admin sync controller for manual refresh and diagnostics.

Frontend components:
- Existing review wall renderer extended to support archive pagination.
- Optional owner-reply block under each review body.
- Archive-mode summary copy that explains reviews are synced from the verified business profile.

### State Plan

Public frontend state:
- `reviewSourceMode`: `archive | places | fallback`
- `archivePage`
- `archivePageSize`
- `archiveHasMore`
- `archiveLastSyncAt`

Backend sync state:
- last successful sync time
- last failed sync time
- imported review count
- next page token for in-progress runs if partial sync resume is later needed

### Payload Shapes

Public archive response:

```json
{
  "ok": true,
  "source": "google-business-profile-archive",
  "businessName": "ECO Systems",
  "rating": 4.9,
  "reviewCount": 187,
  "lastSyncAt": "2026-03-18T18:20:00Z",
  "page": 1,
  "pageSize": 9,
  "hasMore": true,
  "reviews": [
    {
      "reviewId": "abc123",
      "googleResourceName": "accounts/.../locations/.../reviews/abc123",
      "authorName": "Jane Doe",
      "authorPhotoUrl": "https://...",
      "isAnonymous": false,
      "rating": 5,
      "comment": "Great experience...",
      "createTime": "2026-03-10T12:00:00Z",
      "updateTime": "2026-03-11T08:00:00Z",
      "sourceUrl": "https://www.google.com/maps/reviews/...",
      "ownerReply": {
        "comment": "Thank you for trusting ECO Systems...",
        "updateTime": "2026-03-12T15:00:00Z"
      }
    }
  ]
}
```

Admin sync response:

```json
{
  "ok": true,
  "imported": 187,
  "inserted": 25,
  "updated": 8,
  "lastSyncAt": "2026-03-18T18:20:00Z"
}
```

### Data Model

Preferred storage: D1, not KV.

Reasoning:
- Archive browsing needs pagination, ordering, filtering, and counts.
- Owner replies and sync metadata fit relational storage better.
- D1 gives clear auditability for sync runs.

Proposed tables:

`google_review_archive`
- `review_id` text primary key
- `google_resource_name` text not null
- `account_id` text not null
- `location_id` text not null
- `author_name` text
- `author_photo_url` text
- `is_anonymous` integer not null default 0
- `star_rating` integer not null
- `comment` text not null default ''
- `create_time` text not null
- `update_time` text not null
- `source_url` text
- `owner_reply_comment` text
- `owner_reply_update_time` text
- `raw_payload_json` text not null
- `is_active` integer not null default 1
- `synced_at` text not null

Indexes:
- `idx_google_review_archive_update_time`
- `idx_google_review_archive_create_time`
- `idx_google_review_archive_star_rating`

`google_review_sync_runs`
- `id` integer primary key autoincrement
- `started_at` text not null
- `finished_at` text
- `status` text not null
- `imported_count` integer not null default 0
- `inserted_count` integer not null default 0
- `updated_count` integer not null default 0
- `error_message` text

### API Routes

Public routes:
- `GET /api/reviews/archive?page=1&pageSize=9`
- `GET /api/reviews/archive/meta`

Admin routes:
- `POST /api/admin/reviews/sync`
- `GET /api/admin/reviews/sync-status`

Optional future admin route:
- `PUT /api/admin/reviews/:reviewId/reply`

### Security Notes

- Google Business Profile APIs require OAuth with `business.manage` scope. Service accounts are not sufficient for owned-review access by themselves.
- Do not expose admin sync endpoints publicly. Protect them with a shared admin token or Cloudflare Access.
- Store Google OAuth client ID, client secret, refresh token, account ID, and location ID as Worker secrets.
- Do not expose raw Google resource names or admin diagnostics to the public unless needed.
- If owner-reply publishing is added later, require separate admin authorization and request logging.

### Performance Notes

- Read traffic should hit D1 only, not Google, for archive browsing.
- Public archive responses should be cached with short TTL headers at the Worker edge.
- Sync should batch D1 writes inside transactions where practical.
- Page sizes should stay modest, such as 9 or 12, for a stable landing-page UX.

## Owner Response Support

This is feasible and recommended.

What Google provides:
- Each review may include `reviewReply.comment` and `reviewReply.updateTime`.
- Google also supports updating replies with `accounts.locations.reviews.updateReply`.

Recommended approach:
- In Phase 1, ingest and display owner replies read-only.
- In Phase 2, optionally add a protected reply-management endpoint if ECO Systems wants to author replies from inside this platform.

Landing-page presentation:
- Render owner reply as a secondary block below the customer review.
- Label it clearly as `Response from ECO Systems`.
- Clamp long replies but allow inline expansion, matching the main review-card behavior.

## Implementation Touch Map

Expected new files:
- `worker/migrations/0001_google_review_archive.sql`
- `docs/GOOGLE_REVIEW_ARCHIVE_SYNC.md`

Expected updated files:
- `worker/wrangler.toml`
- `worker/src/index.js`
- `worker/.dev.vars.example`
- `README.md`
- `site/assets/app.js`
- `site/assets/styles.css`
- `site/index.html`
- `docs/ECOSYSTEMS_ROOFING_LANDING_IMPLEMENTATION.md`

Potential optional new files if the Worker code is split for maintainability:
- `worker/src/review-archive.js`
- `worker/src/google-business-profile.js`
- `worker/src/review-repository.js`

## Required Credentials And Inputs

Required before implementation can be validated end to end:
- Google OAuth client ID
- Google OAuth client secret
- Google OAuth refresh token for a verified ECO Systems Business Profile user
- Google Business Profile account ID
- Google Business Profile location ID

Required infra additions:
- D1 database binding in Wrangler
- Cron trigger for scheduled sync
- Admin auth secret for sync endpoints

## Validation Plan

1. Run D1 migration locally and in Cloudflare.
2. Seed one manual sync from Google Business Profile.
3. Confirm D1 row counts match the Google `totalReviewCount` expectation within API constraints.
4. Verify archive endpoint returns paginated rows with owner replies when present.
5. Verify frontend falls back to Places reviews only when archive data is unavailable.
6. Verify admin sync endpoint is blocked without admin auth.
7. Verify scheduled sync creates a successful sync-run record.

## Approval Gate

Implementation should start only after approval of the following choices:

1. Storage: D1 for archive and sync runs.
2. Auth model: pre-generated Google OAuth refresh token stored as Worker secret.
3. Scope: Phase 1 includes read-only owner replies, not reply publishing.
4. Public UX: archive endpoint becomes the primary source, Places remains the fallback.