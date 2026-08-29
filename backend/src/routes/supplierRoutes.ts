import { Router } from 'express'
import { pool } from '../db'
import { auth } from '../auth'

// Simplified payables: suppliers + balance, bill (credit) and payment (deposit).
// No public links, no PIN, no pending/confirm flow — every entry applies immediately.
// Plus an OCR endpoint that reads an invoice photo and extracts supplier + amount.
const r = Router()
r.use(auth)

// List suppliers with current balance
r.get('/', async (req, res) => {
  const { tenantId } = (req as any).user
  const { search } = req.query as any
  let q = 'SELECT * FROM suppliers WHERE tenant_id=?'
  const params: any[] = [tenantId]
  if (search) { q += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  q += ' ORDER BY name LIMIT 200'
  const [rows]: any = await pool.query(q, params)
  res.json(rows)
})

// Create (opening_balance = amount you already owe them)
r.post('/', async (req, res) => {
  const { tenantId, id: userId } = (req as any).user
  const { name, phone, address, notes, opening_balance } = req.body
  if (!name) return res.status(400).json({ error: 'Name required' })
  const ob = Number(opening_balance) || 0
  const [result]: any = await pool.query(
    'INSERT INTO suppliers (tenant_id, name, phone, address, notes, payable_balance, created_by) VALUES (?,?,?,?,?,?,?)',
    [tenantId, name, phone || null, address || null, notes || null, ob, userId || null])
  if (ob > 0) {
    await pool.query("INSERT INTO supplier_ledger (tenant_id, supplier_id, type, amount, balance_after, status, note) VALUES (?,?,?,?,?,'confirmed',?)",
      [tenantId, result.insertId, 'adjustment', ob, ob, 'Opening balance'])
  }
  res.json({ id: result.insertId, name, phone, address, payable_balance: ob })
})

// Update supplier details
r.put('/:id', async (req, res) => {
  const { tenantId } = (req as any).user
  const { name, phone, address, notes } = req.body
  await pool.query('UPDATE suppliers SET name=?,phone=?,address=?,notes=? WHERE id=? AND tenant_id=?',
    [name, phone || null, address || null, notes || null, req.params.id, tenantId])
  res.json({ ok: true })
})

// Ledger
r.get('/:id/ledger', async (req, res) => {
  const { tenantId } = (req as any).user
  const [supplier]: any = await pool.query('SELECT * FROM suppliers WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
  if (!supplier.length) return res.status(404).json({ error: 'Not found' })
  const [ledger]: any = await pool.query('SELECT * FROM supplier_ledger WHERE supplier_id=? AND tenant_id=? ORDER BY created_at DESC, id DESC LIMIT 200', [req.params.id, tenantId])
  res.json({ supplier: supplier[0], ledger })
})

// Bill / credit — you owe more (applies immediately)
r.post('/:id/bill', async (req, res) => {
  const { tenantId } = (req as any).user
  const amt = Number(req.body.amount)
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Invalid amount' })
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows]: any = await conn.query('SELECT payable_balance FROM suppliers WHERE id=? AND tenant_id=? FOR UPDATE', [req.params.id, tenantId])
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Not found' }) }
    const newBalance = Number(rows[0].payable_balance || 0) + amt
    await conn.query('UPDATE suppliers SET payable_balance=? WHERE id=?', [newBalance, req.params.id])
    await conn.query("INSERT INTO supplier_ledger (tenant_id, supplier_id, type, amount, balance_after, status, note) VALUES (?,?,?,?,?,'confirmed',?)",
      [tenantId, req.params.id, 'bill', amt, newBalance, req.body.note || 'Bill / purchase'])
    await conn.commit()
    res.json({ ok: true, newBalance })
  } catch (e: any) { await conn.rollback(); res.status(500).json({ error: e.message }) }
  finally { conn.release() }
})

