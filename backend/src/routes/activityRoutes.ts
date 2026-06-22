import { Router } from 'express'
import { pool } from '../db'
import { auth } from '../auth'

const r = Router()
r.use(auth)

// Heartbeat: the POS app pings this every ~60s while it's open and focused.
// We accumulate active time per user per day. Each ping adds the gap since the
// previous ping — but only when that gap is short (<= MAX_GAP), so time spent
// with the app closed/idle is never counted as "active usage".
const MAX_GAP = 120 // seconds (~2x the client heartbeat interval)

r.post('/ping', async (req, res) => {
  const { tenantId, id: userId } = (req as any).user
  if (!tenantId || !userId) return res.status(401).json({ error: 'Unauthorized' })
  try {
    await pool.query(
      `INSERT INTO user_activity (tenant_id, user_id, activity_date, active_seconds, first_seen, last_seen, ping_count)
       VALUES (?, ?, CURDATE(), 0, NOW(), NOW(), 1)
       ON DUPLICATE KEY UPDATE
         active_seconds = active_seconds +
           IF(TIMESTAMPDIFF(SECOND, last_seen, NOW()) <= ?, TIMESTAMPDIFF(SECOND, last_seen, NOW()), 0),
         last_seen = NOW(),
         ping_count = ping_count + 1`,
      [tenantId, userId, MAX_GAP]
    )
    res.json({ ok: true })
  } catch (e: any) {
    // Never let a tracking failure disrupt the POS — fail quietly.
    res.json({ ok: false })
  }
})

export default r
