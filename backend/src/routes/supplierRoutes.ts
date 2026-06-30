import { Router } from 'express'
import { pool } from '../db'
import { auth } from '../auth'
import crypto from 'crypto'

const r = Router()
r.use(auth)

const newToken = () => crypto.randomBytes(24).toString('hex')

// List
r.get('/', async (req, res) => {
  const { tenantId } = (req as any).user
  const { search } = req.query
  let q = 'SELECT * FROM suppliers WHERE tenant_id=?'
  const params: any[] = [tenantId]
  if (search) { q += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  q += ' ORDER BY name LIMIT 100'
  const [rows]: any = await pool.query(q, params)
  res.json(rows)
})

// Create (opening_balance = amount you already owe them)
r.post('/', async (req, res) => {
  const { tenantId, id: userId } = (req as any).user
  const { name, phone, address, notes, opening_balance } = req.body
  if (!name) return res.status(400).json({ error: 'Name required' })
  const ob = Number(opening_balance) || 0
  const [result]: any = await pool.query(
    'INSERT INTO suppliers (tenant_id, name, phone, address, notes, payable_balance, public_token, created_by) VALUES (?,?,?,?,?,?,?,?)',
    [tenantId, name, phone || null, address || null, notes || null, ob, newToken(), userId || null])
  if (ob > 0) {
    await pool.query('INSERT INTO supplier_ledger (tenant_id, supplier_id, type, amount, balance_after, status, note) VALUES (?,?,?,?,?,?,?)',
      [tenantId, result.insertId, 'adjustment', ob, ob, 'confirmed', 'Opening balance'])
  }
  res.json({ id: result.insertId, name, phone, address, payable_balance: ob })
})

// Update
r.put('/:id', async (req, res) => {
  const { tenantId } = (req as any).user
  const { name, phone, address, notes } = req.body
  await pool.query('UPDATE suppliers SET name=?,phone=?,address=?,notes=? WHERE id=? AND tenant_id=?',
    [name, phone || null, address || null, notes || null, req.params.id, tenantId])
  res.json({ ok: true })
})

// Ledger
r.get('/:id/ledger', async (req, res) => {
  const { tenantId } = (req as any).user
  const [supplier]: any = await pool.query('SELECT * FROM suppliers WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
  if (!supplier.length) return res.status(404).json({ error: 'Not found' })
  const [ledger]: any = await pool.query('SELECT * FROM supplier_ledger WHERE supplier_id=? AND tenant_id=? ORDER BY created_at DESC LIMIT 100', [req.params.id, tenantId])
  res.json({ supplier: supplier[0], ledger })
})

// Bill — you owe more
r.post('/:id/bill', async (req, res) => {
  const { tenantId } = (req as any).user
  const amt = Number(req.body.amount)
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Invalid amount' })
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows]: any = await conn.query('SELECT payable_balance FROM suppliers WHERE id=? AND tenant_id=? FOR UPDATE', [req.params.id, tenantId])
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Not found' }) }
    const newBalance = Number(rows[0].payable_balance || 0) + amt
    await conn.query('UPDATE suppliers SET payable_balance=? WHERE id=?', [newBalance, req.params.id])
    await conn.query('INSERT INTO supplier_ledger (tenant_id, supplier_id, type, amount, balance_after, status, note) VALUES (?,?,?,?,?,?,?)',
      [tenantId, req.params.id, 'bill', amt, newBalance, 'confirmed', req.body.note || 'Bill / purchase'])
    await conn.commit()
    res.json({ ok: true, newBalance })
  } catch (e: any) { await conn.rollback(); res.status(500).json({ error: e.message }) }
  finally { conn.release() }
})

// Payment — you paid them (Phase 1 applies immediately; Phase 3 will gate on payee confirmation)
r.post('/:id/payment', async (req, res) => {
  const { tenantId } = (req as any).user
  const amt = Number(req.body.amount)
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Invalid amount' })
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows]: any = await conn.query('SELECT payable_balance FROM suppliers WHERE id=? AND tenant_id=? FOR UPDATE', [req.params.id, tenantId])
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Not found' }) }
    const newBalance = Math.max(0, Number(rows[0].payable_balance || 0) - amt)
    await conn.query('UPDATE suppliers SET payable_balance=? WHERE id=?', [newBalance, req.params.id])
    await conn.query('INSERT INTO supplier_ledger (tenant_id, supplier_id, type, amount, balance_after, status, note) VALUES (?,?,?,?,?,?,?)',
      [tenantId, req.params.id, 'payment', -amt, newBalance, 'confirmed', req.body.note || 'Payment made'])
    await conn.commit()
    res.json({ ok: true, newBalance })
  } catch (e: any) { await conn.rollback(); res.status(500).json({ error: e.message }) }
  finally { conn.release() }
})

// Delete (block if you still owe them)
r.delete('/:id', async (req, res) => {
  const { tenantId } = (req as any).user
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows]: any = await conn.query('SELECT payable_balance FROM suppliers WHERE id=? AND tenant_id=? FOR UPDATE', [req.params.id, tenantId])
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Not found' }) }
    if (Number(rows[0].payable_balance || 0) > 0) { await conn.rollback(); return res.status(400).json({ error: 'Cannot delete a supplier you still owe. Clear the balance first.' }) }
    await conn.query('DELETE FROM supplier_ledger WHERE supplier_id=? AND tenant_id=?', [req.params.id, tenantId])
    await conn.query('DELETE FROM suppliers WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
    await conn.commit()
    res.json({ ok: true })
  } catch (e: any) { await conn.rollback(); res.status(500).json({ error: e.message }) }
  finally { conn.release() }
})

export default r
