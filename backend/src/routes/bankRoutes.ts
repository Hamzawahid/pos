import { Router } from 'express'
import { pool } from '../db'
import { auth } from '../auth'

const r = Router()
r.use(auth)

const money = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN
}

// ── Accounts ────────────────────────────────────────────────────────────────
r.get('/', async (req, res) => {
  const { tenantId } = (req as any).user
  const [rows]: any = await pool.query(
    'SELECT * FROM bank_accounts WHERE tenant_id=? AND is_active=1 ORDER BY name', [tenantId])
  const [tot]: any = await pool.query(
    'SELECT COALESCE(SUM(balance),0) AS total FROM bank_accounts WHERE tenant_id=? AND is_active=1', [tenantId])
  res.json({ accounts: rows, total: Number(tot[0].total) })
})

r.post('/', async (req, res) => {
  const { tenantId, id: userId } = (req as any).user
  const { name, bank_name, account_number, opening_balance } = req.body
  if (!name || typeof name !== 'string' || name.trim().length < 2) return res.status(400).json({ error: 'Account name required' })
  if (name.length > 120) return res.status(400).json({ error: 'Name too long' })
  const ob = money(opening_balance || 0)
  if (!Number.isFinite(ob) || ob < 0 || ob > 100000000) return res.status(400).json({ error: 'Invalid opening balance' })
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [ins]: any = await conn.query(
      'INSERT INTO bank_accounts (tenant_id, name, bank_name, account_number, opening_balance, balance, created_by) VALUES (?,?,?,?,?,?,?)',
      [tenantId, name.trim(), bank_name || null, account_number || null, ob, ob, userId || null])
    if (ob > 0) {
      await conn.query(
        'INSERT INTO bank_transactions (tenant_id, account_id, type, amount, balance_after, note, created_by) VALUES (?,?,?,?,?,?,?)',
        [tenantId, ins.insertId, 'opening', ob, ob, 'Opening balance', userId || null])
    }
    await conn.commit()
    res.json({ id: ins.insertId })
  } catch (e: any) { await conn.rollback(); res.status(500).json({ error: e.message }) }
  finally { conn.release() }
})

