import { Router } from 'express'
import { pool } from '../db'
import { auth, requireRole } from '../auth'

const r = Router()
r.use(auth)

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

export default r
