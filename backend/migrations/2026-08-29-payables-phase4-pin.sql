-- Payables Phase 4 — the vendor claims their own share link with a PIN they set
-- themselves (bcrypt-hashed; the shop, the database operator and this codebase
-- never see the plaintext). Accept/decline on the public payee page is then
-- PIN-gated, so a shop cannot self-acknowledge a payment.
--
-- These two columns were applied to pos_db_staging by an ad-hoc ALTER during
-- Phase 4 and never had a migration file. Idempotent (MySQL 8 has no
-- ADD COLUMN IF NOT EXISTS). Both are NULL-able: an existing supplier row is
-- simply "unclaimed" until the vendor sets a PIN, which is the correct
-- starting state for every supplier that already exists in production.

SET @col := (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'suppliers'
               AND column_name = 'pin_hash');
SET @sql := IF(@col = 0,
  'ALTER TABLE suppliers ADD COLUMN pin_hash VARCHAR(255) NULL',
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @col := (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'suppliers'
               AND column_name = 'claimed_at');
SET @sql := IF(@col = 0,
  'ALTER TABLE suppliers ADD COLUMN claimed_at DATETIME NULL',
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
