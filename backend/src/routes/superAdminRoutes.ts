import { mailCompanyApproved, mailCompanyRejected, mailUserDisabled, mailPlanRequest } from "../mailer"
import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { pool } from '../db'
import { signToken } from '../auth'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'retailpos_jwt_secret_axion_2024'

export const r = Router()

function superAuth(req: Request, res: Response, next: Function) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET) as any
    if (decoded.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' })
    ;(req as any).admin = decoded
    next()
  } catch { res.status(401).json({ error: 'Invalid token' }) }
}

// POST /superadmin/login
r.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'email and password required' })
  try {
    const [rows]: any = await pool.query('SELECT * FROM super_admins WHERE email=? LIMIT 1', [email])
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' })
    const admin = rows[0]
    if (!await bcrypt.compare(password, admin.password)) return res.status(401).json({ error: 'Invalid credentials' })
    const token = signToken({ id: admin.id, role: 'superadmin', name: admin.name, email: admin.email })
    res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email } })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// GET /superadmin/tenants — all tenants with their owner info
r.get('/tenants', superAuth, async (req: Request, res: Response) => {
  try {
    const [rows]: any = await pool.query(`
      SELECT t.*, u.name as owner_name, u.email as owner_email,
        (SELECT COUNT(*) FROM users WHERE tenant_id=t.id) as user_count,
        (SELECT COUNT(*) FROM users WHERE tenant_id=t.id AND blocked_by_admin=0) as active_user_count,
        CASE WHEN t.access_expires_at IS NOT NULL AND t.access_expires_at < NOW() THEN 1 ELSE 0 END as is_expired
      FROM tenants t
      LEFT JOIN users u ON u.tenant_id=t.id AND u.role='owner'
      ORDER BY t.created_at DESC
    `)
    res.json(rows)
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// GET /superadmin/overview?date=YYYY-MM-DD
// Platform-wide daily KPIs + per-tenant active/inactive flag (7-day window).
const ACTIVE_THRESHOLD_SEC = 600 // a tenant is "active" with >=10 min of POS use OR any invoice in the last 7 days
r.get('/overview', superAuth, async (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? String(req.query.date) : today
    const d7 = new Date(date + 'T00:00:00Z'); d7.setUTCDate(d7.getUTCDate() - 6)
    const from7 = d7.toISOString().slice(0, 10)

    const [
      [dayU], [dayS], [dayT], [a7], [s7], [lastA], [lastS],
    ]: any = await Promise.all([
      pool.query('SELECT COUNT(DISTINCT user_id) users, COALESCE(SUM(active_seconds),0) sec FROM user_activity WHERE activity_date=? AND active_seconds>0', [date]),
      pool.query('SELECT COUNT(*) invoices, COALESCE(SUM(total),0) sales FROM sales WHERE DATE(created_at)=?', [date]),
      pool.query('SELECT COUNT(*) c FROM (SELECT tenant_id FROM user_activity WHERE activity_date=? AND active_seconds>0 UNION SELECT tenant_id FROM sales WHERE DATE(created_at)=?) x', [date, date]),
      pool.query('SELECT tenant_id, COALESCE(SUM(active_seconds),0) sec FROM user_activity WHERE activity_date BETWEEN ? AND ? GROUP BY tenant_id', [from7, date]),
      pool.query('SELECT tenant_id, COUNT(*) invoices, COALESCE(SUM(total),0) sales FROM sales WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY tenant_id', [from7, date]),
      pool.query('SELECT tenant_id, MAX(last_seen) ts FROM user_activity GROUP BY tenant_id', []),
      pool.query('SELECT tenant_id, MAX(created_at) ts FROM sales GROUP BY tenant_id', []),
    ])

    const idx = (rows: any[]) => { const o: any = {}; for (const r of rows) o[r.tenant_id] = r; return o }
    const A = idx(a7), S = idx(s7), LA = idx(lastA), LS = idx(lastS)
    const ids = new Set<number>([...a7, ...s7, ...lastA, ...lastS].map((r: any) => r.tenant_id))
    const tenants = [...ids].map((id) => {
      const sec = Number(A[id]?.sec || 0)
      const inv = Number(S[id]?.invoices || 0)
      const times = [LA[id]?.ts, LS[id]?.ts].filter(Boolean).map((t: any) => new Date(t).getTime())
      const last = times.length ? new Date(Math.max(...times)).toISOString() : null
      return {
        tenant_id: id,
        invoices_7d: inv,
        sales_7d: Number(S[id]?.sales || 0),
        active_seconds_7d: sec,
        last_active: last,
        is_active: inv > 0 || sec >= ACTIVE_THRESHOLD_SEC,
      }
    })

    res.json({
      date,
      totals: {
        active_tenants: Number(dayT[0]?.c || 0),
        active_users: Number(dayU[0]?.users || 0),
        active_seconds: Number(dayU[0]?.sec || 0),
        invoices: Number(dayS[0]?.invoices || 0),
        sales: Number(dayS[0]?.sales || 0),
      },
      tenants,
    })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// GET /superadmin/tenants/:id/usage?from=YYYY-MM-DD&to=YYYY-MM-DD
// Per-user usage & productivity report for one tenant over a date range.
r.get('/tenants/:id/usage', superAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = Number(req.params.id)
    const today = new Date().toISOString().slice(0, 10)
    const to = String(req.query.to || today).slice(0, 10)
    let from = String(req.query.from || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      const d = new Date(to + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 29)
      from = d.toISOString().slice(0, 10)
    }

    const P = [tenantId, from, to]
    const [
      [users], [act], [sales], [items], [clients], [exp],
      [dInv], [dAct], [dCli],
    ]: any = await Promise.all([
      pool.query('SELECT id, name, role, active, blocked_by_admin FROM users WHERE tenant_id=? ORDER BY role, name', [tenantId]),
      pool.query('SELECT user_id, SUM(active_seconds) sec, COUNT(*) days, MIN(first_seen) first_seen, MAX(last_seen) last_seen FROM user_activity WHERE tenant_id=? AND activity_date BETWEEN ? AND ? GROUP BY user_id', P),
      pool.query("SELECT user_id, COUNT(*) invoices, COALESCE(SUM(total),0) sales_total, COALESCE(SUM(discount),0) discount_total, SUM(payment_method='credit') credit_invoices, SUM(status='refunded') refunds FROM sales WHERE tenant_id=? AND DATE(created_at) BETWEEN ? AND ? GROUP BY user_id", P),
      pool.query('SELECT s.user_id, COALESCE(SUM(si.qty),0) items FROM sale_items si JOIN sales s ON si.sale_id=s.id WHERE s.tenant_id=? AND DATE(s.created_at) BETWEEN ? AND ? GROUP BY s.user_id', P),
      pool.query('SELECT created_by user_id, COUNT(*) clients FROM customers WHERE tenant_id=? AND created_by IS NOT NULL AND DATE(created_at) BETWEEN ? AND ? GROUP BY created_by', P),
      pool.query('SELECT recorded_by user_id, COUNT(*) cnt, COALESCE(SUM(amount),0) total FROM expenses WHERE tenant_id=? AND recorded_by IS NOT NULL AND DATE(created_at) BETWEEN ? AND ? GROUP BY recorded_by', P),
      pool.query('SELECT user_id, DATE(created_at) d, COUNT(*) invoices, COALESCE(SUM(total),0) total FROM sales WHERE tenant_id=? AND DATE(created_at) BETWEEN ? AND ? GROUP BY user_id, DATE(created_at)', P),
      pool.query('SELECT user_id, activity_date d, active_seconds FROM user_activity WHERE tenant_id=? AND activity_date BETWEEN ? AND ?', P),
      pool.query('SELECT created_by user_id, DATE(created_at) d, COUNT(*) clients FROM customers WHERE tenant_id=? AND created_by IS NOT NULL AND DATE(created_at) BETWEEN ? AND ? GROUP BY created_by, DATE(created_at)', P),
    ])

    const by = (rows: any[]) => { const m: any = {}; for (const r of rows) m[r.user_id] = r; return m }
    const mAct = by(act), mSales = by(sales), mItems = by(items), mClients = by(clients), mExp = by(exp)

    // Build per-user daily series.
    const dailyMap: any = {}
    const day = (uid: any) => (dailyMap[uid] = dailyMap[uid] || {})
    const cell = (uid: any, d: string) => { const g = day(uid); return (g[d] = g[d] || { date: d, invoices: 0, sales_total: 0, active_seconds: 0, clients: 0 }) }
    const dstr = (v: any) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10))
    for (const r of dInv) { const c = cell(r.user_id, dstr(r.d)); c.invoices = Number(r.invoices); c.sales_total = Number(r.total) }
    for (const r of dAct) { cell(r.user_id, dstr(r.d)).active_seconds = Number(r.active_seconds) }
    for (const r of dCli) { cell(r.user_id, dstr(r.d)).clients = Number(r.clients) }

    const out = (users as any[]).map((u) => {
      const a = mAct[u.id] || {}, s = mSales[u.id] || {}, it = mItems[u.id] || {}, cl = mClients[u.id] || {}, ex = mExp[u.id] || {}
      const sec = Number(a.sec || 0)
      const hours = sec / 3600
      const invoices = Number(s.invoices || 0)
      const salesTotal = Number(s.sales_total || 0)
      const daily = Object.values(day(u.id)).sort((x: any, y: any) => x.date < y.date ? -1 : 1)
      return {
        user_id: u.id, name: u.name, role: u.role, active: u.active, blocked: u.blocked_by_admin,
        active_seconds: sec, active_hours: Math.round(hours * 100) / 100, days_active: Number(a.days || 0),
        first_seen: a.first_seen || null, last_seen: a.last_seen || null,
        invoices, sales_total: salesTotal, avg_invoice: invoices ? Math.round(salesTotal / invoices) : 0,
        discount_total: Number(s.discount_total || 0), credit_invoices: Number(s.credit_invoices || 0), refunds: Number(s.refunds || 0),
        items_sold: Number(it.items || 0), clients_added: Number(cl.clients || 0),
        expense_count: Number(ex.cnt || 0), expense_total: Number(ex.total || 0),
        sales_per_hour: hours >= 0.1 ? Math.round(salesTotal / hours) : 0,
        daily,
      }
    })

    const summary = {
      active_users: out.filter((u) => u.active_seconds > 0 || u.invoices > 0).length,
      total_active_seconds: out.reduce((n, u) => n + u.active_seconds, 0),
      total_invoices: out.reduce((n, u) => n + u.invoices, 0),
      total_sales: out.reduce((n, u) => n + u.sales_total, 0),
      total_clients: out.reduce((n, u) => n + u.clients_added, 0),
    }
    res.json({ range: { from, to }, users: out, summary })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// GET /superadmin/tenants/pending-count
r.get('/tenants/pending-count', superAuth, async (req: Request, res: Response) => {
  const [rows]: any = await pool.query("SELECT COUNT(*) as count FROM tenants WHERE status='pending'")
  res.json({ count: rows[0].count })
})

// PATCH /superadmin/tenants/:id/approve
// body: { type: 'permanent' | 'temporary' }  (temporary = 7 days)
r.patch('/tenants/:id/approve', superAuth, async (req: Request, res: Response) => {
  const { type } = req.body
  let userLimit = parseInt(req.body.userLimit, 10)
  if (!Number.isFinite(userLimit) || userLimit < 1) userLimit = 1
  const expiresSql = type === 'temporary'
    ? 'DATE_ADD(NOW(), INTERVAL 7 DAY)'
    : 'NULL'
  try {
    await pool.query(
      `UPDATE tenants SET status='approved', active=1, approved_at=NOW(), rejection_reason=NULL, user_limit=?, access_expires_at=${expiresSql} WHERE id=?`,
      [userLimit, req.params.id]
    )
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// GET /superadmin/tenants/:id/users — list users for seat management
r.get('/tenants/:id/users', superAuth, async (req: Request, res: Response) => {
  try {
    const [rows]: any = await pool.query(
      'SELECT id, name, email, role, active, blocked_by_admin FROM users WHERE tenant_id=? ORDER BY FIELD(role,"owner","manager","cashier"), name',
      [req.params.id]
    )
    res.json(rows)
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// PATCH /superadmin/tenants/:id/user-limit
// body: { limit: number, blockUserIds?: number[] }
// Sets the seat limit; blocks the listed users (blocked_by_admin=1).
// Validates that remaining non-blocked users <= new limit.
r.patch('/tenants/:id/user-limit', superAuth, async (req: Request, res: Response) => {
  const tenantId = req.params.id
  let limit = parseInt(req.body.limit, 10)
  if (!Number.isFinite(limit) || limit < 1) return res.status(400).json({ error: 'Limit must be at least 1' })
  const blockIds: number[] = Array.isArray(req.body.blockUserIds) ? req.body.blockUserIds.map((n: any) => parseInt(n, 10)).filter((n: number) => Number.isFinite(n)) : []
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    // Never allow blocking the owner
    if (blockIds.length) {
      const [owners]: any = await conn.query('SELECT id FROM users WHERE tenant_id=? AND role="owner" AND id IN (?)', [tenantId, blockIds])
      if (owners.length) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'The owner account cannot be blocked.' }) }
      await conn.query('UPDATE users SET blocked_by_admin=1 WHERE tenant_id=? AND id IN (?)', [tenantId, blockIds])
      const [blkRows]: any = await conn.query('SELECT u.name, u.email, t.name as tname FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.id IN (?)', [blockIds])
      blkRows.forEach((u: any) => mailUserDisabled(u.tname, u.name, u.email, 'Seat limit adjustment by admin'))
    }
    // Count remaining active seats (non-blocked)
    const [cnt]: any = await conn.query('SELECT COUNT(*) AS c FROM users WHERE tenant_id=? AND blocked_by_admin=0', [tenantId])
    if (cnt[0].c > limit) {
      await conn.rollback(); conn.release()
      return res.status(409).json({ error: 'over_limit', activeCount: cnt[0].c, limit, message: `This company still has ${cnt[0].c} active users, which is more than the limit of ${limit}. Please block enough users first.` })
    }
    await conn.query('UPDATE tenants SET user_limit=? WHERE id=?', [limit, tenantId])
    await conn.commit()
    res.json({ ok: true })
  } catch (e: any) { await conn.rollback(); res.status(500).json({ error: e.message }) }
  finally { conn.release() }
})

// PATCH /superadmin/tenants/:id/unblock-user — re-enable a previously blocked user (respects limit)
r.patch('/tenants/:id/unblock-user', superAuth, async (req: Request, res: Response) => {
  const tenantId = req.params.id
  const userId = parseInt(req.body.userId, 10)
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'userId required' })
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [trow]: any = await conn.query('SELECT user_limit FROM tenants WHERE id=?', [tenantId])
    const [cnt]: any = await conn.query('SELECT COUNT(*) AS c FROM users WHERE tenant_id=? AND blocked_by_admin=0', [tenantId])
    if (trow.length && cnt[0].c >= trow[0].user_limit) {
      await conn.rollback(); conn.release()
      return res.status(409).json({ error: 'at_limit', message: 'Seat limit reached. Increase the limit before unblocking more users.' })
    }
    await conn.query('UPDATE users SET blocked_by_admin=0 WHERE tenant_id=? AND id=?', [tenantId, userId])
    await conn.commit()
    res.json({ ok: true })
  } catch (e: any) { await conn.rollback(); res.status(500).json({ error: e.message }) }
  finally { conn.release() }
})

// PATCH /superadmin/tenants/:id/reject
r.patch('/tenants/:id/reject', superAuth, async (req: Request, res: Response) => {
  const { reason } = req.body
  try {
    await pool.query(
      "UPDATE tenants SET status='rejected', active=0, rejection_reason=? WHERE id=?",
      [reason || 'Your request was not approved.', req.params.id]
    )
    const [tRej]: any = await pool.query('SELECT name, slug FROM tenants WHERE id=?', [req.params.id])
    if (tRej.length) mailCompanyRejected({ ...tRej[0], reason })
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// DELETE /superadmin/tenants/:id — permanently remove
r.delete('/tenants/:id', superAuth, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM tenants WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})


// PATCH /superadmin/tenants/:id/extend
// body: { type: "permanent" | "temporary" }
r.patch("/tenants/:id/extend", superAuth, async (req: Request, res: Response) => {
  const { type } = req.body
  const expiresSql = type === "temporary" ? "DATE_ADD(NOW(), INTERVAL 7 DAY)" : "NULL"
  try {
    await pool.query(
      `UPDATE tenants SET access_expires_at=${expiresSql} WHERE id=?`,
      [req.params.id]
    )
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

export default r

// GET /superadmin/plan-requests — all pending upgrade/downgrade requests
r.get('/plan-requests', superAuth, async (req, res) => {
  const [rows]: any = await pool.query(
    `SELECT r.*, t.name as tenant_name, t.slug as tenant_slug
     FROM plan_upgrade_requests r
     JOIN tenants t ON t.id = r.tenant_id
     ORDER BY r.created_at DESC`
  )
  res.json(rows)
})

// GET /superadmin/plan-requests/pending-count
r.get('/plan-requests/pending-count', superAuth, async (req, res) => {
  const [rows]: any = await pool.query('SELECT COUNT(*) as c FROM plan_upgrade_requests WHERE status=pending')
  res.json({ count: rows[0].c })
})

// PATCH /superadmin/plan-requests/:id/approve
r.patch('/plan-requests/:id/approve', superAuth, async (req, res) => {
  const [rows]: any = await pool.query('SELECT * FROM plan_upgrade_requests WHERE id=?', [req.params.id])
  if (!rows.length) return res.status(404).json({ error: 'Request not found' })
  const req2 = rows[0]
  await pool.query(
    'UPDATE tenants SET plan=?, user_limit=? WHERE id=?',
    [req2.requested_plan, req2.requested_user_limit, req2.tenant_id]
  )
  await pool.query(
    'UPDATE plan_upgrade_requests SET status=approved, resolved_at=NOW() WHERE id=?',
    [req.params.id]
  )
  const [prRows]: any = await pool.query('SELECT pur.*, t.name as tenant_name, t.slug as tenant_slug FROM plan_upgrade_requests pur JOIN tenants t ON t.id=pur.tenant_id WHERE pur.id=?', [req.params.id])
    if (prRows.length) { const r2 = prRows[0]; mailPlanRequest({name:r2.tenant_name,slug:r2.tenant_slug}, r2.current_plan, r2.requested_plan, r2.current_user_limit, r2.requested_user_limit) }
    res.json({ ok: true })
})

// PATCH /superadmin/plan-requests/:id/reject
r.patch('/plan-requests/:id/reject', superAuth, async (req, res) => {
  await pool.query(
    'UPDATE plan_upgrade_requests SET status=rejected, resolved_at=NOW() WHERE id=?',
    [req.params.id]
  )
  res.json({ ok: true })
})
