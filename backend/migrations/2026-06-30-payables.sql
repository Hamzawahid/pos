-- Payables (suppliers) — mirror of customers/customer_ledger, money flows OUT.
CREATE TABLE IF NOT EXISTS suppliers (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NULL,
  address TEXT NULL,
  notes VARCHAR(255) NULL,
  payable_balance DECIMAL(12,2) NULL DEFAULT 0.00,
  public_token VARCHAR(64) NULL,
  created_by INT NULL,
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sup_tenant (tenant_id),
  UNIQUE KEY uq_sup_token (public_token)
);
CREATE TABLE IF NOT EXISTS supplier_ledger (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  supplier_id INT NOT NULL,
  type ENUM('bill','payment','adjustment') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  status ENUM('confirmed','pending','disputed') NOT NULL DEFAULT 'confirmed',
  note VARCHAR(255) NULL,
  confirmed_at DATETIME NULL,
  confirmed_name VARCHAR(100) NULL,
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_supl_tenant (tenant_id),
  INDEX idx_supl_supplier (supplier_id)
);
