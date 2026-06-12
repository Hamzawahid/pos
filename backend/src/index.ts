import express from 'express'
import rateLimit from 'express-rate-limit'
import Redis from 'ioredis'
import cors from 'cors'
import authRoutes from './routes/authRoutes'
import productRoutes from './routes/productRoutes'
import salesRoutes from './routes/salesRoutes'
import customerRoutes from './routes/customerRoutes'
import reportRoutes from './routes/reportRoutes'
import userRoutes from './routes/userRoutes'
import settingsRoutes from './routes/settingsRoutes'
import superAdminRoutes from './routes/superAdminRoutes'
import expenseRoutes from './routes/expenseRoutes'

// ── Redis client (cache for /auth/me) ─────────────────────────────────────────
export const redis = new Redis({ host: '127.0.0.1', port: 6379, lazyConnect: true })
redis.on('error', (e) => console.warn('[redis] connection error:', e.message))

// ── Rate limiters ─────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute window
  max: 300,                   // 300 requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minute window
  max: 20,                    // 20 login attempts per IP per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
})

const app = express()
app.use(cors({ origin: '*' }))
app.use(express.json({ limit: '10mb' }))

app.use('/auth', authRoutes)
app.use('/products', productRoutes)
app.use('/sales', salesRoutes)
app.use('/customers', customerRoutes)
app.use('/reports', reportRoutes)
app.use('/users', userRoutes)
app.use('/settings', settingsRoutes)
app.use('/superadmin', superAdminRoutes)
app.use('/expenses', expenseRoutes)
app.use('/product-images', require('express').static(process.env.UPLOAD_DIR || '/root/retailpos-prod-uploads'))

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'RetailPOS', version: '1.0.0' }))

const PORT = Number(process.env.PORT) || 8085
app.listen(PORT, () => console.log(`RetailPOS backend running on :${PORT}`))
