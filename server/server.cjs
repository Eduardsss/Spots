import express from 'express'
import cors from 'cors'
import spotsRouter from './src/routes/spots.js'

const app = express()
app.use(cors())
app.use(express.json())

app.use('/spots', spotsRouter)

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`✅ Server running on port ${port}`))
