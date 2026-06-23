import { mailNewRegistration, mailTrialStarted } from "../mailer"
import { Router } from 'express'
import { redis } from '../index'
import rateLimit from 'express-rate-limit'

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
})
import bcrypt from 'bcryptjs'
import { pool } from '../db'
import { signToken } from '../auth'

const r = Router()

r.post('/register', async (req, res) => {
  const { tenantName, name, phone, password } = req.body
  const plan = ['trial', 'basic', 'standard', 'pro', 'business'].includes(req.body.plan) ? req.body.plan : 'trial'
  if (!tenantName || !name || !phone || !password)
    return res.status(400).json({ error: 'All fields required' })
  if (typeof tenantName !== 'string' || tenantName.trim().length < 2 || tenantName.length > 100) return res.status(400).json({ error: 'Business name must be 2-100 characters' })
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100) return res.status(400).json({ error: 'Name must be 2-100 characters' })
  if (typeof phone !== 'string' || phone.length < 5 || phone.length > 100) return res.status(400).json({ error: 'Invalid email/phone' })
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) return res.status(400).json({ error: 'Password must be 6-128 characters' })
  const SEATS: any = { trial: 1, basic: 1, standard: 3, pro: 5, business: 10 }
  const userLimit = SEATS[plan]
  const isTrial = plan === 'trial'
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const slug = tenantName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40) + '-' + Date.now().toString(36)
    const [tRes]: any = await conn.query('INSERT INTO tenants (name, slug, plan, user_limit) VALUES (?,?,?,?)', [tenantName, slug, plan, userLimit])
    const tenantId = tRes.insertId
    const hash = await bcrypt.hash(password, 10)
    const [uRes]: any = await conn.query(
      'INSERT INTO users (tenant_id, name, email, password, role) VALUES (?,?,?,?,?)',
      [tenantId, name, phone, hash, 'owner']
    )
    if (isTrial) {
      // Free trial — activate immediately: 7-day full access, single user, no admin approval
      await conn.query(
        "UPDATE tenants SET status='approved', active=1, approved_at=NOW(), access_expires_at=DATE_ADD(NOW(), INTERVAL 7 DAY) WHERE id=?",
        [tenantId]
      )
      await conn.commit()
      mailTrialStarted({ name: tenantName, email: phone, plan })
      const token = signToken({ id: uRes.insertId, tenantId, role: 'owner', name, email: phone })
      return res.json({
        token,
        user: { id: uRes.insertId, name, email: phone, role: 'owner', tenantId, tenantName, tenantSlug: slug, permissions: null },
        trial: true,
      })
    }
    // Paid plan — pending until admin approves (after payment). Seat count pre-filled from tier.
    await conn.query("UPDATE tenants SET status='pending', active=0 WHERE id=?", [tenantId])
    await conn.commit()
    mailNewRegistration({ name: tenantName, slug, plan, email: phone })
    res.json({ pending: true, plan, message: 'Your registration has been submitted. Please wait for admin approval.' })
  } catch (e: any) {
    await conn.rollback()
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Phone number already registered' })
    res.status(500).json({ error: e.message })
  } finally { conn.release() }
})

r.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body
  try {
    const [rows]: any = await pool.query(
      'SELECT u.*, t.name as tenantName, t.slug, t.status as tenant_status, t.rejection_reason, t.access_expires_at, t.plan, t.user_limit FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.email=? LIMIT 1',
      [email]
    )
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' })
    const user = rows[0]
    if (!await bcrypt.compare(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' })
    // Block users disabled by super admin (seat limit) or deactivated
    if (user.blocked_by_admin || user.active === 0) return res.status(403).json({ error: 'blocked', message: 'Your account has been disabled by the administrator. Please contact support.' })
    // Check tenant approval status
    if (user.tenant_status === 'pending') return res.status(403).json({ error: 'pending', message: 'Your account is awaiting approval from admin. You will be notified once approved.' })
    if (user.tenant_status === 'rejected') return res.status(403).json({ error: 'rejected', message: 'Your registration was rejected. Reason: ' + (user.rejection_reason || 'Please contact support.') })
    if (user.access_expires_at && new Date(user.access_expires_at) < new Date()) return res.status(403).json({ error: 'blocked', message: 'Your account access has expired. Please contact the administrator to renew your access.' })
    const token = signToken({ id: user.id, tenantId: user.tenant_id, role: user.role, name: user.name, email: user.email })
    const permissions = user.permissions ? (typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions) : null
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenant_id, tenantName: user.tenantName, tenantSlug: user.slug, permissions, plan: user.plan, userLimit: user.user_limit, accessExpiresAt: user.access_expires_at } })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

r.get('/me', async (req, res) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  const jwt = require('jsonwebtoken')
  try {
    const user = jwt.verify(header.slice(7), process.env.JWT_SECRET || 'retailpos_jwt_secret_axion_2024') as any
    const [rows]: any = await pool.query('SELECT u.*, t.name as tenantName, t.slug, t.status as tenant_status, t.access_expires_at, t.plan, t.user_limit FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.id=?', [user.id])
    if (!rows.length) return res.status(401).json({ error: 'Not found' })
    const u = rows[0]
    if (u.tenant_status === 'pending') return res.status(403).json({ error: 'pending', message: 'Your account is awaiting approval.' })
    if (u.tenant_status === 'rejected') return res.status(403).json({ error: 'blocked', message: 'Your account access has been revoked.' })
    if (u.blocked_by_admin || u.active === 0) return res.status(403).json({ error: 'blocked', message: 'Your account has been disabled by the administrator. Please contact support.' })
    if (u.access_expires_at && new Date(u.access_expires_at) < new Date()) return res.status(403).json({ error: 'blocked', message: 'Your account access has expired. Please contact the administrator to renew your access.' })
    const perms2 = u.permissions ? (typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions) : null
    res.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role, tenantId: u.tenant_id, tenantName: u.tenantName, tenantSlug: u.slug, permissions: perms2, plan: u.plan, userLimit: u.user_limit, accessExpiresAt: u.access_expires_at } })
  } catch { res.status(401).json({ error: 'Invalid token' }) }
})

export default r
