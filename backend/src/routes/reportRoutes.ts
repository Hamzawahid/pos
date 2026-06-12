import { Router } from 'express'
import { pool } from '../db'
import { auth } from '../auth'

const r = Router()
r.use(auth)

r.get('/daily', async (req, res) => {
  const { tenantId } = (req as any).user
  const date = req.query.date || new Date().toISOString().slice(0, 10)
  const [[summary]]: any = await pool.query(`
    SELECT
      COUNT(*) as totalSales,
      COALESCE(SUM(total),0) as revenue,
      COALESCE(SUM(paid),0) as cashCollected,
      COALESCE(SUM(total-paid),0) as creditGiven,
      COALESCE(SUM(discount),0) as totalDiscount
    FROM sales WHERE tenant_id=? AND DATE(created_at)=? AND status='completed'`, [tenantId, date])

  const [topProducts]: any = await pool.query(`
    SELECT si.product_name, SUM(si.qty) as qty, SUM(si.subtotal) as revenue
    FROM sale_items si JOIN sales s ON s.id=si.sale_id
    WHERE s.tenant_id=? AND DATE(s.created_at)=? AND s.status='completed'
    GROUP BY si.product_id, si.product_name ORDER BY revenue DESC LIMIT 10`, [tenantId, date])

  const [byHour]: any = await pool.query(`
    SELECT HOUR(created_at) as hour, COUNT(*) as sales, SUM(total) as revenue
    FROM sales WHERE tenant_id=? AND DATE(created_at)=? AND status='completed'
    GROUP BY hour ORDER BY hour`, [tenantId, date])

  res.json({ date, summary, topProducts, byHour })
})

r.get('/weekly', async (req, res) => {
  const { tenantId } = (req as any).user
  const [days]: any = await pool.query(`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as totalSales,
      COALESCE(SUM(total),0) as revenue,
      COALESCE(SUM(paid),0) as cashCollected,
      COALESCE(SUM(total-paid),0) as creditGiven
    FROM sales WHERE tenant_id=? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND status='completed'
    GROUP BY DATE(created_at) ORDER BY date`, [tenantId])

  const [[totals]]: any = await pool.query(`
    SELECT COUNT(*) as totalSales, COALESCE(SUM(total),0) as revenue,
      COALESCE(SUM(paid),0) as cashCollected, COALESCE(SUM(total-paid),0) as creditGiven
    FROM sales WHERE tenant_id=? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND status='completed'`, [tenantId])

  const [topProducts]: any = await pool.query(`
    SELECT si.product_name, SUM(si.qty) as qty, SUM(si.subtotal) as revenue
    FROM sale_items si JOIN sales s ON s.id=si.sale_id
    WHERE s.tenant_id=? AND s.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND s.status='completed'
    GROUP BY si.product_id, si.product_name ORDER BY revenue DESC LIMIT 10`, [tenantId])

  res.json({ days, totals, topProducts })
})

r.get('/low-stock', async (req, res) => {
  const { tenantId } = (req as any).user
  const [rows]: any = await pool.query('SELECT p.*, c.name as categoryName FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.tenant_id=? AND p.active=1 AND p.stock_qty <= p.low_stock_at ORDER BY p.stock_qty', [tenantId])
  res.json(rows)
})

// ── Customer-wise ledger: outstanding balances across all customers ──
r.get('/customer-ledger', async (req, res) => {
  const { tenantId } = (req as any).user
  const { search } = req.query
  let q = `SELECT id, name, phone, credit_balance, credit_limit, total_purchases
           FROM customers WHERE tenant_id=?`
  const params: any[] = [tenantId]
  if (search) { q += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  q += ' ORDER BY credit_balance DESC, name'
  const [customers]: any = await pool.query(q, params)
  const [[totals]]: any = await pool.query(
    `SELECT COALESCE(SUM(credit_balance),0) totalOutstanding,
            COALESCE(SUM(total_purchases),0) totalPurchases,
            COUNT(*) totalCustomers,
            SUM(CASE WHEN credit_balance > 0 THEN 1 ELSE 0 END) withBalance
     FROM customers WHERE tenant_id=?`, [tenantId])
  res.json({ customers, totals })
})

// ── Stock-wise ledger: per-product in/out summary, or one product's movements ──
r.get('/stock-ledger', async (req, res) => {
  const { tenantId } = (req as any).user
  const { product_id, from, to } = req.query
  if (product_id) {
    let q = `SELECT sm.*, p.name productName, p.unit FROM stock_movements sm
             JOIN products p ON p.id=sm.product_id
             WHERE sm.tenant_id=? AND sm.product_id=?`
    const params: any[] = [tenantId, product_id]
    if (from) { q += ' AND DATE(sm.created_at)>=?'; params.push(from) }
    if (to)   { q += ' AND DATE(sm.created_at)<=?'; params.push(to) }
    q += ' ORDER BY sm.created_at DESC LIMIT 500'
    const [movements]: any = await pool.query(q, params)
    return res.json({ movements })
  }
  const [products]: any = await pool.query(
    `SELECT p.id, p.name, p.unit, p.stock_qty,
       COALESCE(SUM(CASE WHEN sm.qty>0 THEN sm.qty END),0) totalIn,
       COALESCE(SUM(CASE WHEN sm.qty<0 THEN -sm.qty END),0) totalOut
     FROM products p LEFT JOIN stock_movements sm ON sm.product_id=p.id
     WHERE p.tenant_id=? AND p.active=1
     GROUP BY p.id, p.name, p.unit, p.stock_qty
     ORDER BY p.name`, [tenantId])
  res.json({ products })
})

// ── Day-wise ledger (day book): money summary per day in a range ──
r.get('/day-book', async (req, res) => {
  const { tenantId } = (req as any).user
  const from = (req.query.from as string) || new Date().toISOString().slice(0, 10)
  const to = (req.query.to as string) || from
  const [sales]: any = await pool.query(
    `SELECT DATE(created_at) date, COUNT(*) sales,
       COALESCE(SUM(total),0) revenue, COALESCE(SUM(paid),0) cash,
       COALESCE(SUM(total-paid),0) credit, COALESCE(SUM(discount),0) discount
     FROM sales WHERE tenant_id=? AND DATE(created_at) BETWEEN ? AND ? AND status='completed'
     GROUP BY DATE(created_at)`, [tenantId, from, to])
  const [payments]: any = await pool.query(
    `SELECT DATE(created_at) date, COALESCE(SUM(-amount),0) received
     FROM customer_ledger WHERE tenant_id=? AND type='payment' AND DATE(created_at) BETWEEN ? AND ?
     GROUP BY DATE(created_at)`, [tenantId, from, to])
  // merge into one map keyed by date
  const map: any = {}
  for (const s of sales) map[s.date] = { date: s.date, sales: s.sales, revenue: +s.revenue, cash: +s.cash, credit: +s.credit, discount: +s.discount, received: 0 }
  for (const p of payments) { map[p.date] = map[p.date] || { date: p.date, sales: 0, revenue: 0, cash: 0, credit: 0, discount: 0, received: 0 }; map[p.date].received = +p.received }
  const days = Object.values(map).sort((a: any, b: any) => (a.date < b.date ? 1 : -1))
  const totals = days.reduce((t: any, d: any) => ({
    revenue: t.revenue + d.revenue, cash: t.cash + d.cash, credit: t.credit + d.credit,
    received: t.received + d.received, discount: t.discount + d.discount, sales: t.sales + d.sales,
  }), { revenue: 0, cash: 0, credit: 0, received: 0, discount: 0, sales: 0 })
  res.json({ days, totals, from, to })
})


export default r
