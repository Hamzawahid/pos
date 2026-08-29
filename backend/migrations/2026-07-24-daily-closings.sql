-- Daily cash open/close sessions (one row per business day per shop).
CREATE TABLE IF NOT EXISTS daily_closings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  business_date DATE NOT NULL,
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  closing_balance DECIMAL(14,2) NULL,
  expected_cash DECIMAL(14,2) NULL,
  difference DECIMAL(14,2) NULL,
  status ENUM('open','closed') NOT NULL DEFAULT 'open',
  note VARCHAR(255) NULL,
  opened_by INT NULL,
  closed_by INT NULL,
  opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  UNIQUE KEY uniq_day (tenant_id, business_date)
);
