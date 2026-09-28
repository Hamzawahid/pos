-- #8 Recovery email (real email for password reset). Distinct from `email` which
-- holds the legacy login id (often a phone). Nullable — existing accounts keep working.
ALTER TABLE `users` ADD COLUMN `recovery_email` VARCHAR(150) NULL DEFAULT NULL;
