import { Router } from 'express'
import { pool } from '../db'
import { auth } from '../auth'

const r = Router()
r.use(auth)

// Cash movement for a given business date — used to compute expected drawer cash.
async function cashFlow(tenantId: number, date: string) {
  const [s]: any = await pool.query(
    `SELECT COALESCE(SUM(paid),0) AS cashSales
       FROM sales WHERE tenant_id=? AND payment_method='cash' AND DATE(created_at)=?`, [tenantId, date])
  const [e]: any = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN type='cash_in' THEN amount ELSE 0 END),0) AS cashIn,
            COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expenses
       FROM expenses WHERE tenant_id=? AND DATE(created_at)=?`, [tenantId, date])
  return {
    cashSales: Number(s[0].cashSales),
    cashIn: Number(e[0].cashIn),
    expenses: Number(e[0].expenses),
  }
}

function round2(n: number) { return Math.round(n * 100) / 100 }

// GET /daily/today — today's session (if any) + live expected cash.
r.get('/today', async (req, res) => {
  const { tenantId } = (req as any).user
  const [dRow]: any = await pool.query('SELECT CURDATE() AS d')
  const date = dRow[0].d instanceof Date ? dRow[0].d.toISOString().slice(0, 10) : String(dRow[0].d)
  const [rows]: any = await pool.query(
    'SELECT * FROM daily_closings WHERE tenant_id=? AND business_date=?', [tenantId, date])
  const session = rows[0] || null
  const flow = await cashFlow(tenantId, date)
  const opening = session ? Number(session.opening_balance) : 0
  const expected = round2(opening + flow.cashSales + flow.cashIn - flow.expenses)
  res.json({ date, session, flow, expectedCash: expected })
})

// POST /daily/open { opening_balance }
r.post('/open', async (req, res) => {
  const { tenantId, id: userId } = (req as any).user
  const opening = Number(req.body.opening_balance)
  if (!Number.isFinite(opening) || opening < 0 || opening > 100000000) return res.status(400).json({ error: 'Invalid opening balance' })
  const [dRow]: any = await pool.query('SELECT CURDATE() AS d')
  const date = dRow[0].d instanceof Date ? dRow[0].d.toISOString().slice(0, 10) : String(dRow[0].d)
  const [existing]: any = await pool.query('SELECT id, status FROM daily_closings WHERE tenant_id=? AND business_date=?', [tenantId, date])
  if (existing.length) return res.status(409).json({ error: existing[0].status === 'closed' ? 'Day already closed' : 'Day already open' })
  await pool.query(
    'INSERT INTO daily_closings (tenant_id, business_date, opening_balance, status, opened_by) VALUES (?,?,?,?,?)',
    [tenantId, date, round2(opening), 'open', userId || null])
  res.json({ ok: true })
})

// POST /daily/close { closing_balance, note }
r.post('/close', async (req, res) => {
  const { tenantId, id: userId } = (req as any).user
  const closing = Number(req.body.closing_balance)
  const note = req.body.note
  if (!Number.isFinite(closing) || closing < 0 || closing > 100000000) return res.status(400).json({ error: 'Invalid closing balance' })
  if (note && (typeof note !== 'string' || note.length > 255)) return res.status(400).json({ error: 'Note too long' })
  const [dRow]: any = await pool.query('SELECT CURDATE() AS d')
  const date = dRow[0].d instanceof Date ? dRow[0].d.toISOString().slice(0, 10) : String(dRow[0].d)
  const [rows]: any = await pool.query('SELECT * FROM daily_closings WHERE tenant_id=? AND business_date=?', [tenantId, date])
  if (!rows.length) return res.status(400).json({ error: 'Open the day before closing it' })
  if (rows[0].status === 'closed') return res.status(409).json({ error: 'Day already closed' })
  const flow = await cashFlow(tenantId, date)
  const expected = round2(Number(rows[0].opening_balance) + flow.cashSales + flow.cashIn - flow.expenses)
  const diff = round2(closing - expected)
  await pool.query(
    `UPDATE daily_closings SET closing_balance=?, expected_cash=?, difference=?, status='closed', note=?, closed_by=?, closed_at=NOW()
       WHERE tenant_id=? AND business_date=?`,
    [round2(closing), expected, diff, note || null, userId || null, tenantId, date])
  res.json({ ok: true, expectedCash: expected, difference: diff })
})

// GET /daily — history (most recent first).
r.get('/', async (req, res) => {
  const { tenantId } = (req as any).user
  const [rows]: any = await pool.query(
    `SELECT dc.*, uo.name AS openedByName, uc.name AS closedByName
       FROM daily_closings dc
       LEFT JOIN users uo ON uo.id=dc.opened_by
       LEFT JOIN users uc ON uc.id=dc.closed_by
       WHERE dc.tenant_id=? ORDER BY dc.business_date DESC LIMIT 90`, [tenantId])
  res.json(rows)
})

export default r
