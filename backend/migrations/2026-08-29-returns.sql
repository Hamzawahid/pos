-- Returns / refunds: a return is a NEGATIVE "return sale" that points at the
-- original bill, so every existing report nets automatically on the return date
-- with no report-query changes.
--
-- This column was originally applied to pos_db_staging by an ad-hoc ALTER and
-- never had a migration file. Written idempotently (MySQL 8 has no
-- ADD COLUMN IF NOT EXISTS) so it is safe to run on a database that already
-- has it, and safe against existing rows: the column is NULL-able with no
-- default, so every historical sale simply keeps NULL = "not a return".

SET @col := (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'sales'
               AND column_name = 'return_of_sale_id');
SET @sql := IF(@col = 0,
  'ALTER TABLE sales ADD COLUMN return_of_sale_id INT NULL',
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @idx := (SELECT COUNT(*) FROM information_schema.statistics
             WHERE table_schema = DATABASE() AND table_name = 'sales'
               AND index_name = 'idx_return_of');
SET @sql := IF(@idx = 0,
  'ALTER TABLE sales ADD INDEX idx_return_of (return_of_sale_id)',
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
