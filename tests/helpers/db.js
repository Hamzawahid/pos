// helpers/db.js — Test database helper (uses pos_db_test isolated from prod)
const mysql = require('mysql2/promise')

const TEST_DB = 'pos_db_test'
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'prod_user',
  password: process.env.DB_PASSWORD || 'RetailPOS_prod_2024',
  database: TEST_DB,
  waitForConnections: true,
  connectionLimit: 5,
}

let pool

async function getPool() {
  if (!pool) pool = mysql.createPool(DB_CONFIG)
  return pool
}

async function query(sql, params) {
  const p = await getPool()
  const [rows] = await p.query(sql, params)
  return rows
}

async function closePool() {
  if (pool) { await pool.end(); pool = null }
}

// Truncate all test tables in correct FK order
async function resetDb() {
  const p = await getPool()
  await p.query('SET FOREIGN_KEY_CHECKS=0')
  for (const t of ['customer_ledger','sale_items','sales','stock_movements','expenses',
                   'plan_upgrade_requests','products','categories','customers',
                   'users','tenant_settings','tenants','super_admins']) {
    await p.query(`TRUNCATE TABLE ${t}`)
  }
  await p.query('SET FOREIGN_KEY_CHECKS=1')
}

// Seed a tenant + owner user, return { tenantId, userId, token }
async function seedTenant(opts = {}) {
  const bcrypt = require('bcryptjs')
  const jwt = require('jsonwebtoken')
  const JWT_SECRET = 'retailpos_jwt_secret_axion_2024'

  const name = opts.name || 'Test Store'
  const slug = 'test-store-' + Date.now()
  const plan = opts.plan || 'pro'
  const userLimit = opts.userLimit || 5
  const status = opts.status || 'approved'
  const active = opts.active !== undefined ? opts.active : 1

  const [tRes] = await (await getPool()).query(
    "INSERT INTO tenants (name, slug, plan, user_limit, status, active, approved_at) VALUES (?,?,?,?,?,?,NOW())",
    [name, slug, plan, userLimit, status, active]
  )
  const tenantId = tRes.insertId

  const email = opts.email || `owner_${tenantId}@test.com`
  const password = opts.password || 'Test@1234'
  const hash = await bcrypt.hash(password, 10)

  const [uRes] = await (await getPool()).query(
    "INSERT INTO users (tenant_id, name, email, password, role, active) VALUES (?,?,?,?,?,1)",
    [tenantId, opts.ownerName || 'Test Owner', email, hash, 'owner']
  )
  const userId = uRes.insertId
  const token = jwt.sign({ id: userId, tenantId, role: 'owner', name: opts.ownerName || 'Test Owner', email }, JWT_SECRET, { expiresIn: '1d' })

  return { tenantId, userId, token, email, password, slug }
}

// Seed an additional user for a tenant
async function seedUser(tenantId, role = 'cashier', opts = {}) {
  const bcrypt = require('bcryptjs')
  const jwt = require('jsonwebtoken')
  const JWT_SECRET = 'retailpos_jwt_secret_axion_2024'

  const email = opts.email || `${role}_${Date.now()}@test.com`
  const password = opts.password || 'Test@1234'
  const hash = await bcrypt.hash(password, 10)
  const [res] = await (await getPool()).query(
    "INSERT INTO users (tenant_id, name, email, password, role, active, blocked_by_admin) VALUES (?,?,?,?,?,1,0)",
    [tenantId, opts.name || `${role} User`, email, hash, role]
  )
  const userId = res.insertId
  const token = jwt.sign({ id: userId, tenantId, role, name: opts.name || `${role} User`, email }, JWT_SECRET, { expiresIn: '1d' })
  return { userId, token, email }
}

// Seed a product
async function seedProduct(tenantId, opts = {}) {
  const [res] = await (await getPool()).query(
    "INSERT INTO products (tenant_id, name, sale_price, cost_price, stock_qty, unit, active, is_favorite) VALUES (?,?,?,?,?,?,1,0)",
    [tenantId, opts.name || 'Widget', opts.sale_price || 100, opts.cost_price || 60, opts.stock_qty || 50, opts.unit || 'pcs']
  )
  return { id: res.insertId, name: opts.name || 'Widget', sale_price: opts.sale_price || 100, stock_qty: opts.stock_qty || 50 }
}

// Seed a customer
async function seedCustomer(tenantId, opts = {}) {
  const [res] = await (await getPool()).query(
    "INSERT INTO customers (tenant_id, name, phone, credit_balance, credit_limit, total_purchases) VALUES (?,?,?,0,?,0)",
    [tenantId, opts.name || 'Test Customer', opts.phone || '0300-1234567', opts.credit_limit || 5000]
  )
  return { id: res.insertId }
}

// Seed a superadmin
async function seedSuperAdmin(opts = {}) {
  const bcrypt = require('bcryptjs')
  const jwt = require('jsonwebtoken')
  const JWT_SECRET = 'retailpos_jwt_secret_axion_2024'
  const email = opts.email || 'superadmin@test.com'
  const password = opts.password || 'SuperAdmin@123'
  const hash = await bcrypt.hash(password, 10)
  const [res] = await (await getPool()).query(
    "INSERT INTO super_admins (name, email, password) VALUES (?,?,?)",
    [opts.name || 'Test Super Admin', email, hash]
  )
  const token = jwt.sign({ id: res.insertId, role: 'superadmin', name: opts.name || 'Test Super Admin', email }, JWT_SECRET, { expiresIn: '1d' })
  return { id: res.insertId, token, email }
}

module.exports = { getPool, query, closePool, resetDb, seedTenant, seedUser, seedProduct, seedCustomer, seedSuperAdmin }
