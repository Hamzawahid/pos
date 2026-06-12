import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'retailpos_jwt_secret_axion_2024'

export function signToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' })
}

export function auth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET) as any
    ;(req as any).user = decoded
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user
    if (!roles.includes(user?.role)) return res.status(403).json({ error: 'Forbidden' })
    next()
  }
}
