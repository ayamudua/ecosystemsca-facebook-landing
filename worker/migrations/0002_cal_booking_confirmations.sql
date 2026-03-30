CREATE TABLE IF NOT EXISTS cal_booking_confirmations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_uid TEXT NOT NULL UNIQUE,
  trigger_event TEXT NOT NULL,
  booking_status TEXT NOT NULL,
  event_type_slug TEXT,
  event_title TEXT,
  organizer_name TEXT,
  organizer_email TEXT,
  booker_name TEXT,
  booker_email TEXT,
  booker_phone TEXT,
  property_address TEXT,
  location TEXT,
  start_time TEXT,
  end_time TEXT,
  webhook_created_at TEXT NOT NULL,
  booking_created_at TEXT,
  raw_payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cal_booking_confirmations_email_time
ON cal_booking_confirmations (booker_email, webhook_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cal_booking_confirmations_status_time
ON cal_booking_confirmations (booking_status, webhook_created_at DESC);