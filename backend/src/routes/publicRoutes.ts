import { Router } from 'express'
import { pool } from '../db'

// Public, no-auth payee dashboard + acknowledgement.
const r = Router()

// Read-only status by token (ledger rows include id so the payee can confirm)
r.get('/payable/:token', async (req, res) => {
  const [rows]: any = await pool.query(
    'SELECT s.id, s.name AS supplierName, s.payable_balance, t.name AS shopName, t.id AS tenant_id FROM suppliers s JOIN tenants t ON t.id = s.tenant_id WHERE s.public_token = ? LIMIT 1',
    [req.params.token])
  if (!rows.length) return res.status(404).json({ error: 'Not found' })
  const s = rows[0]
  const [ledger]: any = await pool.query(
    'SELECT id, type, amount, balance_after, note, status, confirmed_name, created_at FROM supplier_ledger WHERE supplier_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 100',
    [s.id, s.tenant_id])
  res.json({ shopName: s.shopName, supplierName: s.supplierName, balance: s.payable_balance, ledger })
})

// Payee acknowledges a pending payment → balance moves
r.post('/payable/:token/confirm', async (req, res) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [srow]: any = await conn.query('SELECT id, payable_balance FROM suppliers WHERE public_token=? LIMIT 1 FOR UPDATE', [req.params.token])
    if (!srow.length) { await conn.rollback(); return res.status(404).json({ error: 'Not found' }) }
    const sup = srow[0]
    const [rows]: any = await conn.query('SELECT amount, status, type FROM supplier_ledger WHERE id=? AND supplier_id=? FOR UPDATE', [req.body.paymentId, sup.id])
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Not found' }) }
    const row = rows[0]
    if (row.type !== 'payment' || row.status !== 'pending') { await conn.rollback(); return res.status(400).json({ error: 'Not a pending payment' }) }
    const amt = Math.abs(Number(row.amount))
    const newBalance = Math.max(0, Number(sup.payable_balance || 0) - amt)
    await conn.query('UPDATE suppliers SET payable_balance=? WHERE id=?', [newBalance, sup.id])
    await conn.query("UPDATE supplier_ledger SET status='confirmed', balance_after=?, confirmed_at=NOW(), confirmed_name=? WHERE id=?",
      [newBalance, (req.body.name || 'Payee'), req.body.paymentId])
    await conn.commit()
    res.json({ ok: true, newBalance })
  } catch (e: any) { await conn.rollback(); res.status(500).json({ error: e.message }) }
  finally { conn.release() }
})

export default r
