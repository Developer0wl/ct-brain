/**
 * Tavily web search — designed for AI agents.
 * Free tier: 1000 calls/month. Sign up at https://app.tavily.com
 */

export interface SearchResult {
  title: string
  url: string
  content: string
  score: number
}

export interface WebSearchResponse {
  query: string
  results: SearchResult[]
  answer?: string  // Tavily AI-generated summary (when available)
}

export async function searchWeb(
  query: string,
  options: {
    maxResults?: number
    searchDepth?: 'basic' | 'advanced'
    includeAnswer?: boolean
  } = {}
): Promise<WebSearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY not set. Sign up at https://app.tavily.com for a free key.')
  }

  const { maxResults = 5, searchDepth = 'basic', includeAnswer = true } = options

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: maxResults,
      search_depth: searchDepth,
      include_answer: includeAnswer,
      include_raw_content: false,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Tavily search failed: ${response.status} — ${err}`)
  }

  const data = await response.json()

  return {
    query,
    answer: data.answer,
    results: (data.results ?? []).map((r: any) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score ?? 0,
    })),
  }
}

/** Format search results as a clean context block for Gemini */
export function formatSearchResults(res: WebSearchResponse): string {
  const lines: string[] = [`Web search results for: "${res.query}"\n`]

  if (res.answer) {
    lines.push(`Summary: ${res.answer}\n`)
  }

  res.results.slice(0, 4).forEach((r, i) => {
    lines.push(`[${i + 1}] ${r.title}`)
    lines.push(`    ${r.url}`)
    lines.push(`    ${r.content.slice(0, 400)}${r.content.length > 400 ? '...' : ''}\n`)
  })

  return lines.join('\n')
}
