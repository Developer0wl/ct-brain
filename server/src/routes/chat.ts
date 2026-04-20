import { Router, Response } from 'express'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { retrieveRelevantChunks, buildContextBlock } from '../services/rag'
import { streamChatResponse } from '../services/claude'

const router = Router()

router.post('/', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { messages } = req.body as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  }

  if (!messages || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' })
    return
  }

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
  if (!lastUserMessage) {
    res.status(400).json({ error: 'No user message found' })
    return
  }

  try {
    // Retrieve relevant knowledge
    const chunks = await retrieveRelevantChunks(lastUserMessage.content)
    const contextBlock = buildContextBlock(chunks)

    // Stream response back using SSE
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    await streamChatResponse(
      messages,
      contextBlock,
      (text) => {
        res.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`)
      },
      () => {
        const sourceSummary = chunks.map((c) => ({
          name: c.title ?? c.source_name,
          similarity: Math.round(c.similarity * 100),
        }))
        res.write(
          `data: ${JSON.stringify({ type: 'done', sources: sourceSummary })}\n\n`
        )
        res.end()
      }
    )
  } catch (err) {
    console.error('Chat error:', err)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate response' })
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Generation failed' })}\n\n`)
      res.end()
    }
  }
})

export default router
