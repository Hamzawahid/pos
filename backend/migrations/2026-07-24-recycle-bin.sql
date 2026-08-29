-- Recycle Bin: retains deleted records (with children) for 30 days.
CREATE TABLE IF NOT EXISTS recycle_bin (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id BIGINT NOT NULL,
  label VARCHAR(255) NULL,
  snapshot JSON NOT NULL,
  deleted_by INT NULL,
  deleted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rb_tenant (tenant_id, deleted_at)
);
