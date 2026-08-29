-- Usage Report feature — adds per-user attribution + activity tracking.
-- Apply to staging (pos_db_staging) first, then prod (pos_db) after approval.
--
-- Made idempotent 2026-08-29 for the consolidated release. This migration was
-- already applied to pos_db on 2026-06-23, so a bare ALTER now aborts with
-- "Duplicate column name 'created_by'" and would stop a migration run partway
-- through. Guarded so the whole set can be run end-to-end on any database.

-- 1) Attribute each customer to the user who created it (clients-added-per-user).
SET @col := (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'customers'
               AND column_name = 'created_by');
SET @sql := IF(@col = 0,
  'ALTER TABLE customers ADD COLUMN created_by INT NULL',
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- 2) Per-user, per-day active-time tracking. Accumulated from POS heartbeats:
--    each ping adds the gap since the last ping, but only if that gap is short
--    (<= 120s) so idle/closed time is never counted as "active".
CREATE TABLE IF NOT EXISTS user_activity (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  user_id INT NOT NULL,
  activity_date DATE NOT NULL,
  active_seconds INT NOT NULL DEFAULT 0,
  first_seen DATETIME NOT NULL,
  last_seen DATETIME NOT NULL,
  ping_count INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_user_day (tenant_id, user_id, activity_date),
  INDEX idx_tenant (tenant_id)
);
