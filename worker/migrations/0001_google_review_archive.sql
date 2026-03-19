CREATE TABLE IF NOT EXISTS google_review_archive (
  review_id TEXT PRIMARY KEY,
  google_resource_name TEXT NOT NULL,
  account_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  author_name TEXT,
  author_photo_url TEXT,
  is_anonymous INTEGER NOT NULL DEFAULT 0,
  star_rating INTEGER NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  create_time TEXT NOT NULL,
  update_time TEXT NOT NULL,
  source_url TEXT,
  owner_reply_comment TEXT,
  owner_reply_update_time TEXT,
  raw_payload_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_google_review_archive_update_time
ON google_review_archive (update_time DESC);

CREATE INDEX IF NOT EXISTS idx_google_review_archive_create_time
ON google_review_archive (create_time DESC);

CREATE INDEX IF NOT EXISTS idx_google_review_archive_star_rating
ON google_review_archive (star_rating DESC);

CREATE INDEX IF NOT EXISTS idx_google_review_archive_location_active
ON google_review_archive (location_id, is_active, update_time DESC);

CREATE TABLE IF NOT EXISTS google_review_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);