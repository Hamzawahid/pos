import { Router } from 'express'
import { pool } from '../db'
import { auth } from '../auth'
import { DEFAULT_SETTINGS } from './settingsRoutes'

const r = Router()
r.use(auth)

r.post('/', async (req, res) => {
  const { tenantId, id: userId } = (req as any).user
  const { items, customer_id, discount, payment_method, paid, note } = req.body
  const [_stR]: any = await pool.query('SELECT data FROM tenant_settings WHERE tenant_id=?', [tenantId])
  const _stD = _stR.length ? (typeof _stR[0].data === 'string' ? JSON.parse(_stR[0].data) : _stR[0].data) : {}
  const trackStock: boolean = _stD.trackStock !== false
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Cart is empty' })
  if (items.length > 200) return res.status(400).json({ error: 'Too many items in one sale' })
  for (const it of items) {
    const qty = Number(it.qty); const price = Number(it.unit_price)
    if (!it.product_name || typeof it.product_name !== 'string') return res.status(400).json({ error: 'Invalid item' })
    if (it.product_name.length > 200) return res.status(400).json({ error: 'Product name too long' })
    if (!Number.isFinite(qty) || qty <= 0 || qty > 9999) return res.status(400).json({ error: 'Invalid quantity: ' + it.product_name })
    if (!Number.isFinite(price) || price < 0 || price > 10000000) return res.status(400).json({ error: 'Invalid price: ' + it.product_name })
  }
  const discountNum = Number(discount) || 0
  if (!Number.isFinite(discountNum) || discountNum < 0 || discountNum > 10000000) return res.status(400).json({ error: 'Invalid discount' })
  const validMethods = ['cash', 'credit', 'mixed', 'card']
  if (payment_method && !validMethods.includes(payment_method)) return res.status(400).json({ error: 'Invalid payment method' })
  if (note && typeof note === 'string' && note.length > 500) return res.status(400).json({ error: 'Note too long' })

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const subtotal = items.reduce((s: number, i: any) => s + (i.unit_price * i.qty), 0)
    const total = Math.max(0, subtotal - (discount || 0))
    const paidAmt = payment_method === 'credit' ? 0 : (paid ?? total)
    const creditUsed = total - paidAmt

    const [sRes]: any = await conn.query(
      'INSERT INTO sales (tenant_id, user_id, customer_id, subtotal, discount, total, paid, payment_method, note) VALUES (?,?,?,?,?,?,?,?,?)',
      [tenantId, userId, customer_id||null, subtotal, discount||0, total, paidAmt, payment_method||'cash', note||null]
    )
    const saleId = sRes.insertId

    for (const item of items) {
      await conn.query(
        'INSERT INTO sale_items (sale_id, product_id, product_name, unit_price, qty, subtotal) VALUES (?,?,?,?,?,?)',
        [saleId, item.product_id||null, item.product_name, item.unit_price, item.qty, item.unit_price * item.qty]
      )
      if (item.product_id && trackStock) {
        await conn.query('UPDATE products SET stock_qty = stock_qty - ? WHERE id=? AND tenant_id=?', [item.qty, item.product_id, tenantId])
        await conn.query('INSERT INTO stock_movements (tenant_id, product_id, user_id, type, qty, note) VALUES (?,?,?,?,?,?)',
          [tenantId, item.product_id, userId, 'sale', -item.qty, `Sale #${saleId}`])
      }
    }

    if (customer_id && creditUsed > 0) {
      const [cRows]: any = await conn.query('SELECT credit_balance FROM customers WHERE id=? AND tenant_id=?', [customer_id, tenantId])
      if (cRows.length) {
        const newBalance = Number(cRows[0].credit_balance || 0) + creditUsed
        await conn.query('UPDATE customers SET credit_balance=?, total_purchases=total_purchases+? WHERE id=?', [newBalance, total, customer_id])
        await conn.query('INSERT INTO customer_ledger (tenant_id, customer_id, sale_id, type, amount, balance_after, note) VALUES (?,?,?,?,?,?,?)',
          [tenantId, customer_id, saleId, 'sale', creditUsed, newBalance, `Sale #${saleId}`])
      }
    } else if (customer_id) {
      await conn.query('UPDATE customers SET total_purchases=total_purchases+? WHERE id=?', [total, customer_id])
    }

    await conn.commit()
    res.json({ id: saleId, total, paid: paidAmt, credit: creditUsed })
  } catch (e: any) {
    await conn.rollback()
    res.status(500).json({ error: e.message })
  } finally { conn.release() }
})

