-- Bank Accounts module: accounts + their transactions (deposit/withdraw/transfer).
CREATE TABLE IF NOT EXISTS bank_accounts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  bank_name VARCHAR(120) NULL,
  account_number VARCHAR(60) NULL,
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ba_tenant (tenant_id, is_active)
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  account_id BIGINT NOT NULL,
  type ENUM('deposit','withdrawal','transfer_in','transfer_out','opening') NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  balance_after DECIMAL(14,2) NOT NULL,
  ref_account_id BIGINT NULL,
  note VARCHAR(255) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_bt_acct (account_id, created_at),
  KEY idx_bt_tenant (tenant_id, created_at)
);
