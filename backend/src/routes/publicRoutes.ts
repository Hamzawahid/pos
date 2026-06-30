import { Router } from 'express'
import { pool } from '../db'

// Public, no-auth payee dashboard. A supplier opens their unguessable token link
// to see what the shop owes them and the ledger — read-only.
const r = Router()

r.get('/payable/:token', async (req, res) => {
  const [rows]: any = await pool.query(
    'SELECT s.id, s.name AS supplierName, s.payable_balance, t.name AS shopName, t.id AS tenant_id FROM suppliers s JOIN tenants t ON t.id = s.tenant_id WHERE s.public_token = ? LIMIT 1',
    [req.params.token])
  if (!rows.length) return res.status(404).json({ error: 'Not found' })
  const s = rows[0]
  const [ledger]: any = await pool.query(
    'SELECT type, amount, balance_after, note, status, created_at FROM supplier_ledger WHERE supplier_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 100',
    [s.id, s.tenant_id])
  res.json({ shopName: s.shopName, supplierName: s.supplierName, balance: s.payable_balance, ledger })
})

export default r
