import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { auth } from '../auth'

const router = Router()

const uploadDir = path.join(__dirname, '../../public/receipts')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, _file, cb) => {
    cb(null, `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`)
  }
})
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } })

router.post('/upload', auth, upload.single('pdf'), (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return }
  const url = `https://${req.get('host')}/receipts/${req.file.filename}`
  res.json({ url })
})

export default router
