import type { ZodSchema } from 'zod'
import type { PermissionDecision } from '../types.js'

export interface ToolResult {
  output: string
  error?: boolean
  metadata?: Record<string, unknown>
}

export interface Tool<Input = unknown, Output = ToolResult> {
  name: string
  description: string
  inputSchema: ZodSchema<Input>
  isEnabled: () => boolean
  isConcurrencySafe: (input: Input) => boolean
  isReadOnly: () => boolean
  isDestructive: () => boolean
  checkPermissions: (input: Input) => PermissionDecision
  execute: (input: Input) => Promise<Output>
}

export type { PermissionDecision } from '../types.js'
