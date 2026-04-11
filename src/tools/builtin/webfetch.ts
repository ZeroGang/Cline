import { z } from 'zod'
import { createTool } from '../registry.js'
import type { Tool } from '../types.js'

export const WebFetchInputSchema = z.object({
  url: z.string().url().describe('The URL to fetch')
})

export type WebFetchInput = z.infer<typeof WebFetchInputSchema>

export function createWebFetchTool(): Tool<WebFetchInput> {
  return createTool({
    name: 'WebFetch',
    description: 'Fetches a URL and converts HTML to markdown',
    inputSchema: WebFetchInputSchema,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    checkPermissions: () => 'ask',
    execute: async (input: WebFetchInput) => {
      try {
        const response = await fetch(input.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; CLine/1.0)'
          }
        })
        
        if (!response.ok) {
          return { 
            output: `HTTP Error: ${response.status} ${response.statusText}`,
            error: true 
          }
        }
        
        const contentType = response.headers.get('content-type') || ''
        let content = await response.text()
        
        if (contentType.includes('text/html')) {
          content = htmlToMarkdown(content)
        }
        
        if (content.length > 50000) {
          content = content.substring(0, 50000) + '\n... (truncated)'
        }
        
        return { output: content }
      } catch (error) {
        return { 
          output: `Error fetching URL: ${(error as Error).message}`,
          error: true 
        }
      }
    }
  })
}

function htmlToMarkdown(html: string): string {
  let md = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
    .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n')
    .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<pre[^>]*>(.*?)<\/pre>/gis, '```\n$1\n```')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  
  return md
}
