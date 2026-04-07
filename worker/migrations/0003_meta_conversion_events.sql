CREATE TABLE IF NOT EXISTS meta_conversion_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  source_key TEXT NOT NULL,
  event_name TEXT NOT NULL,
  meta_event_id TEXT NOT NULL,
  delivery_status TEXT NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_type, source_key, event_name)
);

CREATE INDEX IF NOT EXISTS idx_meta_conversion_events_source
ON meta_conversion_events(source_type, source_key, event_name);