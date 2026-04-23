import { Router, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { runAgentWithStreaming } from '../services/gemini'

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
    // Resolve or create conversation
    let conversationId = existingConversationId ?? null
    if (!conversationId) {
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .insert({ user_id: req.userId })
        .select('id')
        .single()

      if (!convError) conversationId = conv.id
    }

    // Persist user message
    let userMessageId: string | null = null
    if (conversationId) {
      const { data: userMsg } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, role: 'user', content: lastUserMessage.content, sources: [] })
        .select('id')
        .single()
      if (userMsg) userMessageId = userMsg.id
    }

    // Open SSE stream
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    let fullResponse = ''
    const toolsUsed: string[] = []

    await runAgentWithStreaming(
      messages,
      // onActivity — tool is running, tell the frontend
      (label) => {
        res.write(`data: ${JSON.stringify({ type: 'activity', label })}\n\n`)
      },
      // onChunk — stream response text
      (text) => {
        fullResponse += text
        res.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`)
      },
      // onDone — persist assistant message + send final metadata
      async (usedTools) => {
        toolsUsed.push(...usedTools)

        // Persist assistant message
        let assistantMessageId: string | null = null
        if (conversationId && fullResponse) {
          const { data: asstMsg } = await supabase
            .from('messages')
            .insert({
              conversation_id: conversationId,
              role: 'assistant',
              content: fullResponse,
              sources: toolsUsed.map((t) => ({ name: t, similarity: 100 })),
            })
            .select('id')
            .single()
          if (asstMsg) assistantMessageId = asstMsg.id
        }

        res.write(
          `data: ${JSON.stringify({
            type: 'done',
            sources: toolsUsed.map((t) => ({
              name: toolLabel(t),
              similarity: 100,
            })),
            toolsUsed,
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

function toolLabel(toolName: string): string {
  const labels: Record<string, string> = {
    search_knowledge_base: 'C&T Knowledge Base',
    search_web: 'Web Search',
    search_teams_messages: 'Microsoft Teams',
    search_emails: 'Outlook Email',
    search_sharepoint: 'SharePoint',
  }
  return labels[toolName] ?? toolName
}

export default router
