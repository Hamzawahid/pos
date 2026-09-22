-- #6 Per-user quick-unlock PIN (bcrypt hash). Nullable — existing users unaffected.
ALTER TABLE `users` ADD COLUMN `pin_hash` VARCHAR(255) NULL DEFAULT NULL;
