import { Router } from 'express'
import { pool } from '../db'
import { auth } from '../auth'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { toRecycle } from './recycleRoutes'

const r = Router()
r.use(auth)

// ── Image upload setup ────────────────────────────────────────────────────────
const uploadDir = process.env.UPLOAD_DIR || '/root/retailpos-prod-uploads'
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`),
})
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  cb(null, /image\/(jpeg|jpg|png|webp|gif)/.test(file.mimetype))
}})

r.post('/upload-image', upload.single('image'), (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image' })
  res.json({ url: `/product-images/${req.file.filename}` })
})

r.get('/', async (req, res) => {
  const { tenantId } = (req as any).user
  const { search, category, low_stock } = req.query
  let q = 'SELECT p.*, c.name as categoryName FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.tenant_id=? AND p.active=1'
  const params: any[] = [tenantId]
  if (search) { q += ' AND (p.name LIKE ? OR p.barcode=?)'; params.push(`%${search}%`, search) }
  if (category) { q += ' AND p.category_id=?'; params.push(category) }
  if (low_stock === '1') q += ' AND p.stock_qty <= p.low_stock_at'
  // Honor an optional ?limit (frontend sends 500) with a high default so shops
  // with 200+ products see them all. Sanitised to an integer — safe to inline.
  const lim = Math.min(Math.max(Number((req.query as any).limit) || 5000, 1), 10000)
  q += ` ORDER BY p.is_favorite DESC, p.name LIMIT ${lim}`
  const [rows]: any = await pool.query(q, params)
  res.json(rows)
})

r.get('/barcode/:code', async (req, res) => {
  const { tenantId } = (req as any).user
  const [rows]: any = await pool.query('SELECT p.*, c.name as categoryName FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.tenant_id=? AND p.barcode=? AND p.active=1 LIMIT 1', [tenantId, req.params.code])
  if (!rows.length) return res.status(404).json({ error: 'Product not found' })
  res.json(rows[0])
})

r.post('/', async (req, res) => {
  const { tenantId } = (req as any).user
  const { name, barcode, sku, unit, pack_unit, units_per_pack, cost_price, sale_price, stock_qty, low_stock_at, category_id, image_url, is_favorite } = req.body
  if (!name || typeof name !== "string" || name.trim().length < 2) return res.status(400).json({ error: "Product name must be at least 2 characters" })
  if (name.length > 150) return res.status(400).json({ error: 'Name too long (max 150)' })
  if (sale_price == null || !Number.isFinite(Number(sale_price)) || Number(sale_price) < 0 || Number(sale_price) > 10000000) return res.status(400).json({ error: 'Invalid sale price' })
  if (cost_price != null && (!Number.isFinite(Number(cost_price)) || Number(cost_price) < 0 || Number(cost_price) > 10000000)) return res.status(400).json({ error: 'Invalid cost price' })
  if (stock_qty != null && (!Number.isFinite(Number(stock_qty)) || Number(stock_qty) < -999999 || Number(stock_qty) > 999999)) return res.status(400).json({ error: 'Invalid stock quantity' })
  if (low_stock_at != null && (!Number.isFinite(Number(low_stock_at)) || Number(low_stock_at) < 0 || Number(low_stock_at) > 999999)) return res.status(400).json({ error: 'Invalid low stock threshold' })
  if (barcode && (typeof barcode !== 'string' || barcode.length > 100)) return res.status(400).json({ error: 'Invalid barcode' })
  if (sku && (typeof sku !== 'string' || sku.length > 80)) return res.status(400).json({ error: 'Invalid SKU' })
  if (image_url && (typeof image_url !== 'string' || image_url.length > 500 || (!image_url.startsWith('/product-images/') && !image_url.startsWith('https://')))) return res.status(400).json({ error: 'Invalid image URL' })
  const validUnits = ['pcs','dozen','carton','box','pack','kg','gram','litre','ml','meter','foot','bag','roll']
  if (unit && !validUnits.includes(unit)) return res.status(400).json({ error: 'Invalid unit' })
  // No two active products in a shop may share a barcode (prevents the duplicate /
  // "added 5 times" problem). The DB also enforces this via a unique index.
  // #9 Strong identifiers block duplicates: barcode and SKU (when present). A
  // duplicate NAME alone is allowed — legitimate products can share similar names.
  if (barcode) {
    const [dup]: any = await pool.query('SELECT id, name FROM products WHERE tenant_id=? AND barcode=? AND active=1 LIMIT 1', [tenantId, barcode])
    if (dup.length) return res.status(409).json({ error: `Barcode already used by "${dup[0].name}". Each product needs a unique barcode.` })
  }
  if (sku) {
    const [dupSku]: any = await pool.query('SELECT id, name FROM products WHERE tenant_id=? AND sku=? AND active=1 LIMIT 1', [tenantId, sku])
    if (dupSku.length) return res.status(409).json({ error: `Product code "${sku}" is already used by "${dupSku[0].name}".` })
  }
  // A barcode/SKU that belongs ONLY to a soft-deleted product isn't a real duplicate —
  // revive that row (keeps its id so past sales stay linked) instead of failing on the
  // (tenant, barcode) unique index.
  let reviveId: number | null = null
  if (barcode) { const [d1]: any = await pool.query('SELECT id FROM products WHERE tenant_id=? AND barcode=? AND active=0 LIMIT 1', [tenantId, barcode]); if (d1.length) reviveId = d1[0].id }
  if (reviveId == null && sku) { const [d2]: any = await pool.query('SELECT id FROM products WHERE tenant_id=? AND sku=? AND active=0 LIMIT 1', [tenantId, sku]); if (d2.length) reviveId = d2[0].id }
  let productId: number
  if (reviveId != null) {
    await pool.query(
      'UPDATE products SET active=1, name=?, barcode=?, sku=?, unit=?, pack_unit=?, units_per_pack=?, cost_price=?, sale_price=?, stock_qty=?, low_stock_at=?, category_id=?, image_url=?, is_favorite=? WHERE id=? AND tenant_id=?',
      [name.trim(), barcode||null, sku||null, unit||'pcs', pack_unit||null, units_per_pack||null, cost_price||0, sale_price, stock_qty||0, low_stock_at||5, category_id||null, image_url||null, is_favorite?1:0, reviveId, tenantId])
    productId = reviveId
  } else {
    let result: any
    try {
      [result] = await pool.query(
        'INSERT INTO products (tenant_id, name, barcode, sku, unit, pack_unit, units_per_pack, cost_price, sale_price, stock_qty, low_stock_at, category_id, image_url, is_favorite) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [tenantId, name.trim(), barcode||null, sku||null, unit||'pcs', pack_unit||null, units_per_pack||null, cost_price||0, sale_price, stock_qty||0, low_stock_at||5, category_id||null, image_url||null, is_favorite?1:0]
      )
    } catch (e: any) {
      if (e?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This barcode already exists for another product.' })
      throw e
    }
    productId = result.insertId
  }
  if ((stock_qty||0) > 0) {
    await pool.query('INSERT INTO stock_movements (tenant_id, product_id, type, qty, note) VALUES (?,?,?,?,?)',
      [tenantId, productId, 'purchase', stock_qty||0, 'Initial stock'])
  }
  const [rows]: any = await pool.query('SELECT * FROM products WHERE id=?', [productId])
  res.json(rows[0])
})

r.put('/:id', async (req, res) => {
  const { tenantId } = (req as any).user
  const { name, barcode, sku, unit, pack_unit, units_per_pack, cost_price, sale_price, stock_qty, low_stock_at, category_id, image_url, is_favorite } = req.body
  const [old]: any = await pool.query('SELECT * FROM products WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
  if (!old.length) return res.status(404).json({ error: 'Not found' })
  if (barcode) {
    const [dup]: any = await pool.query('SELECT id, name FROM products WHERE tenant_id=? AND barcode=? AND active=1 AND id<>? LIMIT 1', [tenantId, barcode, req.params.id])
    if (dup.length) return res.status(409).json({ error: `Barcode already used by "${dup[0].name}". Each product needs a unique barcode.` })
  }
  try {
    await pool.query(
      'UPDATE products SET name=?,barcode=?,sku=?,unit=?,pack_unit=?,units_per_pack=?,cost_price=?,sale_price=?,stock_qty=?,low_stock_at=?,category_id=?,image_url=?,is_favorite=? WHERE id=? AND tenant_id=?',
      [name, barcode||null, sku||null, unit||'pcs', pack_unit||null, units_per_pack||null, cost_price||0, sale_price, stock_qty, low_stock_at||5, category_id||null, image_url||null, is_favorite?1:0, req.params.id, tenantId]
    )
  } catch (e: any) {
    if (e?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This barcode already exists for another product.' })
    throw e
  }
  if (stock_qty !== undefined && stock_qty !== old[0].stock_qty) {
    const diff = stock_qty - old[0].stock_qty
    await pool.query('INSERT INTO stock_movements (tenant_id, product_id, type, qty, note) VALUES (?,?,?,?,?)',
      [tenantId, req.params.id, 'adjustment', diff, 'Manual adjustment'])
  }
  res.json({ ok: true })
})

// Toggle favorite
r.patch('/:id/favorite', async (req, res) => {
  const { tenantId } = (req as any).user
  await pool.query('UPDATE products SET is_favorite = NOT is_favorite WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
  res.json({ ok: true })
})

r.delete('/:id', async (req, res) => {
  const { tenantId, id: userId } = (req as any).user
  const [rows]: any = await pool.query('SELECT * FROM products WHERE id=? AND tenant_id=? AND active=1', [req.params.id, tenantId])
  if (rows.length) await toRecycle(pool, tenantId, 'product', rows[0].id, rows[0].name, { product: rows[0] }, userId)
  await pool.query('UPDATE products SET active=0 WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
  res.json({ ok: true })
})

// Bulk import via JSON array
r.post('/bulk-import', async (req, res) => {
  const { tenantId } = (req as any).user
  const items: any[] = req.body.products || []
  if (!items.length) return res.status(400).json({ error: 'No products provided' })
  if (items.length > 2000) return res.status(400).json({ error: 'Max 2000 products per import' })
  // #9 Report a useful breakdown and avoid creating duplicate inventory. Products
  // are matched by strong identifiers (barcode/SKU) — in-file AND against existing
  // active products. Duplicates are SKIPPED (never auto-updated or auto-deleted).
  let created = 0, skipped = 0, duplicates = 0
  const errors: string[] = []
  const seenBarcodes = new Set<string>(), seenSkus = new Set<string>()
  let rowNo = 0
  for (const p of items.slice(0, 2000)) {
    rowNo++
    if (!p.name || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 150) { skipped++; errors.push(`Row ${rowNo}: invalid name`); continue }
    const salePrice = Number(p.sale_price)
    if (p.sale_price === '' || p.sale_price == null || !Number.isFinite(salePrice) || salePrice < 0 || salePrice > 10000000) { skipped++; errors.push(`Row ${rowNo}: missing or invalid price`); continue }
    if (p.stock_qty != null && p.stock_qty !== '' && (!Number.isFinite(Number(p.stock_qty)) || Number(p.stock_qty) < 0 || Number(p.stock_qty) > 999999)) { skipped++; errors.push(`Row ${rowNo}: invalid stock`); continue }
    const stockQty = Number(p.stock_qty) || 0
    const barcode = p.barcode ? String(p.barcode) : null
    const sku = p.sku ? String(p.sku) : null
    // In-file duplicate by barcode/SKU
    if (barcode && seenBarcodes.has(barcode)) { duplicates++; continue }
    if (sku && seenSkus.has(sku)) { duplicates++; continue }
    // Duplicate ONLY against CURRENTLY ACTIVE products (deleted products don't count).
    let activeDup = false
    if (barcode) { const [e1]: any = await pool.query('SELECT id FROM products WHERE tenant_id=? AND barcode=? AND active=1 LIMIT 1', [tenantId, barcode]); if (e1.length) activeDup = true }
    if (!activeDup && sku) { const [e2]: any = await pool.query('SELECT id FROM products WHERE tenant_id=? AND sku=? AND active=1 LIMIT 1', [tenantId, sku]); if (e2.length) activeDup = true }
    if (activeDup) { duplicates++; if (barcode) seenBarcodes.add(barcode); if (sku) seenSkus.add(sku); continue }
    // A barcode/SKU that belongs ONLY to a soft-deleted product is NOT a duplicate.
    // Revive that row (keeps its id so past sales stay linked) instead of inserting a
    // second row that would collide with the (tenant, barcode) unique index.
    let reviveId: number | null = null
    if (barcode) { const [d1]: any = await pool.query('SELECT id FROM products WHERE tenant_id=? AND barcode=? AND active=0 LIMIT 1', [tenantId, barcode]); if (d1.length) reviveId = d1[0].id }
    if (reviveId == null && sku) { const [d2]: any = await pool.query('SELECT id FROM products WHERE tenant_id=? AND sku=? AND active=0 LIMIT 1', [tenantId, sku]); if (d2.length) reviveId = d2[0].id }
    try {
      let productId: number
      if (reviveId != null) {
        await pool.query('UPDATE products SET active=1, name=?, barcode=?, sku=?, unit=?, cost_price=?, sale_price=?, stock_qty=?, low_stock_at=? WHERE id=? AND tenant_id=?',
          [p.name, barcode, sku, p.unit||'pcs', p.cost_price||0, salePrice, stockQty, p.low_stock_at||5, reviveId, tenantId])
        productId = reviveId
      } else {
        const [result]: any = await pool.query(
          'INSERT INTO products (tenant_id, name, barcode, sku, unit, cost_price, sale_price, stock_qty, low_stock_at) VALUES (?,?,?,?,?,?,?,?,?)',
          [tenantId, p.name, barcode, sku, p.unit||'pcs', p.cost_price||0, salePrice, stockQty, p.low_stock_at||5]
        )
        productId = result.insertId
      }
      if (stockQty > 0) {
        await pool.query('INSERT INTO stock_movements (tenant_id, product_id, type, qty, note) VALUES (?,?,?,?,?)',
          [tenantId, productId, 'purchase', stockQty, reviveId != null ? 'Bulk import (revived)' : 'Bulk import'])
      }
      if (barcode) seenBarcodes.add(barcode)
      if (sku) seenSkus.add(sku)
      created++
    } catch (e: any) {
      if (e?.code === 'ER_DUP_ENTRY') { duplicates++ } else { skipped++; errors.push(`Row ${rowNo}: ${e.message}`) }
    }
  }
  // `inserted`/`imported` kept as aliases for backward-compatible callers.
  res.json({ ok: true, created, updated: 0, duplicates, skipped, errors: errors.slice(0, 50), inserted: created, imported: created })
})

// ---------- #11 Keyset-paginated sync (stable, batched) for PWA/offline ----------
// Returns active products with id > after_id, ordered by id ASC, up to `limit`.
// The client loops (passing the last id back as after_id) until it receives fewer
// than `limit` rows — so the FULL catalogue reaches IndexedDB without ever loading
// it all in one response. Inactive/deleted products are excluded, so a full resync
// naturally drops them from the offline cache.
r.get('/sync', async (req, res) => {
  const { tenantId } = (req as any).user
  const afterId = Math.max(0, Number((req.query as any).after_id) || 0)
  const batch = Math.min(Math.max(Number((req.query as any).limit) || 1000, 1), 2000)
  const [rows]: any = await pool.query(
    `SELECT p.*, c.name as categoryName FROM products p LEFT JOIN categories c ON c.id=p.category_id
       WHERE p.tenant_id=? AND p.active=1 AND p.id > ? ORDER BY p.id ASC LIMIT ${batch}`,
    [tenantId, afterId])
  const nextAfterId = rows.length === batch ? rows[rows.length - 1].id : null
  res.json({ products: rows, nextAfterId, batch })
})

// ---------- #2 Bulk soft-delete (recycle-aware, tenant-scoped) ----------
r.post('/bulk-delete', async (req, res) => {
  const { tenantId, id: userId } = (req as any).user
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((n: any) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0) : []
  if (!ids.length) return res.status(400).json({ error: 'No products selected' })
  if (ids.length > 2000) return res.status(400).json({ error: 'Too many products in one delete' })
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows]: any = await conn.query(
      `SELECT * FROM products WHERE tenant_id=? AND active=1 AND id IN (${ids.map(() => '?').join(',')})`,
      [tenantId, ...ids])
    for (const p of rows) await toRecycle(conn, tenantId, 'product', p.id, p.name, { product: p }, userId)
    let deleted = 0
    if (rows.length) {
      const rIds = rows.map((p: any) => p.id)
      const [upd]: any = await conn.query(
        `UPDATE products SET active=0 WHERE tenant_id=? AND id IN (${rIds.map(() => '?').join(',')})`,
        [tenantId, ...rIds])
      deleted = upd.affectedRows
    }
    await conn.commit()
    res.json({ ok: true, deleted })
  } catch (e: any) { await conn.rollback(); res.status(500).json({ error: e.message }) }
  finally { conn.release() }
})

// ---------- #10 Export products to CSV (id, barcode, sku, name, current + blank new stock) ----------
function csvCell(v: any) { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
r.get('/export', async (req, res) => {
  const { tenantId } = (req as any).user
  const [rows]: any = await pool.query(
    'SELECT id, barcode, sku, name, stock_qty FROM products WHERE tenant_id=? AND active=1 ORDER BY name', [tenantId])
  const header = 'product_id,barcode,sku,name,current_stock,new_stock'
  const body = rows.map((p: any) => [p.id, p.barcode, p.sku, p.name, p.stock_qty, ''].map(csvCell).join(',')).join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.csv"`)
  res.send(header + '\n' + body)
})

