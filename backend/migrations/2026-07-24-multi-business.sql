-- Multi-business: link an owner's user-rows across tenants with a shared key.
-- Data isolation is unchanged — every table still filters by the single tenant_id
-- carried in the JWT; only which tenant the owner is "in" can now be switched.
--
-- Made idempotent 2026-08-29 for the consolidated release: the original version
-- used bare ALTER ... ADD COLUMN / ADD INDEX, which abort on a second run, and
-- MySQL 8 has no ADD COLUMN IF NOT EXISTS. The backfill is already safe to
-- repeat because of its "owner_key IS NULL" guard — an owner that has been
-- keyed keeps that key, so re-running never splits an existing business group.

SET @col := (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'users'
               AND column_name = 'owner_key');
SET @sql := IF(@col = 0,
  'ALTER TABLE users ADD COLUMN owner_key VARCHAR(36) NULL',
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @idx := (SELECT COUNT(*) FROM information_schema.statistics
             WHERE table_schema = DATABASE() AND table_name = 'users'
               AND index_name = 'idx_owner_key');
SET @sql := IF(@idx = 0,
  'ALTER TABLE users ADD INDEX idx_owner_key (owner_key)',
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- Each existing owner becomes its own single-business group.
UPDATE users SET owner_key = UUID() WHERE role = 'owner' AND owner_key IS NULL;
