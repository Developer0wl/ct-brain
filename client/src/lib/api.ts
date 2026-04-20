import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

async function getAuthHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not authenticated')
  return `Bearer ${token}`
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamChunk {
  type: 'chunk' | 'done' | 'error'
  text?: string
  sources?: Array<{ name: string; similarity: number }>
  message?: string
}

export async function streamChat(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: (sources: Array<{ name: string; similarity: number }>) => void,
  onError: (msg: string) => void
): Promise<void> {
  const authHeader = await getAuthHeader()

  const response = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify({ messages }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }))
    onError(err.error ?? 'Chat request failed')
    return
  }

  const reader = response.body?.getReader()
  if (!reader) { onError('No response stream'); return }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const parsed: StreamChunk = JSON.parse(line.slice(6))
        if (parsed.type === 'chunk' && parsed.text) onChunk(parsed.text)
        if (parsed.type === 'done') onDone(parsed.sources ?? [])
        if (parsed.type === 'error') onError(parsed.message ?? 'Error')
      } catch {
        // skip malformed SSE line
      }
    }
  }
}

export async function getKnowledgeSources() {
  const authHeader = await getAuthHeader()
  const res = await fetch(`${API_URL}/api/knowledge/sources`, {
    headers: { Authorization: authHeader },
  })
  if (!res.ok) throw new Error('Failed to fetch sources')
  return res.json()
}

export async function getKnowledgeChunks() {
  const authHeader = await getAuthHeader()
  const res = await fetch(`${API_URL}/api/knowledge/chunks`, {
    headers: { Authorization: authHeader },
  })
  if (!res.ok) throw new Error('Failed to fetch chunks')
  return res.json()
}

export async function addFAQ(question: string, answer: string) {
  const authHeader = await getAuthHeader()
  const res = await fetch(`${API_URL}/api/knowledge/faq`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify({ question, answer }),
  })
  if (!res.ok) throw new Error('Failed to add FAQ')
  return res.json()
}

export async function uploadFile(file: File) {
  const authHeader = await getAuthHeader()
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_URL}/api/knowledge/upload`, {
    method: 'POST',
    headers: { Authorization: authHeader },
    body: form,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Upload failed')
  return data
}

export async function deleteSource(id: string) {
  const authHeader = await getAuthHeader()
  const res = await fetch(`${API_URL}/api/knowledge/source/${id}`, {
    method: 'DELETE',
    headers: { Authorization: authHeader },
  })
  if (!res.ok) throw new Error('Failed to delete source')
  return res.json()
}

export async function deleteChunk(id: string) {
  const authHeader = await getAuthHeader()
  const res = await fetch(`${API_URL}/api/knowledge/chunk/${id}`, {
    method: 'DELETE',
    headers: { Authorization: authHeader },
  })
  if (!res.ok) throw new Error('Failed to delete chunk')
  return res.json()
}
