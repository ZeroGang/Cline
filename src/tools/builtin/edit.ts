import { z } from 'zod'
import { createTool } from '../registry.js'
import type { Tool } from '../types.js'
import * as fs from 'fs/promises'
import * as path from 'path'

export const EditInputSchema = z.object({
  file_path: z.string().describe('The absolute path to the file to edit'),
  old_str: z.string().describe('The text to search for - must match exactly'),
  new_str: z.string().describe('The text to replace with')
})

export type EditInput = z.infer<typeof EditInputSchema>

export function createEditTool(): Tool<EditInput> {
  return createTool({
    name: 'Edit',
    description: 'Performs a search and replace on a file',
    inputSchema: EditInputSchema,
    isReadOnly: () => false,
    isDestructive: () => true,
    isConcurrencySafe: () => false,
    checkPermissions: () => 'ask',
    execute: async (input: EditInput) => {
      try {
        const absolutePath = path.resolve(input.file_path)
        
        if (!isEditPathSafe(absolutePath)) {
          return { 
            output: `Error: Path "${absolutePath}" is not safe or allowed`,
            error: true 
          }
        }
        
        if (input.old_str === input.new_str) {
          return { 
            output: 'Error: old_str and new_str must be different',
            error: true 
          }
        }
        
        const content = await fs.readFile(absolutePath, 'utf-8')
        
        if (!content.includes(input.old_str)) {
          return { 
            output: `Error: Could not find the text to replace in ${absolutePath}`,
            error: true 
          }
        }
        
        const occurrences = countOccurrences(content, input.old_str)
        if (occurrences > 1) {
          return { 
            output: `Error: Found ${occurrences} occurrences of old_str. The old_str must be unique.`,
            error: true 
          }
        }
        
        const newContent = content.replace(input.old_str, input.new_str)
        await fs.writeFile(absolutePath, newContent, 'utf-8')
        
        return { 
          output: `Successfully edited ${absolutePath}`,
          metadata: { 
            bytesBefore: Buffer.byteLength(content, 'utf-8'),
            bytesAfter: Buffer.byteLength(newContent, 'utf-8')
          }
        }
      } catch (error) {
        return { 
          output: `Error editing file: ${(error as Error).message}`,
          error: true 
        }
      }
    }
  })
}

function countOccurrences(content: string, search: string): number {
  let count = 0
  let index = 0
  
  while (true) {
    index = content.indexOf(search, index)
    if (index === -1) break
    count++
    index += search.length
  }
  
  return count
}

export function isEditPathSafe(filePath: string): boolean {
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
