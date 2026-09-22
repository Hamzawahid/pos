import { Router } from 'express'
import { pool } from '../db'
import { auth, requireRole } from '../auth'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

const r = Router()
r.use(auth)

// #4 Business logo upload — reuses the product-images directory + nginx route so
// no new storage/serving config is needed. 1MB cap, image types only.
const uploadDir = process.env.UPLOAD_DIR || '/root/retailpos-prod-uploads'
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `logo-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /image\/(jpeg|jpg|png|webp)/.test(file.mimetype)),
})

export const DEFAULT_SETTINGS = {
  shopName: '',
  phone: '',
  address: '',
  footer: 'Thank you for your business!',
  printFormat: 'thermal',      // 'thermal' | 'a4' | 'a5'
  paperWidth: 80,              // thermal mm (58 or 80)
  showName: true,
  showQty: true,
  showRate: true,
  showTotal: true,
  showCustomer: true,
  requireCustomer: false,
  showCashier: true,
  currency: 'PKR',
  taxPercent: 0,
  language: 'en',
  trackStock: true,            // inventory tracking on/off (stock fields + low-stock alerts)
  logoUrl: '',                 // #4 business logo (uploaded file URL) shown on receipts
  showLogo: true,              // toggle logo on printed receipts
}

r.get('/', async (req, res) => {
  const { tenantId } = (req as any).user
  const [rows]: any = await pool.query('SELECT data FROM tenant_settings WHERE tenant_id=?', [tenantId])
  const [t]: any = await pool.query('SELECT name FROM tenants WHERE id=?', [tenantId])
  let data: any = {}
  if (rows.length) {
    try { data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data } catch { data = {} }
  }
  const merged = { ...DEFAULT_SETTINGS, shopName: t[0]?.name || 'RetailPOS', ...data }
  res.json(merged)
})

r.put('/', requireRole('owner', 'manager'), async (req, res) => {
  const { tenantId } = (req as any).user
  const incoming = req.body || {}
  // whitelist only known keys
  const clean: any = { ...DEFAULT_SETTINGS }
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (incoming[k] !== undefined) clean[k] = incoming[k]
  }
  await pool.query(
    'INSERT INTO tenant_settings (tenant_id, data) VALUES (?,?) ON DUPLICATE KEY UPDATE data=VALUES(data)',
    [tenantId, JSON.stringify(clean)]
  )
  res.json(clean)
})

// POST /settings/logo — upload a business logo, persist its URL into settings.
r.post('/logo', requireRole('owner', 'manager'), logoUpload.single('logo'), async (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'Please choose a PNG/JPG/WebP image up to 1MB.' })
  const { tenantId } = req.user
  const logoUrl = `/product-images/${req.file.filename}`
  const [rows]: any = await pool.query('SELECT data FROM tenant_settings WHERE tenant_id=?', [tenantId])
  let data: any = {}
  if (rows.length) { try { data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data } catch { data = {} } }
  data.logoUrl = logoUrl
  await pool.query('INSERT INTO tenant_settings (tenant_id, data) VALUES (?,?) ON DUPLICATE KEY UPDATE data=VALUES(data)', [tenantId, JSON.stringify(data)])
  res.json({ ok: true, logoUrl })
})

export default r