r.get('/', async (req, res) => {
  const { tenantId } = (req as any).user
  const { from, to, limit = 50, offset = 0 } = req.query
  let q = 'SELECT s.*, c.name as customerName, c.phone as customerPhone, c.address as customerAddress, u.name as cashierName FROM sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN users u ON u.id=s.user_id WHERE s.tenant_id=?'
  const params: any[] = [tenantId]
  if (from) { q += ' AND DATE(s.created_at) >= ?'; params.push(from) }
  if (to)   { q += ' AND DATE(s.created_at) <= ?'; params.push(to) }
  q += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?'
  params.push(Number(limit), Number(offset))
  const [rows]: any = await pool.query(q, params)
  res.json(rows)
})

r.get('/:id', async (req, res) => {
  const { tenantId } = (req as any).user
  const [sales]: any = await pool.query('SELECT s.*, c.name as customerName, c.phone as customerPhone, c.address as customerAddress, u.name as cashierName FROM sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.tenant_id=?', [req.params.id, tenantId])
  if (!sales.length) return res.status(404).json({ error: 'Not found' })
  const [items]: any = await pool.query('SELECT * FROM sale_items WHERE sale_id=?', [req.params.id])
  res.json({ ...sales[0], items })
})

// ── Edit an existing bill: reverse old stock + ledger, apply new ones ──
r.put('/:id', async (req, res) => {
  const { tenantId, id: userId } = (req as any).user
  const saleId = Number(req.params.id)
  const { items, customer_id, discount, payment_method, paid, note } = req.body
  if (!items?.length) return res.status(400).json({ error: 'No items' })
  const [_stR2]: any = await pool.query('SELECT data FROM tenant_settings WHERE tenant_id=?', [tenantId])
  const _stD2 = _stR2.length ? (typeof _stR2[0].data === 'string' ? JSON.parse(_stR2[0].data) : _stR2[0].data) : {}
  const trackStock2: boolean = _stD2.trackStock !== false

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const [oldRows]: any = await conn.query('SELECT * FROM sales WHERE id=? AND tenant_id=? FOR UPDATE', [saleId, tenantId])
    if (!oldRows.length) { await conn.rollback(); return res.status(404).json({ error: 'Sale not found' }) }
    const old = oldRows[0]
    const [oldItems]: any = await conn.query('SELECT * FROM sale_items WHERE sale_id=?', [saleId])

    // 1) reverse old stock (add back) + audit movement
    for (const it of oldItems) {
      if (it.product_id && trackStock2) {
        await conn.query('UPDATE products SET stock_qty = stock_qty + ? WHERE id=? AND tenant_id=?', [it.qty, it.product_id, tenantId])
        await conn.query('INSERT INTO stock_movements (tenant_id, product_id, user_id, type, qty, note) VALUES (?,?,?,?,?,?)',
          [tenantId, it.product_id, userId, 'return', it.qty, `Edit reversal #${saleId}`])
      }
    }

    // 2) reverse old credit/ledger effect on the old customer
    if (old.customer_id) {
      const oldCredit = Number(old.total) - Number(old.paid)
      await conn.query('DELETE FROM customer_ledger WHERE sale_id=? AND type=?', [saleId, 'sale'])
      await conn.query('UPDATE customers SET credit_balance = GREATEST(0, credit_balance - ?), total_purchases = GREATEST(0, total_purchases - ?) WHERE id=? AND tenant_id=?',
        [oldCredit, Number(old.total), old.customer_id, tenantId])
    }

    // 3) remove old items
    await conn.query('DELETE FROM sale_items WHERE sale_id=?', [saleId])

    // 4) recompute new totals
    const subtotal = items.reduce((s: number, i: any) => s + (Number(i.unit_price) * Number(i.qty)), 0)
    const total = Math.max(0, subtotal - (Number(discount) || 0))
    const method = payment_method || 'cash'
    const paidAmt = method === 'credit' ? 0 : (paid != null ? Number(paid) : total)
    const newCredit = Math.max(0, total - paidAmt)

    // 5) update the sale row
    await conn.query('UPDATE sales SET customer_id=?, subtotal=?, discount=?, total=?, paid=?, payment_method=?, note=? WHERE id=? AND tenant_id=?',
      [customer_id || null, subtotal, Number(discount) || 0, total, paidAmt, method, note || null, saleId, tenantId])

    // 6) insert new items + decrement stock
    for (const item of items) {
      await conn.query('INSERT INTO sale_items (sale_id, product_id, product_name, unit_price, qty, subtotal) VALUES (?,?,?,?,?,?)',
        [saleId, item.product_id || null, item.product_name, item.unit_price, item.qty, Number(item.unit_price) * Number(item.qty)])
      if (item.product_id && trackStock2) {
        await conn.query('UPDATE products SET stock_qty = stock_qty - ? WHERE id=? AND tenant_id=?', [item.qty, item.product_id, tenantId])
        await conn.query('INSERT INTO stock_movements (tenant_id, product_id, user_id, type, qty, note) VALUES (?,?,?,?,?,?)',
          [tenantId, item.product_id, userId, 'sale', -item.qty, `Edit #${saleId}`])
      }
    }

    // 7) apply new ledger/credit to the (possibly new) customer
    if (customer_id) {
      const [cRows]: any = await conn.query('SELECT credit_balance FROM customers WHERE id=? AND tenant_id=? FOR UPDATE', [customer_id, tenantId])
      if (cRows.length) {
        const newBalance = Number(cRows[0].credit_balance || 0) + newCredit
        await conn.query('UPDATE customers SET total_purchases = total_purchases + ?, credit_balance = ? WHERE id=?', [total, newBalance, customer_id])
        if (newCredit > 0) {
          await conn.query('INSERT INTO customer_ledger (tenant_id, customer_id, sale_id, type, amount, balance_after, note) VALUES (?,?,?,?,?,?,?)',
            [tenantId, customer_id, saleId, 'sale', newCredit, newBalance, `Edited Sale #${saleId}`])
        }
      }
    }

    await conn.commit()
    res.json({ id: saleId, total, paid: paidAmt, credit: newCredit, edited: true })
  } catch (e: any) {
    await conn.rollback()
    res.status(500).json({ error: e.message })
  } finally { conn.release() }
})

// ── Customer credit limit + manual adjustment / opening balance ──


// DELETE /sales/:id — owner only
r.delete('/:id', async (req, res) => {
  const { tenantId, role } = (req as any).user
  if (role !== 'owner') return res.status(403).json({ error: 'Only owners can delete bills' })
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows]: any = await conn.query(
      'SELECT id FROM sales WHERE id=? AND tenant_id=?', [req.params.id, tenantId]
    )
    if (!rows.length) {
      await conn.rollback(); conn.release()
      return res.status(404).json({ error: 'Bill not found' })
    }
    await conn.query('DELETE FROM customer_ledger WHERE sale_id=?', [req.params.id])
    await conn.query('DELETE FROM sale_items WHERE sale_id=?', [req.params.id])
    await conn.query('DELETE FROM sales WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
    await conn.commit()
    res.json({ ok: true })
  } catch (e: any) {
    await conn.rollback()
    res.status(500).json({ error: e.message })
  } finally { conn.release() }
})

export default r
