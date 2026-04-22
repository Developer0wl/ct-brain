import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })

// Gemini gemini-embedding-001 produces 3072-dimensional vectors
export async function embedText(text: string): Promise<number[]> {
  const result = await embeddingModel.embedContent({
    content: { role: 'user', parts: [{ text: text.slice(0, 8000) }] },
    taskType: 'RETRIEVAL_QUERY', // for querying at chat time
  })
  return result.embedding.values
}

export async function embedDocument(text: string): Promise<number[]> {
  const result = await embeddingModel.embedContent({
    content: { role: 'user', parts: [{ text: text.slice(0, 8000) }] },
    taskType: 'RETRIEVAL_DOCUMENT', // for indexing documents
  })
  return result.embedding.values
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  // Gemini doesn't have a batch endpoint — run in parallel with concurrency limit
  const CONCURRENCY = 5
  const results: number[][] = []
  for (let i = 0; i < texts.length; i += CONCURRENCY) {
    const batch = texts.slice(i, i + CONCURRENCY)
    const embeddings = await Promise.all(batch.map((t) => embedDocument(t)))
    results.push(...embeddings)
  }
  return results
}

// Split text into overlapping chunks suitable for embedding
export function chunkText(
  text: string,
  chunkSize = 500,
  overlap = 50
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const chunks: string[] = []

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ')
    if (chunk.trim().length > 20) {
      chunks.push(chunk.trim())
    }
    if (i + chunkSize >= words.length) break
  }

  return chunks
}
