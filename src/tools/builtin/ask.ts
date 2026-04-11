import { z } from 'zod'
import { createTool } from '../registry.js'
import type { Tool } from '../types.js'

export const AskUserQuestionInputSchema = z.object({
  questions: z.array(z.object({
    question: z.string().describe('The complete question to ask the user'),
    header: z.string().describe('Very short label displayed as a chip/tag'),
    options: z.array(z.object({
      label: z.string().describe('The display text for this option'),
      description: z.string().describe('Explanation of what this option means')
    })).min(2).max(4).describe('The available choices for this question'),
    multiSelect: z.boolean().default(false).describe('Allow multiple selections')
  })).min(1).max(4).describe('Questions to ask the user (1-4)')
})

export type AskUserQuestionInput = z.input<typeof AskUserQuestionInputSchema>

export interface AskUserQuestionResult {
  output: string
  error?: boolean
  answers?: Record<string, string | string[]>
}

export function createAskUserQuestionTool(): Tool<AskUserQuestionInput, AskUserQuestionResult> {
  return createTool({
    name: 'AskUserQuestion',
    description: 'Ask the user questions during execution',
    inputSchema: AskUserQuestionInputSchema,
    isReadOnly: () => true,
    isConcurrencySafe: () => false,
    checkPermissions: () => 'allow',
    execute: async (input: AskUserQuestionInput) => {
      try {
        // This is a placeholder implementation
        // In production, this would integrate with the UI to display questions
        // and wait for user responses
        
        const answers: Record<string, string | string[]> = {}
        
        input.questions.forEach((q, index) => {
          // Default to first option for each question
          answers[`question_${index}`] = q.multiSelect 
            ? [q.options[0]?.label || '']
            : q.options[0]?.label || ''
        })
        
        const output = input.questions
          .map((q, i) => {
            const answer = answers[`question_${i}`]
            return `Q: ${q.question}\nA: ${Array.isArray(answer) ? answer.join(', ') : answer}`
          })
          .join('\n\n')
        
        return { 
          output,
          answers
        }
      } catch (error) {
        return { 
          output: `Error asking question: ${(error as Error).message}`,
          error: true 
        }
      }
    }
  })
}
