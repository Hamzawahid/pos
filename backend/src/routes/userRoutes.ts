import { mailPlanRequest } from '../mailer'
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { pool } from '../db'
import { auth, requireRole } from '../auth'

const r = Router()
r.use(auth)

r.get('/', requireRole('owner','manager'), async (req, res) => {
  const { tenantId } = (req as any).user
  const [rows]: any = await pool.query(
    'SELECT id, name, email, role, active, permissions, created_at FROM users WHERE tenant_id=? ORDER BY FIELD(role,"owner","manager","cashier"), name',
    [tenantId]
  )
  // Parse permissions JSON for each row
  const result = rows.map((u: any) => ({
    ...u,
    permissions: u.permissions ? (typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions) : null
  }))
  res.json(result)
})

r.post('/', requireRole('owner','manager'), async (req, res) => {
  const { tenantId } = (req as any).user
  const { name, email, password, role, permissions } = req.body
  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.length > 100) return res.status(400).json({ error: 'Name must be 2-100 characters' })
  if (!email || typeof email !== 'string' || email.length < 5 || email.length > 100) return res.status(400).json({ error: 'Valid email required' })
  if (!password || typeof password !== 'string' || password.length < 6 || password.length > 128) return res.status(400).json({ error: 'Password must be 6-128 characters' })
  const validRoles = ['owner', 'manager', 'cashier']
  if (role && !validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' })
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password required' })
  // Enforce seat limit: count non-blocked users against tenant.user_limit
  const [limitRows]: any = await pool.query('SELECT user_limit FROM tenants WHERE id=?', [tenantId])
  const userLimit = limitRows.length ? limitRows[0].user_limit : 1
  const [countRows]: any = await pool.query('SELECT COUNT(*) AS c FROM users WHERE tenant_id=? AND blocked_by_admin=0', [tenantId])
  if (countRows[0].c >= userLimit) {
    return res.status(403).json({ error: 'limit_reached', message: `You have reached your user limit of ${userLimit}. Please contact the administrator to add more users.` })
  }
  const hash = await bcrypt.hash(password, 10)
  const permsJson = permissions ? JSON.stringify(permissions) : null
  try {
    const [result]: any = await pool.query(
      'INSERT INTO users (tenant_id, name, email, password, role, permissions) VALUES (?,?,?,?,?,?)',
      [tenantId, name, email, hash, role || 'cashier', permsJson]
    )
    res.json({ id: result.insertId, name, email, role: role || 'cashier', permissions })
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already in use' })
    res.status(500).json({ error: e.message })
  }
})

r.put('/:id', requireRole('owner','manager'), async (req, res) => {
  const { tenantId } = (req as any).user
  const { name, role, active, permissions, password } = req.body
  const permsJson = permissions !== undefined ? JSON.stringify(permissions) : undefined
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10)
      if (permsJson !== undefined) {
        await pool.query(
          'UPDATE users SET name=?, role=?, active=?, permissions=?, password=? WHERE id=? AND tenant_id=?',
          [name, role, active ?? 1, permsJson, hash, req.params.id, tenantId]
        )
      } else {
        await pool.query(
          'UPDATE users SET name=?, role=?, active=?, password=? WHERE id=? AND tenant_id=?',
          [name, role, active ?? 1, hash, req.params.id, tenantId]
        )
      }
    } else {
      if (permsJson !== undefined) {
        await pool.query(
          'UPDATE users SET name=?, role=?, active=?, permissions=? WHERE id=? AND tenant_id=?',
          [name, role, active ?? 1, permsJson, req.params.id, tenantId]
        )
      } else {
        await pool.query(
          'UPDATE users SET name=?, role=?, active=? WHERE id=? AND tenant_id=?',
          [name, role, active ?? 1, req.params.id, tenantId]
        )
      }
    }
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

r.delete('/:id', requireRole('owner'), async (req, res) => {
  const { tenantId, id: callerId } = (req as any).user
  if (String(req.params.id) === String(callerId)) return res.status(400).json({ error: 'Cannot delete yourself' })
  await pool.query('DELETE FROM users WHERE id=? AND tenant_id=? AND role != ?', [req.params.id, tenantId, 'owner'])
  res.json({ ok: true })
})

export default r

// POST /users/plan-upgrade-request
r.post('/plan-upgrade-request', requireRole('owner'), async (req, res) => {
  try {
    const { tenantId } = (req as any).user
    const { requestedPlan } = req.body
    const SEATS: any = { trial: 1, basic: 1, standard: 3, pro: 5, business: 10 }
    if (!SEATS[requestedPlan]) return res.status(400).json({ error: 'Invalid plan' })
    const [rows]: any = await pool.query('SELECT plan, user_limit FROM tenants WHERE id=?', [tenantId])
    if (!rows.length) return res.status(404).json({ error: 'Tenant not found' })
    const { plan: currentPlan, user_limit: currentLimit } = rows[0]
    // Cancel any existing pending request first
    await pool.query("DELETE FROM plan_upgrade_requests WHERE tenant_id=? AND status='pending'", [tenantId])
    await pool.query(
      'INSERT INTO plan_upgrade_requests (tenant_id, current_plan, requested_plan, current_user_limit, requested_user_limit) VALUES (?,?,?,?,?)',
      [tenantId, currentPlan || 'trial', requestedPlan, currentLimit, SEATS[requestedPlan]]
    )
    const [tRows]: any = await pool.query('SELECT name, slug FROM tenants WHERE id=?', [tenantId])
    if (tRows.length) { try { mailPlanRequest(tRows[0], currentPlan || 'trial', requestedPlan, currentLimit, SEATS[requestedPlan]) } catch {} }
    res.json({ ok: true, message: 'Upgrade request submitted. Admin will review shortly.' })
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to submit upgrade request' })
  }
})

// GET /users/plan-upgrade-request — check if tenant has a pending request
r.get('/plan-upgrade-request', requireRole('owner','manager'), async (req, res) => {
  const { tenantId } = (req as any).user
  const [rows]: any = await pool.query(
    'SELECT * FROM plan_upgrade_requests WHERE tenant_id=? ORDER BY created_at DESC LIMIT 1',
    [tenantId]
  )
  res.json(rows[0] || null)
})
