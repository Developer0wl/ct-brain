import { Router, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { retrieveRelevantChunks, buildContextBlock } from '../services/rag'
import { streamChatResponse } from '../services/gemini'

const router = Router()

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

router.post('/', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { messages, conversationId: existingConversationId } = req.body as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    conversationId?: string
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

    // Resolve conversation: reuse existing or create new one
    let conversationId = existingConversationId ?? null
    if (!conversationId) {
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .insert({ user_id: req.userId })
        .select('id')
        .single()

      if (convError) {
        console.error('Failed to create conversation:', convError)
      } else {
        conversationId = conv.id
      }
    }

    // Persist the user message
    let userMessageId: string | null = null
    if (conversationId) {
      const { data: userMsg, error: userMsgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          role: 'user',
          content: lastUserMessage.content,
          sources: [],
        })
        .select('id')
        .single()

      if (userMsgError) {
        console.error('Failed to persist user message:', userMsgError)
      } else {
        userMessageId = userMsg.id
      }
    }

    // Stream response back using SSE
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    let fullResponse = ''

    await streamChatResponse(
      messages,
      contextBlock,
      (text) => {
        fullResponse += text
        res.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`)
      },
      async () => {
        const sourceSummary = chunks.map((c) => ({
          name: c.title ?? c.source_name,
          similarity: Math.round(c.similarity * 100),
        }))

        // Persist the assistant message after stream completes
        let assistantMessageId: string | null = null
        if (conversationId && fullResponse) {
          const { data: asstMsg, error: asstMsgError } = await supabase
            .from('messages')
            .insert({
              conversation_id: conversationId,
              role: 'assistant',
              content: fullResponse,
              sources: sourceSummary,
            })
            .select('id')
            .single()

          if (asstMsgError) {
            console.error('Failed to persist assistant message:', asstMsgError)
          } else {
            assistantMessageId = asstMsg.id
          }
        }

        res.write(
          `data: ${JSON.stringify({
            type: 'done',
            sources: sourceSummary,
            conversationId,
            messageId: assistantMessageId,
          })}\n\n`
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
