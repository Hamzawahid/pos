// Boots the REAL compiled backend (backend/dist) against pos_db_test and talks
// to it over HTTP.
//
// The older tests in tests/api/ exercise tests/helpers/app.js, which is a
// re-implementation of the routes rather than the shipped code. That is exactly
// how the July drift went unnoticed: /suppliers existed only in compiled dist,
// so nothing failed when a rebuild dropped it. Everything added for the
// consolidated release runs against the real server instead.
const { spawn } = require('child_process')
const path = require('path')
const mysql = require('mysql2/promise')
const jwt = require('jsonwebtoken')

const BACKEND = path.resolve(__dirname, '../../backend')
const JWT_SECRET = 'retailpos_test_secret_consolidation'

// Each test file boots its own server, so the port has to be chosen at runtime —
// a fixed one collides as soon as a second file starts.
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = require('net').createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

let child
let pool
let PORT
let BASE

async function start() {
  PORT = await freePort()
  BASE = `http://127.0.0.1:${PORT}`
  pool = mysql.createPool({
    host: 'localhost', user: 'prod_user', password: process.env.DB_PASSWORD || '', database: 'pos_db_test',
    waitForConnections: true, connectionLimit: 5,
  })
  child = spawn('node', ['dist/index.js'], {
    cwd: BACKEND,
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_HOST: 'localhost',
      DB_USER: 'prod_user',
      DB_PASSWORD: process.env.DB_PASSWORD || '',
      DB_NAME: 'pos_db_test',
      JWT_SECRET,
      NODE_ENV: 'test',
      UPLOAD_DIR: '/tmp/rp-test-uploads',
      ANTHROPIC_API_KEY: '',        // OCR must report "not configured", not crash
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const logs = []
  child.stdout.on('data', d => logs.push(String(d)))
  child.stderr.on('data', d => logs.push(String(d)))

  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/auth/me`, { signal: AbortSignal.timeout(1500) })
      if (r.status === 401) return          // up, and correctly rejecting anonymous
    } catch { /* not listening yet */ }
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error('real backend did not start in 25s. Output:\n' + logs.join(''))
}

async function stop() {
  if (pool) await pool.end()
  if (child && !child.killed) child.kill('SIGKILL')
}

const token = (u) => jwt.sign(u, JWT_SECRET, { expiresIn: '1h' })

async function req(method, url, { as, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (as) headers.Authorization = 'Bearer ' + token(as)
  const r = await fetch(BASE + url, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* non-JSON body */ }
  return { status: r.status, body: json, raw: text }
}

// Creates an isolated tenant + owner/cashier so tests never collide.
async function makeTenant(label) {
  const slug = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const [t] = await pool.query(
    "INSERT INTO tenants (name, slug, plan, user_limit, status, active) VALUES (?,?,'pro',5,'approved',1)",
    [label, slug])
  const tenantId = t.insertId
  const [o] = await pool.query(
    "INSERT INTO users (tenant_id, name, email, password, role) VALUES (?,?,?,'x','owner')",
    [tenantId, 'Owner ' + slug, `owner-${slug}@test.local`])
  const [c] = await pool.query(
    "INSERT INTO users (tenant_id, name, email, password, role) VALUES (?,?,?,'x','cashier')",
    [tenantId, 'Cashier ' + slug, `cashier-${slug}@test.local`])
  return {
    tenantId,
    owner:   { id: o.insertId, tenantId, role: 'owner',   name: 'Owner',   email: `owner-${slug}@test.local` },
    cashier: { id: c.insertId, tenantId, role: 'cashier', name: 'Cashier', email: `cashier-${slug}@test.local` },
  }
}

module.exports = { start, stop, req, token, makeTenant, pool: () => pool, base: () => BASE }
