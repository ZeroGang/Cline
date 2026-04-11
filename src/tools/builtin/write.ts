import { z } from 'zod'
import { createTool } from '../registry.js'
import type { Tool } from '../types.js'
import * as fs from 'fs/promises'
import * as path from 'path'

export const WriteInputSchema = z.object({
  file_path: z.string().describe('The absolute path to the file to write'),
  content: z.string().describe('The content to write to the file')
})

export type WriteInput = z.infer<typeof WriteInputSchema>

export function createWriteTool(): Tool<WriteInput> {
  return createTool({
    name: 'Write',
    description: 'Writes a file to the local filesystem',
    inputSchema: WriteInputSchema,
    isReadOnly: () => false,
    isDestructive: () => true,
    isConcurrencySafe: () => false,
    checkPermissions: () => 'ask',
    execute: async (input: WriteInput) => {
      try {
        const absolutePath = path.resolve(input.file_path)
        
        if (!isPathSafe(absolutePath)) {
          return { 
            output: `Error: Path "${absolutePath}" is not safe or allowed`,
            error: true 
          }
        }
        
        const dir = path.dirname(absolutePath)
        await fs.mkdir(dir, { recursive: true })
        
        await fs.writeFile(absolutePath, input.content, 'utf-8')
        
        return { 
          output: `Successfully wrote to ${absolutePath}`,
          metadata: { bytesWritten: Buffer.byteLength(input.content, 'utf-8') }
        }
      } catch (error) {
        return { 
          output: `Error writing file: ${(error as Error).message}`,
          error: true 
        }
      }
    }
  })
}

export function isPathSafe(filePath: string): boolean {
  const normalized = path.normalize(filePath)
  const cwd = process.cwd()
  
  const absolutePath = path.isAbsolute(normalized) ? normalized : path.resolve(cwd, normalized)
  const relative = path.relative(cwd, absolutePath)
  
  if (relative.startsWith('..') || relative === '') {
    return false
  }
  
  if (normalized.includes('\0')) {
    return false
  }
  
  return true
}
