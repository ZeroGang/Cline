import { z } from 'zod'
import { createTool } from '../registry.js'
import type { Tool } from '../types.js'
import * as fs from 'fs/promises'
import * as path from 'path'

export const GrepInputSchema = z.object({
  pattern: z.string().describe('The regular expression pattern to search for'),
  path: z.string().optional().describe('The directory to search in'),
  glob: z.string().optional().describe('The glob pattern to filter files'),
  output_mode: z.enum(['content', 'files_with_matches', 'count']).default('content').describe('Output mode'),
  '-i': z.boolean().optional().describe('Case insensitive search'),
  '-n': z.boolean().optional().describe('Show line numbers')
})

export type GrepInput = z.input<typeof GrepInputSchema>

interface GrepMatch {
  file: string
  line: number
  content: string
}

async function grepFiles(
  pattern: string,
  searchPath: string,
  globPattern?: string,
  caseInsensitive?: boolean
): Promise<GrepMatch[]> {
  const results: GrepMatch[] = []
  const regex = new RegExp(pattern, caseInsensitive ? 'gi' : 'g')
  const globRegex = globPattern ? new RegExp(globPattern.replace(/\*/g, '.*').replace(/\?/g, '.')) : null
  
  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await walk(fullPath)
        }
      } else if (entry.isFile()) {
        if (globRegex && !globRegex.test(entry.name)) {
          continue
        }
        
        try {
          const content = await fs.readFile(fullPath, 'utf-8')
          const lines = content.split('\n')
          
          lines.forEach((line, index) => {
            if (regex.test(line)) {
              results.push({
                file: fullPath,
                line: index + 1,
                content: line.trim()
              })
            }
            regex.lastIndex = 0
          })
        } catch {
          // Skip files that can't be read
        }
      }
    }
  }
  
  await walk(searchPath)
  return results
}

export function createGrepTool(): Tool<GrepInput> {
  return createTool({
    name: 'Grep',
    description: 'A powerful search tool built on ripgrep',
    inputSchema: GrepInputSchema,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    checkPermissions: () => 'allow',
    execute: async (input: GrepInput) => {
      try {
        const searchPath = input.path ? path.resolve(input.path) : process.cwd()
        const matches = await grepFiles(
          input.pattern,
          searchPath,
          input.glob,
          input['-i']
        )
        
        if (matches.length === 0) {
          return { output: 'No matches found' }
        }
        
        const showLineNumbers = input['-n'] !== false
        const outputMode = input.output_mode ?? 'content'
        
        if (outputMode === 'files_with_matches') {
          const files = [...new Set(matches.map(m => m.file))]
          return { output: files.join('\n') }
        }
        
        if (outputMode === 'count') {
          const counts: Record<string, number> = {}
          matches.forEach(m => {
            counts[m.file] = (counts[m.file] || 0) + 1
          })
          return { 
            output: Object.entries(counts)
              .map(([file, count]) => `${file}: ${count}`)
              .join('\n')
          }
        }
        
        const output = matches
          .map(m => showLineNumbers ? `${m.file}:${m.line}:${m.content}` : `${m.file}:${m.content}`)
          .join('\n')
        
        return { output }
      } catch (error) {
        return { 
          output: `Error searching: ${(error as Error).message}`,
          error: true 
        }
      }
    }
  })
}
