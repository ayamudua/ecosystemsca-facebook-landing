ALTER TABLE jobnimbus_contact_links ADD COLUMN customer_jnid TEXT;

ALTER TABLE jobnimbus_booking_activities RENAME TO jobnimbus_booking_tasks;

ALTER TABLE jobnimbus_booking_tasks RENAME COLUMN activity_jnid TO task_jnid;

DROP INDEX IF EXISTS idx_jobnimbus_booking_activities_status;

CREATE INDEX IF NOT EXISTS idx_jobnimbus_booking_tasks_status
ON jobnimbus_booking_tasks(delivery_status, updated_at DESC);