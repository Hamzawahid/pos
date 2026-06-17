import { Router } from 'express'
import { pool } from '../db'
import { auth } from '../auth'

const r = Router()
r.use(auth)

r.get('/', async (req, res) => {
  const { tenantId } = (req as any).user
  const { search } = req.query
  let q = 'SELECT * FROM customers WHERE tenant_id=?'
  const params: any[] = [tenantId]
  if (search) { q += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  q += ' ORDER BY name LIMIT 100'
  const [rows]: any = await pool.query(q, params)
  res.json(rows)
})

r.post('/', async (req, res) => {
  const { tenantId } = (req as any).user
  const { name, phone, cnic, address, credit_limit, opening_balance } = req.body
  if (!name) return res.status(400).json({ error: 'Name required' })
  const ob = Number(opening_balance) || 0
  const [result]: any = await pool.query('INSERT INTO customers (tenant_id, name, phone, cnic, address, credit_limit, credit_balance) VALUES (?,?,?,?,?,?,?)', [tenantId, name, phone||null, cnic||null, address||null, Number(credit_limit)||0, ob])
  if (ob > 0) {
    await pool.query('INSERT INTO customer_ledger (tenant_id, customer_id, type, amount, balance_after, note) VALUES (?,?,?,?,?,?)',
      [tenantId, result.insertId, 'adjustment', ob, ob, 'Opening balance'])
  }
  res.json({ id: result.insertId, name, phone, address, credit_limit: Number(credit_limit)||0, credit_balance: ob })
})

r.put('/:id', async (req, res) => {
  const { tenantId } = (req as any).user
  const { name, phone, cnic, address, credit_limit } = req.body
  await pool.query('UPDATE customers SET name=?,phone=?,cnic=?,address=?,credit_limit=? WHERE id=? AND tenant_id=?', [name, phone||null, cnic||null, address||null, Number(credit_limit)||0, req.params.id, tenantId])
  res.json({ ok: true })
})

r.get('/:id/ledger', async (req, res) => {
  const { tenantId } = (req as any).user
  const [customer]: any = await pool.query('SELECT * FROM customers WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
  if (!customer.length) return res.status(404).json({ error: 'Not found' })
  const [ledger]: any = await pool.query('SELECT * FROM customer_ledger WHERE customer_id=? AND tenant_id=? ORDER BY created_at DESC LIMIT 100', [req.params.id, tenantId])
  res.json({ customer: customer[0], ledger })
})

r.post('/:id/payment', async (req, res) => {
  const { tenantId } = (req as any).user
  const { amount, note } = req.body
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' })
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows]: any = await conn.query('SELECT credit_balance FROM customers WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    const newBalance = Math.max(0, Number(rows[0].credit_balance || 0) - amount)
    await conn.query('UPDATE customers SET credit_balance=? WHERE id=?', [newBalance, req.params.id])
    await conn.query('INSERT INTO customer_ledger (tenant_id, customer_id, type, amount, balance_after, note) VALUES (?,?,?,?,?,?)',
      [tenantId, req.params.id, 'payment', -amount, newBalance, note || 'Payment received'])
    await conn.commit()
    res.json({ ok: true, newBalance })
  } catch (e: any) { await conn.rollback(); res.status(500).json({ error: e.message }) }
  finally { conn.release() }
})


r.post('/:id/adjust', async (req, res) => {
  const { tenantId } = (req as any).user
  const { amount, note } = req.body
  const amt = Number(amount)
  if (!amt) return res.status(400).json({ error: 'Invalid amount' })
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows]: any = await conn.query('SELECT credit_balance FROM customers WHERE id=? AND tenant_id=? FOR UPDATE', [req.params.id, tenantId])
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Not found' }) }
    const newBalance = Math.max(0, Number(rows[0].credit_balance || 0) + amt)
    await conn.query('UPDATE customers SET credit_balance=? WHERE id=?', [newBalance, req.params.id])
    await conn.query('INSERT INTO customer_ledger (tenant_id, customer_id, type, amount, balance_after, note) VALUES (?,?,?,?,?,?)',
      [tenantId, req.params.id, 'adjustment', amt, newBalance, note || (amt > 0 ? 'Charge / adjustment' : 'Credit adjustment')])
    await conn.commit()
    res.json({ ok: true, newBalance })
  } catch (e: any) { await conn.rollback(); res.status(500).json({ error: e.message }) }
  finally { conn.release() }
})

r.delete('/:id', async (req, res) => {
  const { tenantId } = (req as any).user
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows]: any = await conn.query('SELECT credit_balance FROM customers WHERE id=? AND tenant_id=? FOR UPDATE', [req.params.id, tenantId])
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Not found' }) }
    if (Number(rows[0].credit_balance || 0) > 0) {
      await conn.rollback()
      return res.status(400).json({ error: 'Cannot delete a customer with outstanding credit. Clear the balance first.' })
    }
    // Preserve sales history (unlink) + remove ledger, then delete the customer.
    await conn.query('DELETE FROM customer_ledger WHERE customer_id=? AND tenant_id=?', [req.params.id, tenantId])
    await conn.query('UPDATE sales SET customer_id=NULL WHERE customer_id=? AND tenant_id=?', [req.params.id, tenantId])
    await conn.query('DELETE FROM customers WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
    await conn.commit()
    res.json({ ok: true })
  } catch (e: any) { await conn.rollback(); res.status(500).json({ error: e.message }) }
  finally { conn.release() }
})

export default r
