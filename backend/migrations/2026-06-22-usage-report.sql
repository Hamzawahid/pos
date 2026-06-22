-- Usage Report feature — adds per-user attribution + activity tracking.
-- Apply to staging (pos_db_staging) first, then prod (pos_db) after approval.

-- 1) Attribute each customer to the user who created it (clients-added-per-user).
ALTER TABLE customers ADD COLUMN created_by INT NULL;

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
