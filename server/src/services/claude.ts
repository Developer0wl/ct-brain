import Anthropic from '@anthropic-ai/sdk'
import { CT_BRAIN_SYSTEM_PROMPT } from '../config/systemPrompt'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function streamChatResponse(
  messages: ChatMessage[],
  contextBlock: string,
  onChunk: (text: string) => void,
  onDone: () => void
): Promise<void> {
  // Inject retrieved context into the last user message
  const messagesWithContext = messages.map((m, idx) => {
    if (idx === messages.length - 1 && m.role === 'user' && contextBlock) {
      return {
        role: m.role as 'user',
        content: `${contextBlock}\n\nQuestion: ${m.content}`,
      }
    }
    return m
  })

  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: CT_BRAIN_SYSTEM_PROMPT,
    messages: messagesWithContext,
  })

  for await (const chunk of stream) {
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === 'text_delta'
    ) {
      onChunk(chunk.delta.text)
    }
  }

  onDone()
}

export async function getChatResponse(
  messages: ChatMessage[],
  contextBlock: string
): Promise<string> {
  const messagesWithContext = messages.map((m, idx) => {
    if (idx === messages.length - 1 && m.role === 'user' && contextBlock) {
      return {
        role: m.role as 'user',
        content: `${contextBlock}\n\nQuestion: ${m.content}`,
      }
    }
    return m
  })

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: CT_BRAIN_SYSTEM_PROMPT,
    messages: messagesWithContext,
  })

  const block = response.content[0]
  return block.type === 'text' ? block.text : ''
}
