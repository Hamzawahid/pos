import { Router } from 'express'
import { pool } from '../db'
import { auth } from '../auth'

const r = Router()
r.use(auth)

const RETAIN_DAYS = 30

// Capture a record (and any children) into the recycle bin BEFORE it is deleted.
// Called from the delete handlers of products / expenses / customers / sales.
export async function toRecycle(conn: any, tenantId: number, entityType: string,
  entityId: number | string, label: string, snapshot: any, deletedBy?: number | null) {
  await conn.query(
    'INSERT INTO recycle_bin (tenant_id, entity_type, entity_id, label, snapshot, deleted_by) VALUES (?,?,?,?,?,?)',
    [tenantId, entityType, entityId, String(label || '').slice(0, 255), JSON.stringify(snapshot), deletedBy ?? null]
  )
}

function parseSnap(s: any) { return typeof s === 'string' ? JSON.parse(s) : s }

// Re-insert a plain row object, preserving its original id and columns.
async function reinsert(conn: any, table: string, row: any) {
  if (!row) return
  const cols = Object.keys(row)
  const sql = `INSERT IGNORE INTO \`${table}\` (${cols.map(c => '`' + c + '`').join(',')}) VALUES (${cols.map(() => '?').join(',')})`
  await conn.query(sql, cols.map(c => row[c]))
}

// GET / — list recycle-bin entries (purges anything past the retention window first).
r.get('/', async (req, res) => {
  const { tenantId } = (req as any).user
  await pool.query('DELETE FROM recycle_bin WHERE tenant_id=? AND deleted_at < (NOW() - INTERVAL ? DAY)', [tenantId, RETAIN_DAYS])
  const [rows]: any = await pool.query(
    `SELECT rb.id, rb.entity_type, rb.entity_id, rb.label, rb.deleted_at, u.name AS deletedByName
     FROM recycle_bin rb LEFT JOIN users u ON u.id=rb.deleted_by
     WHERE rb.tenant_id=? ORDER BY rb.deleted_at DESC LIMIT 500`, [tenantId])
  res.json({ retainDays: RETAIN_DAYS, items: rows })
})

// POST /:id/restore — put the record back.
r.post('/:id/restore', async (req, res) => {
  const { tenantId } = (req as any).user
  const [rbRows]: any = await pool.query('SELECT * FROM recycle_bin WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
  if (!rbRows.length) return res.status(404).json({ error: 'Not found in recycle bin' })
  const rb = rbRows[0]
  const snap = parseSnap(rb.snapshot)
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    switch (rb.entity_type) {
      case 'product':
        // Products are soft-deleted (active=0) — just reactivate.
        await conn.query('UPDATE products SET active=1 WHERE id=? AND tenant_id=?', [rb.entity_id, tenantId])
        break
      case 'expense':
        await reinsert(conn, 'expenses', snap.expense)
        break
      case 'customer':
        await reinsert(conn, 'customers', snap.customer)
        for (const l of (snap.ledger || [])) await reinsert(conn, 'customer_ledger', l)
        break
      case 'sale':
        // Mirror-inverse of delete: delete removed sale + items + ledger and did
        // NOT touch stock, so restore re-inserts the same rows and leaves stock as-is.
        await reinsert(conn, 'sales', snap.sale)
        for (const it of (snap.items || [])) await reinsert(conn, 'sale_items', it)
        for (const l of (snap.ledger || [])) await reinsert(conn, 'customer_ledger', l)
        break
      default:
        await conn.rollback(); conn.release()
        return res.status(400).json({ error: 'Unknown record type' })
    }
    await conn.query('DELETE FROM recycle_bin WHERE id=? AND tenant_id=?', [rb.id, tenantId])
    await conn.commit()
    res.json({ ok: true })
  } catch (e: any) {
    await conn.rollback()
    res.status(500).json({ error: e.message })
  } finally { conn.release() }
})

// DELETE /:id — permanently remove from the bin (and hard-delete the product row,
// which was only soft-deleted). For other types the underlying row is already gone.
r.delete('/:id', async (req, res) => {
  const { tenantId } = (req as any).user
  const [rbRows]: any = await pool.query('SELECT * FROM recycle_bin WHERE id=? AND tenant_id=?', [req.params.id, tenantId])
  if (!rbRows.length) return res.status(404).json({ error: 'Not found' })
  const rb = rbRows[0]
  if (rb.entity_type === 'product') {
    await pool.query('DELETE FROM products WHERE id=? AND tenant_id=? AND active=0', [rb.entity_id, tenantId])
  }
  await pool.query('DELETE FROM recycle_bin WHERE id=? AND tenant_id=?', [rb.id, tenantId])
  res.json({ ok: true })
})

export default r
