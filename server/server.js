import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import spotsRouter from './src/routes/spots.js'
import authRouter from './src/routes/auth.js'
import usersRouter from './src/routes/users.js'
import collectionsRouter from './src/routes/collections.js'
import adminRouter from './src/routes/admin.js'
import reportsRouter from './src/routes/reports.js'
import { errorHandler } from './src/middleware/errorHandler.js'

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET']
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key])
if (missingEnv.length > 0) {
  console.error(`KĻŪDA: Trūkst obligāto vides mainīgo: ${missingEnv.join(', ')}`)
  process.exit(1)
}

const app = express()

const rawOrigins = process.env.ALLOWED_ORIGINS ?? ''
const allowedOrigins = rawOrigins
  ? rawOrigins.split(',').map((o) => o.trim()).filter(Boolean)
  : ['http://localhost:5173']

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true,
  })
)
app.use(express.json({ limit: '10mb' }))

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/spots', spotsRouter)
app.use('/auth', authRouter)
app.use('/users', usersRouter)
app.use('/collections', collectionsRouter)
app.use('/admin', adminRouter)
app.use('/reports', reportsRouter)

app.use(errorHandler)

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`Server running on port ${port}`))