r.put('/:id', async (req, res) => {
  const { tenantId } = (req as any).user
  const { name, bank_name, account_number } = req.body
  if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Account name required' })
  const [own]: any = await pool.query('SELECT id FROM bank_accounts WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
  if (!own.length) return res.status(404).json({ error: 'Not found' })
  await pool.query('UPDATE bank_accounts SET name=?, bank_name=?, account_number=? WHERE id=? AND tenant_id=?',
    [name.trim(), bank_name || null, account_number || null, req.params.id, tenantId])
  res.json({ ok: true })
})

// Deactivate (only when balance is zero — keeps history intact).
r.delete('/:id', async (req, res) => {
  const { tenantId } = (req as any).user
  const [rows]: any = await pool.query('SELECT balance FROM bank_accounts WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
  if (!rows.length) return res.status(404).json({ error: 'Not found' })
  if (Math.abs(Number(rows[0].balance)) > 0.001) return res.status(400).json({ error: 'Empty the account (balance must be 0) before removing it.' })
  await pool.query('UPDATE bank_accounts SET is_active=0 WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
  res.json({ ok: true })
})

// ── Transactions ────────────────────────────────────────────────────────────
r.get('/:id/transactions', async (req, res) => {
  const { tenantId } = (req as any).user
  const [own]: any = await pool.query('SELECT * FROM bank_accounts WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
  if (!own.length) return res.status(404).json({ error: 'Not found' })
  const [txns]: any = await pool.query(
    `SELECT bt.*, ra.name AS refAccountName, u.name AS byName
     FROM bank_transactions bt
     LEFT JOIN bank_accounts ra ON ra.id=bt.ref_account_id
     LEFT JOIN users u ON u.id=bt.created_by
     WHERE bt.account_id=? AND bt.tenant_id=? ORDER BY bt.created_at DESC, bt.id DESC LIMIT 300`,
    [req.params.id, tenantId])
  res.json({ account: own[0], transactions: txns })
})

// Deposit or withdrawal on one account.
r.post('/:id/transactions', async (req, res) => {
  const { tenantId, id: userId } = (req as any).user
  const { type, amount, note } = req.body
  if (!['deposit', 'withdrawal'].includes(type)) return res.status(400).json({ error: 'Invalid type' })
  const amt = money(amount)
  if (!Number.isFinite(amt) || amt <= 0 || amt > 100000000) return res.status(400).json({ error: 'Amount must be greater than 0' })
  if (note && (typeof note !== 'string' || note.length > 255)) return res.status(400).json({ error: 'Note too long' })
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows]: any = await conn.query('SELECT balance FROM bank_accounts WHERE id=? AND tenant_id=? FOR UPDATE', [req.params.id, tenantId])
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Not found' }) }
    const cur = Number(rows[0].balance)
    const delta = type === 'deposit' ? amt : -amt
    const next = Math.round((cur + delta) * 100) / 100
    if (next < 0) { await conn.rollback(); return res.status(400).json({ error: 'Insufficient balance for this withdrawal' }) }
    await conn.query('UPDATE bank_accounts SET balance=? WHERE id=?', [next, req.params.id])
    await conn.query('INSERT INTO bank_transactions (tenant_id, account_id, type, amount, balance_after, note, created_by) VALUES (?,?,?,?,?,?,?)',
      [tenantId, req.params.id, type, amt, next, note || null, userId || null])
    await conn.commit()
    res.json({ ok: true, balance: next })
  } catch (e: any) { await conn.rollback(); res.status(500).json({ error: e.message }) }
  finally { conn.release() }
})

// Transfer between two accounts of the same shop.
r.post('/transfer', async (req, res) => {
  const { tenantId, id: userId } = (req as any).user
  const { from_account_id, to_account_id, amount, note } = req.body
  if (!from_account_id || !to_account_id || String(from_account_id) === String(to_account_id))
    return res.status(400).json({ error: 'Choose two different accounts' })
  const amt = money(amount)
  if (!Number.isFinite(amt) || amt <= 0 || amt > 100000000) return res.status(400).json({ error: 'Amount must be greater than 0' })
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    // Lock both rows in a stable order to avoid deadlocks.
    const ids = [Number(from_account_id), Number(to_account_id)].sort((a, b) => a - b)
    const [locked]: any = await conn.query('SELECT id, balance FROM bank_accounts WHERE tenant_id=? AND id IN (?,?) FOR UPDATE', [tenantId, ids[0], ids[1]])
    const from = locked.find((a: any) => a.id == from_account_id)
    const to = locked.find((a: any) => a.id == to_account_id)
    if (!from || !to) { await conn.rollback(); return res.status(404).json({ error: 'Account not found' }) }
    const fromNext = Math.round((Number(from.balance) - amt) * 100) / 100
    if (fromNext < 0) { await conn.rollback(); return res.status(400).json({ error: 'Insufficient balance in the source account' }) }
    const toNext = Math.round((Number(to.balance) + amt) * 100) / 100
    await conn.query('UPDATE bank_accounts SET balance=? WHERE id=?', [fromNext, from_account_id])
    await conn.query('UPDATE bank_accounts SET balance=? WHERE id=?', [toNext, to_account_id])
    await conn.query('INSERT INTO bank_transactions (tenant_id, account_id, type, amount, balance_after, ref_account_id, note, created_by) VALUES (?,?,?,?,?,?,?,?)',
      [tenantId, from_account_id, 'transfer_out', amt, fromNext, to_account_id, note || null, userId || null])
    await conn.query('INSERT INTO bank_transactions (tenant_id, account_id, type, amount, balance_after, ref_account_id, note, created_by) VALUES (?,?,?,?,?,?,?,?)',
      [tenantId, to_account_id, 'transfer_in', amt, toNext, from_account_id, note || null, userId || null])
    await conn.commit()
    res.json({ ok: true })
  } catch (e: any) { await conn.rollback(); res.status(500).json({ error: e.message }) }
  finally { conn.release() }
})

export default r
