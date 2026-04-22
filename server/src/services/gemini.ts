import { GoogleGenerativeAI } from '@google/generative-ai'
import { CT_BRAIN_SYSTEM_PROMPT } from '../config/systemPrompt'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// Use gemini-2.5-flash for fast, cost-effective responses
const chatModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  systemInstruction: CT_BRAIN_SYSTEM_PROMPT,
})

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// Convert our internal message format to Gemini's format
// Gemini uses 'user' | 'model' roles (not 'assistant')
function toGeminiHistory(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
}

export async function streamChatResponse(
  messages: ChatMessage[],
  contextBlock: string,
  onChunk: (text: string) => void,
  onDone: () => void
): Promise<void> {
  // Inject context into the last user message
  const allMessages = [...messages]
  const lastUserIdx = [...allMessages].map((m) => m.role).lastIndexOf('user')
  if (lastUserIdx !== -1 && contextBlock) {
    allMessages[lastUserIdx] = {
      ...allMessages[lastUserIdx],
      content: `${contextBlock}\n\nQuestion: ${allMessages[lastUserIdx].content}`,
    }
  }

  // Split into history (all but last message) and the current message
  const history = toGeminiHistory(allMessages.slice(0, -1))
  const lastMessage = allMessages[allMessages.length - 1]

  const chat = chatModel.startChat({ history })
  const result = await chat.sendMessageStream(lastMessage.content)

  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) onChunk(text)
  }

  onDone()
}

export async function getChatResponse(
  messages: ChatMessage[],
  contextBlock: string
): Promise<string> {
  const allMessages = [...messages]
  const lastUserIdx = [...allMessages].map((m) => m.role).lastIndexOf('user')
  if (lastUserIdx !== -1 && contextBlock) {
    allMessages[lastUserIdx] = {
      ...allMessages[lastUserIdx],
      content: `${contextBlock}\n\nQuestion: ${allMessages[lastUserIdx].content}`,
    }
  }

  const history = toGeminiHistory(allMessages.slice(0, -1))
  const lastMessage = allMessages[allMessages.length - 1]

  const chat = chatModel.startChat({ history })
  const result = await chat.sendMessage(lastMessage.content)
  return result.response.text()
}
