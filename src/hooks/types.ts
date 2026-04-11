import type { HookType } from '../types.js'

export interface HookConfig {
  type: HookType
  command: string
  timeout?: number
  matchers?: Array<{
    tool?: string
    pattern?: string
  }>
}

export interface HookResult {
  decision: 'proceed' | 'block'
  modifiedInput?: unknown
  modifiedResult?: unknown
  reason?: string
}

export type { HookType } from '../types.js'
