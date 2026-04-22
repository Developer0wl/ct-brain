import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import chatRouter from './routes/chat'
import knowledgeRouter from './routes/knowledge'
import feedbackRouter from './routes/feedback'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors({ origin: process.env.CLIENT_URL ?? 'http://localhost:5173' }))
app.use(express.json({ limit: '10mb' }))

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'C&T Brain API' }))

app.use('/api/chat', chatRouter)
app.use('/api/knowledge', knowledgeRouter)
app.use('/api/feedback', feedbackRouter)

app.listen(PORT, () => {
  console.log(`C&T Brain server running on http://localhost:${PORT}`)
})
