import { Router } from 'express'
import { pool } from '../db'
import { auth } from '../auth'
import crypto from 'crypto'

const r = Router()
r.use(auth)

const newToken = () => crypto.randomBytes(24).toString('hex')

// List (with pending-confirmation total per supplier)
r.get('/', async (req, res) => {
  const { tenantId } = (req as any).user
  const { search } = req.query
  let q = "SELECT s.*, COALESCE((SELECT SUM(-l.amount) FROM supplier_ledger l WHERE l.supplier_id=s.id AND l.type='payment' AND l.status='pending'),0) AS pending_amount FROM suppliers s WHERE s.tenant_id=?"
  const params: any[] = [tenantId]
  if (search) { q += ' AND (s.name LIKE ? OR s.phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  q += ' ORDER BY s.name LIMIT 100'
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

// Bill — you owe more (applies immediately)
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

// Payment — recorded as PENDING; balance only moves once confirmed (Phase 3)
r.post('/:id/payment', async (req, res) => {
  const { tenantId } = (req as any).user
  const amt = Number(req.body.amount)
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Invalid amount' })
  const [rows]: any = await pool.query('SELECT payable_balance FROM suppliers WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
  if (!rows.length) return res.status(404).json({ error: 'Not found' })
  const bal = Number(rows[0].payable_balance || 0)
  const [ins]: any = await pool.query('INSERT INTO supplier_ledger (tenant_id, supplier_id, type, amount, balance_after, status, note) VALUES (?,?,?,?,?,?,?)',
    [tenantId, req.params.id, 'payment', -amt, bal, 'pending', req.body.note || 'Payment made'])
  res.json({ ok: true, pending: true, ledgerId: ins.insertId, balance: bal })
})

// Manual confirm (shop override) — confirms a pending payment, moves the balance
r.post('/:id/payments/:ledgerId/confirm', async (req, res) => {
  const { tenantId } = (req as any).user
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows]: any = await conn.query(
      'SELECT l.amount, l.status, l.type, s.payable_balance FROM supplier_ledger l JOIN suppliers s ON s.id=l.supplier_id WHERE l.id=? AND l.supplier_id=? AND s.tenant_id=? FOR UPDATE',
      [req.params.ledgerId, req.params.id, tenantId])
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Not found' }) }
    const row = rows[0]
    if (row.type !== 'payment' || row.status !== 'pending') { await conn.rollback(); return res.status(400).json({ error: 'Not a pending payment' }) }
    const amt = Math.abs(Number(row.amount))
    const newBalance = Math.max(0, Number(row.payable_balance || 0) - amt)
    await conn.query('UPDATE suppliers SET payable_balance=? WHERE id=?', [newBalance, req.params.id])
    await conn.query("UPDATE supplier_ledger SET status='confirmed', balance_after=?, confirmed_at=NOW(), confirmed_name=? WHERE id=?",
      [newBalance, 'Confirmed by shop', req.params.ledgerId])
    await conn.commit()
    res.json({ ok: true, newBalance })
  } catch (e: any) { await conn.rollback(); res.status(500).json({ error: e.message }) }
  finally { conn.release() }
})

// Rotate the public share token (revoke a leaked link)
r.post('/:id/regenerate-token', async (req, res) => {
  const { tenantId } = (req as any).user
  const [rows]: any = await pool.query('SELECT id FROM suppliers WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
  if (!rows.length) return res.status(404).json({ error: 'Not found' })
  const t = newToken()
  // rotating the link revokes the old one AND resets the vendor's PIN claim
  await pool.query('UPDATE suppliers SET public_token=?, pin_hash=NULL, claimed_at=NULL WHERE id=? AND tenant_id=?', [t, req.params.id, tenantId])
  res.json({ public_token: t })
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
