import type { PermissionMode, PermissionDecision } from '../types.js'

export interface PermissionRule {
  type: 'allow' | 'deny' | 'ask'
  tool?: string
  pattern?: string
  path?: string
  priority: number
}

export interface PermissionCheckResult {
  decision: PermissionDecision
  rule?: PermissionRule
  reason?: string
}

export interface PermissionModeConfig {
  mode: PermissionMode
  allowedTools: string[]
  deniedTools: string[]
  requireConfirmation: string[]
}

export const PERMISSION_MODE_CONFIGS: Record<PermissionMode, PermissionModeConfig> = {
  default: {
    mode: 'default',
    allowedTools: [],
    deniedTools: [],
    requireConfirmation: ['Bash', 'Write', 'Edit'],
  },
  plan: {
    mode: 'plan',
    allowedTools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'AskUserQuestion'],
    deniedTools: ['Bash', 'Write', 'Edit'],
    requireConfirmation: [],
  },
  auto: {
    mode: 'auto',
    allowedTools: [],
    deniedTools: [],
    requireConfirmation: [],
  },
  bypass: {
    mode: 'bypass',
    allowedTools: [],
    deniedTools: [],
    requireConfirmation: [],
  },
}

export type { PermissionMode, PermissionDecision } from '../types.js'
