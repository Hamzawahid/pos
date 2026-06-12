// helpers/globalSetup.js — Create test DB schema once before all tests
const mysql = require('mysql2/promise')

module.exports = async function() {
  const conn = await mysql.createConnection({
    host: 'localhost', user: 'prod_user', password: process.env.DB_PASSWORD || ''
  })
  await conn.query('CREATE DATABASE IF NOT EXISTS pos_db_test')
  await conn.query('USE pos_db_test')

  // Mirror prod schema into test DB
  const tables = [
    `CREATE TABLE IF NOT EXISTS tenants (
      id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL,
      slug VARCHAR(60) NOT NULL UNIQUE, plan ENUM('trial','basic','pro') DEFAULT 'trial',
      active TINYINT DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      rejection_reason VARCHAR(255), approved_at DATETIME, access_expires_at DATETIME,
      user_limit INT NOT NULL DEFAULT 1)`,
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY, tenant_id INT NOT NULL, name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL, password VARCHAR(255) NOT NULL,
      role ENUM('owner','manager','cashier') DEFAULT 'cashier',
      active TINYINT DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      permissions JSON, blocked_by_admin TINYINT NOT NULL DEFAULT 0,
      INDEX idx_tenant(tenant_id), UNIQUE KEY uq_email(email))`,
    `CREATE TABLE IF NOT EXISTS super_admins (
      id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY, tenant_id INT NOT NULL,
      name VARCHAR(80) NOT NULL, color VARCHAR(10), icon VARCHAR(20),
      INDEX idx_tenant(tenant_id))`,
    `CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY, tenant_id INT NOT NULL, category_id INT,
      name VARCHAR(150) NOT NULL, barcode VARCHAR(100), sku VARCHAR(80),
      unit VARCHAR(20) DEFAULT 'pcs', pack_unit VARCHAR(20), units_per_pack DECIMAL(10,2),
      cost_price DECIMAL(10,2) DEFAULT 0, sale_price DECIMAL(10,2) NOT NULL,
      stock_qty DECIMAL(10,2) DEFAULT 0, low_stock_at DECIMAL(10,2) DEFAULT 5,
      active TINYINT DEFAULT 1, image_url VARCHAR(500), is_favorite TINYINT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant(tenant_id))`,
    `CREATE TABLE IF NOT EXISTS customers (
      id INT AUTO_INCREMENT PRIMARY KEY, tenant_id INT NOT NULL, name VARCHAR(100) NOT NULL,
      phone VARCHAR(20), address TEXT, credit_balance DECIMAL(10,2) DEFAULT 0,
      credit_limit DECIMAL(12,2) DEFAULT 0, total_purchases DECIMAL(12,2) DEFAULT 0,
      cnic VARCHAR(20), created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant(tenant_id))`,
    `CREATE TABLE IF NOT EXISTS sales (
      id INT AUTO_INCREMENT PRIMARY KEY, tenant_id INT NOT NULL, user_id INT,
      customer_id INT, subtotal DECIMAL(10,2) NOT NULL, discount DECIMAL(10,2) DEFAULT 0,
      total DECIMAL(10,2) NOT NULL, paid DECIMAL(10,2) DEFAULT 0,
      payment_method ENUM('cash','credit','mixed') DEFAULT 'cash',
      status ENUM('completed','refunded') DEFAULT 'completed',
      note VARCHAR(255), created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant(tenant_id))`,
    `CREATE TABLE IF NOT EXISTS sale_items (
      id INT AUTO_INCREMENT PRIMARY KEY, sale_id INT NOT NULL, product_id INT,
      product_name VARCHAR(150) NOT NULL, unit_price DECIMAL(10,2) NOT NULL,
      qty DECIMAL(10,2) NOT NULL, subtotal DECIMAL(10,2) NOT NULL,
      INDEX idx_sale(sale_id))`,
    `CREATE TABLE IF NOT EXISTS customer_ledger (
      id INT AUTO_INCREMENT PRIMARY KEY, tenant_id INT NOT NULL, customer_id INT NOT NULL,
      sale_id INT, type ENUM('sale','payment','adjustment') NOT NULL,
      amount DECIMAL(10,2) NOT NULL, balance_after DECIMAL(10,2) NOT NULL,
      note VARCHAR(255), created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant(tenant_id))`,
    `CREATE TABLE IF NOT EXISTS expenses (
      id INT AUTO_INCREMENT PRIMARY KEY, tenant_id INT NOT NULL,
      type ENUM('expense','cash_in') NOT NULL DEFAULT 'expense',
      amount DECIMAL(10,2) NOT NULL, note VARCHAR(255), category VARCHAR(80),
      recorded_by INT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant(tenant_id))`,
    `CREATE TABLE IF NOT EXISTS stock_movements (
      id INT AUTO_INCREMENT PRIMARY KEY, tenant_id INT NOT NULL, product_id INT NOT NULL,
      user_id INT, type ENUM('purchase','sale','adjustment','return') NOT NULL,
      qty DECIMAL(10,2) NOT NULL, note VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant(tenant_id))`,
    `CREATE TABLE IF NOT EXISTS plan_upgrade_requests (
      id INT AUTO_INCREMENT PRIMARY KEY, tenant_id INT NOT NULL,
      current_plan VARCHAR(20) NOT NULL, requested_plan VARCHAR(20) NOT NULL,
      current_user_limit INT NOT NULL, requested_user_limit INT NOT NULL,
      status ENUM('pending','approved','rejected') DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, resolved_at DATETIME,
      INDEX idx_tenant(tenant_id))`,
    `CREATE TABLE IF NOT EXISTS tenant_settings (
      tenant_id INT NOT NULL PRIMARY KEY, data JSON NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`,
  ]

  for (const sql of tables) await conn.query(sql)
  await conn.end()
  console.log('[test] pos_db_test schema ready')
  process.env.TEST_DB = 'pos_db_test'
}
