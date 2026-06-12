import { Router } from 'express'
import { pool } from '../db'
import { auth } from '../auth'

const r = Router()
r.use(auth)

r.get('/', async (req, res) => {
  const { tenantId } = (req as any).user
  const { date } = req.query
  let q = 'SELECT e.*, u.name as recorded_by_name FROM expenses e LEFT JOIN users u ON u.id=e.recorded_by WHERE e.tenant_id=?'
  const params: any[] = [tenantId]
  if (date) { q += ' AND DATE(e.created_at)=?'; params.push(date) }
  q += ' ORDER BY e.created_at DESC LIMIT 200'
  const [rows]: any = await pool.query(q, params)
  res.json(rows)
})

r.get('/summary', async (req, res) => {
  const { tenantId } = (req as any).user
  const { date } = req.query
  const d = date || new Date().toISOString().slice(0, 10)
  const [rows]: any = await pool.query(
    `SELECT 
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) as total_expenses,
      COALESCE(SUM(CASE WHEN type='cash_in' THEN amount ELSE 0 END), 0) as total_cash_in,
      COUNT(*) as count
     FROM expenses WHERE tenant_id=? AND DATE(created_at)=?`,
    [tenantId, d]
  )
  res.json(rows[0])
})

r.post('/', async (req, res) => {
  const { tenantId, id: userId } = (req as any).user
  const { type, amount, note, category } = req.body
  const amountNum = Number(amount)
  if (!amount || !Number.isFinite(amountNum) || amountNum <= 0 || amountNum > 10000000) return res.status(400).json({ error: 'Amount must be between 1 and 10,000,000' })
  const validTypes = ['expense', 'cash_in']
  if (type && !validTypes.includes(type)) return res.status(400).json({ error: 'Invalid type' })
  if (note && (typeof note !== 'string' || note.length > 500)) return res.status(400).json({ error: 'Note too long (max 500)' })
  if (category && (typeof category !== 'string' || category.length > 80)) return res.status(400).json({ error: 'Category too long' })
  const [result]: any = await pool.query(
    'INSERT INTO expenses (tenant_id, type, amount, note, category, recorded_by) VALUES (?,?,?,?,?,?)',
    [tenantId, type||'expense', amountNum, note?.trim()||null, category||'General', userId]
  )
  const [rows]: any = await pool.query('SELECT * FROM expenses WHERE id=?', [result.insertId])
  res.json(rows[0])
})

r.delete('/:id', async (req, res) => {
  const { tenantId } = (req as any).user
  await pool.query('DELETE FROM expenses WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
  res.json({ ok: true })
})

export default r
