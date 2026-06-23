import { Router } from 'express'
import { pool } from '../db'
import { auth } from '../auth'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

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
  const [result]: any = await pool.query(
    'INSERT INTO products (tenant_id, name, barcode, sku, unit, pack_unit, units_per_pack, cost_price, sale_price, stock_qty, low_stock_at, category_id, image_url, is_favorite) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [tenantId, name.trim(), barcode||null, sku||null, unit||'pcs', pack_unit||null, units_per_pack||null, cost_price||0, sale_price, stock_qty||0, low_stock_at||5, category_id||null, image_url||null, is_favorite?1:0]
  )
  if ((stock_qty||0) > 0) {
    await pool.query('INSERT INTO stock_movements (tenant_id, product_id, type, qty, note) VALUES (?,?,?,?,?)',
      [tenantId, result.insertId, 'purchase', stock_qty||0, 'Initial stock'])
  }
  const [rows]: any = await pool.query('SELECT * FROM products WHERE id=?', [result.insertId])
  res.json(rows[0])
})

r.put('/:id', async (req, res) => {
  const { tenantId } = (req as any).user
  const { name, barcode, sku, unit, pack_unit, units_per_pack, cost_price, sale_price, stock_qty, low_stock_at, category_id, image_url, is_favorite } = req.body
  const [old]: any = await pool.query('SELECT * FROM products WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
  if (!old.length) return res.status(404).json({ error: 'Not found' })
  await pool.query(
    'UPDATE products SET name=?,barcode=?,sku=?,unit=?,pack_unit=?,units_per_pack=?,cost_price=?,sale_price=?,stock_qty=?,low_stock_at=?,category_id=?,image_url=?,is_favorite=? WHERE id=? AND tenant_id=?',
    [name, barcode||null, sku||null, unit||'pcs', pack_unit||null, units_per_pack||null, cost_price||0, sale_price, stock_qty, low_stock_at||5, category_id||null, image_url||null, is_favorite?1:0, req.params.id, tenantId]
  )
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
  const { tenantId } = (req as any).user
  await pool.query('UPDATE products SET active=0 WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
  res.json({ ok: true })
})

// Bulk import via JSON array
r.post('/bulk-import', async (req, res) => {
  const { tenantId } = (req as any).user
  const items: any[] = req.body.products || []
  if (!items.length) return res.status(400).json({ error: 'No products provided' })
  if (items.length > 500) return res.status(400).json({ error: 'Max 500 products per import' })
  let inserted = 0, skipped = 0
  for (const p of items.slice(0, 500)) {
    if (!p.name || typeof p.name !== 'string' || !p.name.trim()) { skipped++; continue }
    if (p.name.length > 150) { skipped++; continue }
    if (p.sale_price == null || !Number.isFinite(Number(p.sale_price)) || Number(p.sale_price) < 0 || Number(p.sale_price) > 10000000) { skipped++; continue }
    if (p.stock_qty != null && (!Number.isFinite(Number(p.stock_qty)) || Number(p.stock_qty) < 0 || Number(p.stock_qty) > 999999)) { skipped++; continue }
    try {
      const [result]: any = await pool.query(
        'INSERT INTO products (tenant_id, name, barcode, sku, unit, cost_price, sale_price, stock_qty, low_stock_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [tenantId, p.name, p.barcode||null, p.sku||null, p.unit||'pcs', p.cost_price||0, p.sale_price, p.stock_qty||0, p.low_stock_at||5]
      )
      if ((p.stock_qty||0) > 0) {
        await pool.query('INSERT INTO stock_movements (tenant_id, product_id, type, qty, note) VALUES (?,?,?,?,?)',
          [tenantId, result.insertId, 'purchase', p.stock_qty, 'Bulk import'])
      }
      inserted++
    } catch { skipped++ }
  }
  res.json({ ok: true, inserted, skipped })
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
