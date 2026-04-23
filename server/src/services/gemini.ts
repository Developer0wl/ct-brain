import { GoogleGenerativeAI, FunctionCallingMode } from '@google/generative-ai'
import { CT_BRAIN_SYSTEM_PROMPT } from '../config/systemPrompt'
import { getToolDeclarations, executeTool, toolActivityLabel } from './tools'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Convert internal message format → Gemini history format */
function toGeminiHistory(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : ('user' as 'user' | 'model'),
    parts: [{ text: m.content }],
  }))
}

/**
 * Agentic chat with tool calling.
 *
 * Flow:
 * 1. Send user message to Gemini with tool definitions
 * 2. Gemini may call one or more tools (KB search, web search, Teams, email, SharePoint)
 * 3. We execute the tools and send results back
 * 4. Gemini streams the final synthesised response
 *
 * onActivity is called when a tool starts executing, so the UI can show
 * "Searching the web..." etc. before the response streams.
 */
export async function runAgentWithStreaming(
  messages: ChatMessage[],
  onActivity: (label: string) => void,
  onChunk: (text: string) => void,
  onDone: (toolsUsed: string[]) => void
): Promise<void> {
  const toolDeclarations = getToolDeclarations()

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: CT_BRAIN_SYSTEM_PROMPT,
    tools: [{ functionDeclarations: toolDeclarations }],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
  })

  const history = toGeminiHistory(messages.slice(0, -1))
  const lastMessage = messages[messages.length - 1]

  const chat = model.startChat({ history })

  // ── Round 1: let Gemini decide what tools to call ──
  const firstResult = await chat.sendMessage(lastMessage.content)
  const firstResponse = firstResult.response

  const toolsUsed: string[] = []

  // Collect all function calls from this response
  const calls = firstResponse.functionCalls() ?? []

  if (calls.length === 0) {
    // No tools needed — stream what Gemini already returned
    const text = firstResponse.text()
    if (text) {
      // Stream character by character for smooth UX
      const words = text.split(' ')
      for (const word of words) {
        onChunk(word + ' ')
        await new Promise((r) => setTimeout(r, 0))
      }
    }
    onDone([])
    return
  }

  // ── Execute all tool calls in parallel ──
  const toolResponseParts = await Promise.all(
    calls.map(async (call) => {
      const args = call.args as Record<string, string>
      onActivity(toolActivityLabel(call.name, args))
      toolsUsed.push(call.name)

      const { result } = await executeTool(call.name, args)

      return {
        functionResponse: {
          name: call.name,
          response: { content: result },
        },
      }
    })
  )

  // ── Round 2: stream the final response with tool results ──
  const streamingModel = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: CT_BRAIN_SYSTEM_PROMPT,
    // No tools this round — just synthesise
  })

  const streamChat = streamingModel.startChat({ history })

  // Replay the user message
  await streamChat.sendMessage(lastMessage.content)

  // Build a synthesis prompt from tool results
  const toolContext = toolResponseParts
    .map((p) => `Tool: ${p.functionResponse.name}\n${p.functionResponse.response.content}`)
    .join('\n\n---\n\n')

  const synthesisPrompt = `Based on the following information gathered from your tools, answer the user's question. Do not mention tool names or citations in your answer.\n\n${toolContext}\n\nUser question: ${lastMessage.content}`

  const finalResult = await streamingModel
    .startChat({ history })
    .sendMessageStream(synthesisPrompt)

  for await (const chunk of finalResult.stream) {
    const text = chunk.text()
    if (text) onChunk(text)
  }

  onDone(toolsUsed)
}

// Keep legacy function for backward compatibility (used by knowledge route embedding endpoint)
export async function getChatResponse(
  messages: ChatMessage[],
  contextBlock: string
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: CT_BRAIN_SYSTEM_PROMPT,
  })

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

  const chat = model.startChat({ history })
  const result = await chat.sendMessage(lastMessage.content)
  return result.response.text()
}
