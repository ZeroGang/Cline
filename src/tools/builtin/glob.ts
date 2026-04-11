import { z } from 'zod'
import { createTool } from '../registry.js'
import type { Tool } from '../types.js'
import * as fs from 'fs/promises'
import * as path from 'path'

export const GlobInputSchema = z.object({
  pattern: z.string().describe('The glob pattern to match files against'),
  path: z.string().optional().describe('The directory to search in (defaults to current working directory)')
})

export type GlobInput = z.infer<typeof GlobInputSchema>

async function glob(pattern: string, dir: string): Promise<string[]> {
  const results: string[] = []
  const regex = globToRegex(pattern)
  
  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await walk(fullPath)
        }
      } else if (entry.isFile()) {
        const relativePath = path.relative(dir, fullPath)
        if (regex.test(relativePath) || regex.test(entry.name)) {
          results.push(fullPath)
        }
      }
    }
  }
  
  await walk(dir)
  return results.sort()
}

function globToRegex(pattern: string): RegExp {
  let regex = pattern
    .replace(/\*\*/g, '<<DOUBLESTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<DOUBLESTAR>>/g, '.*')
    .replace(/\?/g, '[^/]')
    .replace(/\./g, '\\.')
  
  return new RegExp(`^${regex}$`, 'i')
}

export function createGlobTool(): Tool<GlobInput> {
  return createTool({
    name: 'Glob',
    description: 'Fast file pattern matching tool',
    inputSchema: GlobInputSchema,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    checkPermissions: () => 'allow',
    execute: async (input: GlobInput) => {
      try {
        const searchDir = input.path ? path.resolve(input.path) : process.cwd()
        const matches = await glob(input.pattern, searchDir)
        
        if (matches.length === 0) {
          return { output: 'No files found matching the pattern' }
        }
        
        return { output: matches.join('\n') }
      } catch (error) {
        return { 
          output: `Error searching files: ${(error as Error).message}`,
          error: true 
        }
      }
    }
  })
}