// ---------- #10 Stock-only import: updates STOCK, never other product fields ----------
r.post('/stock-import', async (req, res) => {
  const { tenantId, id: userId } = (req as any).user
  const rows: any[] = Array.isArray(req.body?.rows) ? req.body.rows : []
  if (!rows.length) return res.status(400).json({ error: 'No rows provided' })
  if (rows.length > 10000) return res.status(400).json({ error: 'Max 10000 rows per import' })
  let processed = 0, updated = 0, skipped = 0
  const errors: string[] = []
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    for (const row of rows) {
      processed++
      const newStock = Number(row.new_stock)
      if (!Number.isFinite(newStock) || newStock < 0 || newStock > 999999) { skipped++; errors.push(`Row ${processed}: invalid new stock`); continue }
      // Match by stable identifiers only: id → barcode → sku (all tenant-scoped).
      let prod: any = null
      if (row.product_id || row.id) {
        const [m]: any = await conn.query('SELECT id, stock_qty FROM products WHERE tenant_id=? AND id=? AND active=1', [tenantId, Number(row.product_id || row.id)])
        prod = m[0]
      }
      if (!prod && row.barcode) {
        const [m]: any = await conn.query('SELECT id, stock_qty FROM products WHERE tenant_id=? AND barcode=? AND active=1', [tenantId, String(row.barcode)])
        prod = m[0]
      }
      if (!prod && row.sku) {
        const [m]: any = await conn.query('SELECT id, stock_qty FROM products WHERE tenant_id=? AND sku=? AND active=1', [tenantId, String(row.sku)])
        prod = m[0]
      }
      if (!prod) { skipped++; errors.push(`Row ${processed}: no matching product`); continue }
      const diff = Math.round((newStock - Number(prod.stock_qty)) * 100) / 100
      if (diff !== 0) {
        await conn.query('UPDATE products SET stock_qty=? WHERE id=? AND tenant_id=?', [newStock, prod.id, tenantId])
        await conn.query('INSERT INTO stock_movements (tenant_id, product_id, user_id, type, qty, note) VALUES (?,?,?,?,?,?)',
          [tenantId, prod.id, userId, 'adjustment', diff, 'Stock import'])
      }
      updated++
    }
    await conn.commit()
    res.json({ ok: true, processed, updated, skipped, errors: errors.slice(0, 50) })
  } catch (e: any) { await conn.rollback(); res.status(500).json({ error: e.message }) }
  finally { conn.release() }
})

