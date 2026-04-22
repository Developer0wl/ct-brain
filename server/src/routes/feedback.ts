import { Router, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth, requireAdmin, AuthedRequest } from '../middleware/auth'
import { embedDocument } from '../services/embeddings'

const router = Router()

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/feedback — record a rating on an assistant message
router.post('/', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { messageId, rating, comment } = req.body as {
    messageId: string
    rating: 'good' | 'bad'
    comment?: string
  }

  if (!messageId || !rating) {
    res.status(400).json({ error: 'messageId and rating are required' })
    return
  }

  if (rating !== 'good' && rating !== 'bad') {
    res.status(400).json({ error: 'rating must be "good" or "bad"' })
    return
  }

  // Verify the message exists and belongs to the user's conversation
  const { data: message, error: msgError } = await supabase
    .from('messages')
    .select('id, role, conversation_id, conversations(user_id)')
    .eq('id', messageId)
    .single()

  if (msgError || !message) {
    res.status(404).json({ error: 'Message not found' })
    return
  }

  if (message.role !== 'assistant') {
    res.status(400).json({ error: 'Can only rate assistant messages' })
    return
  }

  const conv = message.conversations as unknown as { user_id: string }
  if (conv?.user_id !== req.userId) {
    res.status(403).json({ error: 'Not your conversation' })
    return
  }

  const { data: fb, error: fbError } = await supabase
    .from('feedback')
    .insert({
      message_id: messageId,
      user_id: req.userId,
      rating,
      comment: comment ?? null,
    })
    .select('id')
    .single()

  if (fbError) {
    console.error('Failed to save feedback:', fbError)
    res.status(500).json({ error: 'Failed to save feedback' })
    return
  }

  res.json({ success: true, feedbackId: fb.id })
})

// GET /api/feedback — list all feedback entries (admin only)
router.get('/', requireAdmin, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { filter } = req.query as { filter?: string }

  let query = supabase
    .from('feedback')
    .select(`
      id,
      rating,
      comment,
      promoted_to_kb,
      created_at,
      user_id,
      profiles(email),
      messages(
        id,
        content,
        sources,
        conversation_id,
        conversations(
          id,
          messages(id, role, content)
        )
      )
    `)
    .order('created_at', { ascending: false })

  if (filter === 'good') query = query.eq('rating', 'good')
  else if (filter === 'bad') query = query.eq('rating', 'bad')
  else if (filter === 'unpromoted') query = query.eq('promoted_to_kb', false).eq('rating', 'good')

  const { data, error } = await query

  if (error) {
    console.error('Failed to fetch feedback:', error)
    res.status(500).json({ error: error.message })
    return
  }

  // Shape each entry: find the user question that preceded this assistant message
  const shaped = (data ?? []).map((fb: any) => {
    const assistantMsg = fb.messages
    const conversation = assistantMsg?.conversations

    // Find the user message that immediately precedes this assistant message
    const allMsgs: Array<{ id: string; role: string; content: string }> =
      conversation?.messages ?? []
    const assistantIndex = allMsgs.findIndex((m) => m.id === assistantMsg?.id)
    const userMsg = assistantIndex > 0 ? allMsgs[assistantIndex - 1] : null

    return {
      id: fb.id,
      rating: fb.rating,
      comment: fb.comment,
      promotedToKb: fb.promoted_to_kb,
      createdAt: fb.created_at,
      userEmail: (fb.profiles as any)?.email ?? 'unknown',
      question: userMsg?.content ?? '(question not found)',
      answer: assistantMsg?.content ?? '',
      sources: assistantMsg?.sources ?? [],
      messageId: assistantMsg?.id,
      conversationId: conversation?.id,
    }
  })

  res.json(shaped)
})

// POST /api/feedback/:id/promote — embed answer and add to knowledge base (admin only)
router.post('/:id/promote', requireAdmin, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { id } = req.params

  // Fetch the feedback with message content
  const { data: fb, error: fbError } = await supabase
    .from('feedback')
    .select(`
      id,
      promoted_to_kb,
      messages(
        id,
        content,
        sources,
        conversation_id,
        conversations(
          messages(id, role, content)
        )
      )
    `)
    .eq('id', id)
    .single()

  if (fbError || !fb) {
    res.status(404).json({ error: 'Feedback not found' })
    return
  }

  if (fb.promoted_to_kb) {
    res.status(400).json({ error: 'Already promoted to knowledge base' })
    return
  }

  const assistantMsg = (fb as any).messages
  const conversation = assistantMsg?.conversations
  const allMsgs: Array<{ id: string; role: string; content: string }> =
    conversation?.messages ?? []
  const assistantIndex = allMsgs.findIndex((m) => m.id === assistantMsg?.id)
  const userMsg = assistantIndex > 0 ? allMsgs[assistantIndex - 1] : null

  const question = userMsg?.content ?? ''
  const answer = assistantMsg?.content ?? ''

  if (!answer) {
    res.status(400).json({ error: 'No answer content to promote' })
    return
  }

  // Build the content to embed: Q&A pair for richer retrieval
  const contentToEmbed = question
    ? `Q: ${question}\n\nA: ${answer}`
    : answer

  try {
    // Embed the Q&A content
    const embedding = await embedDocument(contentToEmbed)

    // Insert as a new knowledge chunk
    const chunkId = uuidv4()
    const sourceId = uuidv4()

    const { error: insertError } = await supabase
      .from('knowledge_chunks')
      .insert({
        id: chunkId,
        source_name: 'User Feedback',
        source_type: 'conversation',
        title: question ? question.slice(0, 120) : 'Promoted Q&A',
        content: contentToEmbed,
        embedding,
        metadata: {
          feedback_id: id,
          promoted_by: req.userId,
          original_sources: assistantMsg?.sources ?? [],
        },
      })

    if (insertError) {
      console.error('Failed to insert knowledge chunk:', insertError)
      res.status(500).json({ error: 'Failed to add to knowledge base' })
      return
    }

    // Also insert a knowledge_sources record for admin visibility
    await supabase
      .from('knowledge_sources')
      .insert({
        id: sourceId,
        name: 'User Feedback',
        type: 'conversation',
        size_bytes: contentToEmbed.length,
        chunk_count: 1,
        uploaded_by: req.userId,
      })

    // Mark feedback as promoted
    await supabase
      .from('feedback')
      .update({ promoted_to_kb: true })
      .eq('id', id)

    res.json({ success: true, chunkId })
  } catch (err) {
    console.error('Promotion error:', err)
    res.status(500).json({ error: 'Failed to embed and promote answer' })
  }
})

export default router
