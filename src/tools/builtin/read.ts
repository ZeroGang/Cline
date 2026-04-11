import { z } from 'zod'
import { createTool } from '../registry.js'
import type { Tool } from '../types.js'
import * as fs from 'fs/promises'
import * as path from 'path'

export const ReadInputSchema = z.object({
  file_path: z.string().describe('The absolute path to the file to read'),
  limit: z.number().optional().describe('The number of lines to read'),
  offset: z.number().optional().describe('The line number to start reading from')
})

export type ReadInput = z.infer<typeof ReadInputSchema>

export function createReadTool(): Tool<ReadInput> {
  return createTool({
    name: 'Read',
    description: 'Reads a file from the local filesystem',
    inputSchema: ReadInputSchema,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    checkPermissions: () => 'allow',
    execute: async (input: ReadInput) => {
      try {
        const absolutePath = path.resolve(input.file_path)
        const content = await fs.readFile(absolutePath, 'utf-8')
        const lines = content.split('\n')
        
        const offset = input.offset ?? 0
        const limit = input.limit ?? lines.length
        
        const selectedLines = lines.slice(offset, offset + limit)
        const result = selectedLines
          .map((line, i) => `${offset + i + 1}\t${line}`)
          .join('\n')
        
        return { output: result }
      } catch (error) {
        return { 
          output: `Error reading file: ${(error as Error).message}`,
          error: true 
        }
      }
    }
  })
}