// ---------- #14 Quick stock update for one product (scan → set → next) ----------
r.post('/:id/adjust-stock', async (req, res) => {
  const { tenantId, id: userId } = (req as any).user
  const newStock = Number(req.body?.new_stock)
  const reason = ['count', 'purchase', 'correction', 'damage', 'other'].includes(req.body?.reason) ? req.body.reason : 'correction'
  if (!Number.isFinite(newStock) || newStock < 0 || newStock > 999999) return res.status(400).json({ error: 'Invalid stock quantity' })
  const [rows]: any = await pool.query('SELECT stock_qty FROM products WHERE id=? AND tenant_id=? AND active=1', [req.params.id, tenantId])
  if (!rows.length) return res.status(404).json({ error: 'Product not found' })
  const prev = Number(rows[0].stock_qty)
  const diff = Math.round((newStock - prev) * 100) / 100
  await pool.query('UPDATE products SET stock_qty=? WHERE id=? AND tenant_id=?', [newStock, req.params.id, tenantId])
  if (diff !== 0) {
    await pool.query('INSERT INTO stock_movements (tenant_id, product_id, user_id, type, qty, note) VALUES (?,?,?,?,?,?)',
      [tenantId, req.params.id, userId, 'adjustment', diff, `Quick stock: ${reason}`])
  }
  res.json({ ok: true, previous: prev, new_stock: newStock, difference: diff })
})

