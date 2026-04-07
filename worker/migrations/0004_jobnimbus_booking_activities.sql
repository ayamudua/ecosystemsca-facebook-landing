CREATE TABLE IF NOT EXISTS jobnimbus_contact_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_email TEXT NOT NULL,
  property_address TEXT,
  contact_jnid TEXT NOT NULL,
  contact_number TEXT,
  contact_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(lead_email, contact_jnid)
);

CREATE INDEX IF NOT EXISTS idx_jobnimbus_contact_links_email_time
ON jobnimbus_contact_links(lead_email, updated_at DESC);

CREATE TABLE IF NOT EXISTS jobnimbus_booking_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_uid TEXT NOT NULL UNIQUE,
  booking_status TEXT NOT NULL,
  contact_jnid TEXT,
  activity_jnid TEXT,
  delivery_status TEXT NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobnimbus_booking_activities_status
ON jobnimbus_booking_activities(delivery_status, updated_at DESC);