// Payment / deposit — you paid them (applies immediately)
r.post('/:id/payment', async (req, res) => {
  const { tenantId } = (req as any).user
  const amt = Number(req.body.amount)
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Invalid amount' })
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows]: any = await conn.query('SELECT payable_balance FROM suppliers WHERE id=? AND tenant_id=? FOR UPDATE', [req.params.id, tenantId])
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Not found' }) }
    const newBalance = Number(rows[0].payable_balance || 0) - amt
    await conn.query('UPDATE suppliers SET payable_balance=? WHERE id=?', [newBalance, req.params.id])
    await conn.query("INSERT INTO supplier_ledger (tenant_id, supplier_id, type, amount, balance_after, status, note) VALUES (?,?,?,?,?,'confirmed',?)",
      [tenantId, req.params.id, 'payment', -amt, newBalance, req.body.note || 'Payment made'])
    await conn.commit()
    res.json({ ok: true, newBalance })
  } catch (e: any) { await conn.rollback(); res.status(500).json({ error: e.message }) }
  finally { conn.release() }
})

// OCR invoice scan — reads a photo of a supplier invoice and extracts fields.
// Uses Claude vision. Requires ANTHROPIC_API_KEY in the environment; if absent
// returns 503 so the frontend can tell the user OCR isn't configured yet.
r.post('/ocr', async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return res.status(503).json({ error: 'Invoice scanning is not configured on this server (missing ANTHROPIC_API_KEY).' })
  let { image, mime } = req.body || {}
  if (!image || typeof image !== 'string') return res.status(400).json({ error: 'No image provided' })
  // Accept a data URL or a bare base64 string.
  const m = image.match(/^data:([^;]+);base64,(.*)$/)
  if (m) { mime = m[1]; image = m[2] }
  mime = mime || 'image/jpeg'
  if (!/^image\/(jpeg|png|webp|gif)$/.test(mime)) return res.status(400).json({ error: 'Unsupported image type' })
  try {
    const Anthropic = require('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: key })
    const msg = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: image } },
          { type: 'text', text:
            'This is a photo of a supplier invoice or purchase bill. Extract the details and reply with ONLY a JSON object, no prose, in this exact shape:\n' +
            '{"supplier_name": string|null, "invoice_number": string|null, "invoice_date": string|null, "total_amount": number|null, "line_items": [{"description": string, "qty": number|null, "amount": number|null}]}\n' +
            'total_amount is the grand total (the amount payable) as a plain number with no currency symbol or commas. If a field is not visible, use null. Keep line_items to the main purchased items (max 20).' }
        ]
      }]
    })
    const text = (msg.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return res.status(422).json({ error: 'Could not read the invoice. Try a clearer photo.' })
    let parsed: any
    try { parsed = JSON.parse(jsonMatch[0]) } catch { return res.status(422).json({ error: 'Could not read the invoice. Try a clearer photo.' }) }
    res.json({ ok: true, data: parsed })
  } catch (e: any) {
    res.status(502).json({ error: 'Invoice scan failed: ' + (e?.message || 'unknown error') })
  }
})

// Delete (block if you still owe them)
r.delete('/:id', async (req, res) => {
  const { tenantId } = (req as any).user
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows]: any = await conn.query('SELECT payable_balance FROM suppliers WHERE id=? AND tenant_id=? FOR UPDATE', [req.params.id, tenantId])
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Not found' }) }
    if (Number(rows[0].payable_balance || 0) > 0) { await conn.rollback(); return res.status(400).json({ error: 'Cannot delete a supplier you still owe. Clear the balance first.' }) }
    await conn.query('DELETE FROM supplier_ledger WHERE supplier_id=? AND tenant_id=?', [req.params.id, tenantId])
    await conn.query('DELETE FROM suppliers WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
    await conn.commit()
    res.json({ ok: true })
  } catch (e: any) { await conn.rollback(); res.status(500).json({ error: e.message }) }
  finally { conn.release() }
})

export default r
