import { createClient } from '@supabase/supabase-js'
import { embedText } from './embeddings'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface RetrievedChunk {
  id: string
  content: string
  source_name: string
  source_type: string
  title: string | null
  similarity: number
}

export async function retrieveRelevantChunks(
  query: string,
  matchCount = 5,
  threshold = 0.4
): Promise<RetrievedChunk[]> {
  const embedding = await embedText(query)

  const { data, error } = await supabase.rpc('match_knowledge_chunks', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: matchCount,
  })

  if (error) {
    console.error('RAG retrieval error:', error)
    return []
  }

  return (data as RetrievedChunk[]) ?? []
}

export function buildContextBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return ''

  const parts = chunks.map((c, i) => {
    const source = c.title ?? c.source_name
    return `[${i + 1}] Source: ${source}\n${c.content}`
  })

  return `<context>\n${parts.join('\n\n---\n\n')}\n</context>`
}
