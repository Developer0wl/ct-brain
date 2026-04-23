/**
 * Tool definitions for C&T Brain agent.
 * Gemini decides which tools to call based on the user's question.
 */

import type { FunctionDeclaration } from '@google/generative-ai'
import { SchemaType } from '@google/generative-ai'
import { retrieveRelevantChunks, buildContextBlock } from './rag'
import { searchWeb, formatSearchResults } from './webSearch'
import {
  searchTeamsMessages,
  searchEmails,
  searchSharePoint,
  isMicrosoftConfigured,
} from './msGraph'

export interface ToolResult {
  toolName: string
  result: string
}

// ─── Function declarations (what Gemini sees) ────────────────────────────

export function getToolDeclarations(): FunctionDeclaration[] {
  const tools: FunctionDeclaration[] = [
    {
      name: 'search_knowledge_base',
      description:
        'Search the C&T internal knowledge base — company documents, capability briefs, service one-pagers, FAQ, and promoted Q&A from past conversations. Use this first for any C&T-specific question.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          query: {
            type: SchemaType.STRING,
            description: 'The search query to find relevant knowledge chunks',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'search_web',
      description:
        'Search the public internet for current information. Use for: prospect/company research, recent news, technology topics not in the knowledge base, LinkedIn profile lookup, market intelligence.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          query: {
            type: SchemaType.STRING,
            description: 'Web search query — be specific for better results',
          },
          purpose: {
            type: SchemaType.STRING,
            description: 'Brief description of why you are searching (e.g. "prospect research", "technology overview")',
          },
        },
        required: ['query'],
      },
    },
  ]

  // Only advertise Microsoft tools if credentials are configured
  if (isMicrosoftConfigured()) {
    tools.push(
      {
        name: 'search_teams_messages',
        description:
          'Search Microsoft Teams messages and conversations across all channels the user belongs to. Use for: finding past discussions, decisions, project updates, or any information shared on Teams.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: { type: SchemaType.STRING, description: 'What to search for in Teams messages' },
          },
          required: ['query'],
        },
      },
      {
        name: 'search_emails',
        description:
          'Search Outlook emails. Use for: finding email threads, past correspondence with clients, proposals sent, meeting notes emailed to the team.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: { type: SchemaType.STRING, description: 'Email search query' },
          },
          required: ['query'],
        },
      },
      {
        name: 'search_sharepoint',
        description:
          'Search SharePoint and OneDrive files. Use for: finding internal documents, slide decks, proposals, SOPs stored in SharePoint or OneDrive.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: { type: SchemaType.STRING, description: 'File/document search query' },
          },
          required: ['query'],
        },
      }
    )
  }

  return tools
}

// ─── Tool executor ────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, string>
): Promise<ToolResult> {
  switch (name) {
    case 'search_knowledge_base': {
      const chunks = await retrieveRelevantChunks(args.query, 0.35)
      const result = chunks.length > 0
        ? buildContextBlock(chunks)
        : 'No relevant documents found in the C&T knowledge base for this query.'
      return { toolName: name, result }
    }

    case 'search_web': {
      const res = await searchWeb(args.query, { maxResults: 5, includeAnswer: true })
      const result = formatSearchResults(res)
      return { toolName: name, result }
    }

    case 'search_teams_messages': {
      const result = await searchTeamsMessages(args.query)
      return { toolName: name, result }
    }

    case 'search_emails': {
      const result = await searchEmails(args.query)
      return { toolName: name, result }
    }

    case 'search_sharepoint': {
      const result = await searchSharePoint(args.query)
      return { toolName: name, result }
    }

    default:
      return { toolName: name, result: `Unknown tool: ${name}` }
  }
}

/** Human-readable label shown in the UI while a tool runs */
export function toolActivityLabel(name: string, args: Record<string, string>): string {
  const labels: Record<string, string> = {
    search_knowledge_base: `Searching knowledge base for "${args.query}"`,
    search_web: `Searching the web for "${args.query}"`,
    search_teams_messages: `Searching Teams for "${args.query}"`,
    search_emails: `Searching emails for "${args.query}"`,
    search_sharepoint: `Searching SharePoint for "${args.query}"`,
  }
  return labels[name] ?? `Running ${name}...`
}
