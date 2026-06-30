import { Router } from 'express'
import { pool } from '../db'
import bcrypt from 'bcryptjs'

// Public, no-auth payee dashboard. The vendor "claims" the link by setting their
// own PIN (bcrypt-hashed — the shop and DB operators never see it). Accept/Decline
// then require that PIN, so the shop cannot acknowledge on the vendor's behalf.
const r = Router()

// Read-only status. `claimed` tells the page whether to show "set PIN" or actions.
r.get('/payable/:token', async (req, res) => {
  const [rows]: any = await pool.query(
    'SELECT s.id, s.name AS supplierName, s.payable_balance, s.pin_hash, t.name AS shopName, t.id AS tenant_id FROM suppliers s JOIN tenants t ON t.id = s.tenant_id WHERE s.public_token = ? LIMIT 1',
    [req.params.token])
  if (!rows.length) return res.status(404).json({ error: 'Not found' })
  const s = rows[0]
  const [ledger]: any = await pool.query(
    'SELECT id, type, amount, balance_after, note, status, confirmed_name, created_at FROM supplier_ledger WHERE supplier_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 100',
    [s.id, s.tenant_id])
  res.json({ shopName: s.shopName, supplierName: s.supplierName, balance: s.payable_balance, claimed: !!s.pin_hash, ledger })
})

// First visit: vendor sets their own PIN (one time)
r.post('/payable/:token/claim', async (req, res) => {
  const pin = String(req.body.pin || '')
  if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PIN must be 4–6 digits' })
  const [rows]: any = await pool.query('SELECT id, pin_hash FROM suppliers WHERE public_token=? LIMIT 1', [req.params.token])
  if (!rows.length) return res.status(404).json({ error: 'Not found' })
  if (rows[0].pin_hash) return res.status(409).json({ error: 'This link is already secured with a PIN' })
  const hash = await bcrypt.hash(pin, 10)
  await pool.query('UPDATE suppliers SET pin_hash=?, claimed_at=NOW() WHERE id=?', [hash, rows[0].id])
  res.json({ ok: true })
})

// shared PIN check → returns supplier row or sends an error response
async function gateByPin(req: any, res: any) {
  const [srow]: any = await pool.query('SELECT id, payable_balance, pin_hash FROM suppliers WHERE public_token=? LIMIT 1', [req.params.token])
  if (!srow.length) { res.status(404).json({ error: 'Not found' }); return null }
  const sup = srow[0]
  if (!sup.pin_hash) { res.status(400).json({ error: 'Set a PIN first' }); return null }
  if (!(await bcrypt.compare(String(req.body.pin || ''), sup.pin_hash))) { res.status(401).json({ error: 'Incorrect PIN' }); return null }
  return sup
}

// Accept → balance moves
r.post('/payable/:token/confirm', async (req, res) => {
  const sup = await gateByPin(req, res); if (!sup) return
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows]: any = await conn.query('SELECT amount, status, type, payable_balance FROM supplier_ledger l JOIN suppliers s ON s.id=l.supplier_id WHERE l.id=? AND l.supplier_id=? FOR UPDATE', [req.body.paymentId, sup.id])
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Not found' }) }
    const row = rows[0]
    if (row.type !== 'payment' || row.status !== 'pending') { await conn.rollback(); return res.status(400).json({ error: 'Not a pending payment' }) }
    const amt = Math.abs(Number(row.amount))
    const nb = Math.max(0, Number(row.payable_balance || 0) - amt)
    await conn.query('UPDATE suppliers SET payable_balance=? WHERE id=?', [nb, sup.id])
    await conn.query("UPDATE supplier_ledger SET status='confirmed', balance_after=?, confirmed_at=NOW(), confirmed_name=? WHERE id=?", [nb, (req.body.name || 'Payee'), req.body.paymentId])
    await conn.commit()
    res.json({ ok: true, newBalance: nb })
  } catch (e: any) { await conn.rollback(); res.status(500).json({ error: e.message }) }
  finally { conn.release() }
})

// Decline → flagged disputed, balance untouched
r.post('/payable/:token/decline', async (req, res) => {
  const sup = await gateByPin(req, res); if (!sup) return
  const [rows]: any = await pool.query('SELECT status, type, note FROM supplier_ledger WHERE id=? AND supplier_id=?', [req.body.paymentId, sup.id])
  if (!rows.length) return res.status(404).json({ error: 'Not found' })
  const row = rows[0]
  if (row.type !== 'payment' || row.status !== 'pending') return res.status(400).json({ error: 'Not a pending payment' })
  const note = (row.note || '') + ' | DECLINED' + (req.body.reason ? ': ' + req.body.reason : '')
  await pool.query("UPDATE supplier_ledger SET status='disputed', confirmed_at=NOW(), confirmed_name=?, note=? WHERE id=?", [(req.body.name || 'Payee'), note, req.body.paymentId])
  res.json({ ok: true, disputed: true })
})

export default r
