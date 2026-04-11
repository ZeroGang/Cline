import { z } from 'zod'
import { createTool } from '../registry.js'
import type { Tool } from '../types.js'

export const WebSearchInputSchema = z.object({
  query: z.string().describe('The search query to execute'),
  num: z.number().default(5).describe('Maximum number of results to return'),
  lr: z.string().optional().describe('Language restriction for search results')
})

export type WebSearchInput = z.input<typeof WebSearchInputSchema>

interface SearchResult {
  title: string
  url: string
  snippet: string
}

export function createWebSearchTool(): Tool<WebSearchInput> {
  return createTool({
    name: 'WebSearch',
    description: 'Search the web for information',
    inputSchema: WebSearchInputSchema,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    checkPermissions: () => 'ask',
    execute: async (input: WebSearchInput) => {
      try {
        const num = input.num ?? 5
        const results = await performWebSearch(input.query, num, input.lr)
        
        if (results.length === 0) {
          return { output: 'No search results found' }
        }
        
        const output = results
          .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
          .join('\n\n')
        
        return { output }
      } catch (error) {
        return { 
          output: `Error searching web: ${(error as Error).message}`,
          error: true 
        }
      }
    }
  })
}

async function performWebSearch(query: string, num: number = 5, lr?: string): Promise<SearchResult[]> {
  // Placeholder implementation - in production, this would use a real search API
  // such as Google Custom Search, Bing Search API, or DuckDuckGo
  return [
    {
      title: `Search results for: ${query}`,
      url: `https://example.com/search?q=${encodeURIComponent(query)}`,
      snippet: `This is a placeholder search result. In production, this would return actual search results from a search API. Query: "${query}", Results: ${num}, Language: ${lr || 'default'}`
    }
  ]
}