// ---------- Quick price update (sale + optional cost only; nothing else touched) ----------
r.post('/:id/price', async (req, res) => {
  const { tenantId } = (req as any).user
  const sale = Number(req.body?.sale_price)
  if (!Number.isFinite(sale) || sale < 0 || sale > 10000000) return res.status(400).json({ error: 'Invalid sale price' })
  const costRaw = req.body?.cost_price
  const hasCost = costRaw !== undefined && costRaw !== null && costRaw !== ''
  if (hasCost && (!Number.isFinite(Number(costRaw)) || Number(costRaw) < 0 || Number(costRaw) > 10000000)) return res.status(400).json({ error: 'Invalid cost price' })
  const [rows]: any = await pool.query('SELECT id FROM products WHERE id=? AND tenant_id=? AND active=1', [req.params.id, tenantId])
  if (!rows.length) return res.status(404).json({ error: 'Product not found' })
  if (hasCost) await pool.query('UPDATE products SET sale_price=?, cost_price=? WHERE id=? AND tenant_id=?', [sale, Number(costRaw), req.params.id, tenantId])
  else await pool.query('UPDATE products SET sale_price=? WHERE id=? AND tenant_id=?', [sale, req.params.id, tenantId])
  res.json({ ok: true, sale_price: sale, cost_price: hasCost ? Number(costRaw) : undefined })
})

// Categories
r.get('/categories/all', async (req, res) => {
  const { tenantId } = (req as any).user
  const [rows]: any = await pool.query('SELECT * FROM categories WHERE tenant_id=? ORDER BY name', [tenantId])
  res.json(rows)
})

r.post('/categories', async (req, res) => {
  const { tenantId } = (req as any).user
  const { name, color, icon } = req.body
  const [result]: any = await pool.query('INSERT INTO categories (tenant_id, name, color, icon) VALUES (?,?,?,?)', [tenantId, name, color||'#6366f1', icon||'📦'])
  res.json({ id: result.insertId, name, color, icon })
})

export default r
