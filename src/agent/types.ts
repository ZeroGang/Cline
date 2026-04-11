import type { AgentId, AgentStatus, PermissionMode } from '../types.js'
import type { AgentMetrics, AgentEvent } from '../scheduler/types.js'

export interface AgentContext {
  messages: unknown[]
  abortController: AbortController
  tools: unknown[]
  setAppState: (updater: (state: unknown) => unknown) => void
  readFileState: Map<string, string>
  contentReplacementState: Map<string, string>
  toolPermissionContext: {
    mode: PermissionMode
    sessionId: string
  }
  mcpTools: unknown[]
}

export interface QueryDeps {
  callModel: (messages: unknown[]) => AsyncIterable<unknown>
  autocompact: (messages: unknown[]) => Promise<unknown[]>
  microcompact: (messages: unknown[]) => Promise<unknown[]>
  uuid: () => string
}

export interface AgentInstance {
  id: AgentId
  status: AgentStatus
  currentTaskId: string | null

  execute(task: unknown): AsyncGenerator<AgentEvent>
  interrupt(): Promise<void>
  getMetrics(): AgentMetrics
  dispose(): Promise<void>
}

export interface AgentDefinition {
  agentType: string
  tools?: string[]
  permissionMode: PermissionMode
  model?: string
  isolation: 'shared' | 'isolated'
  background: boolean
  maxTurns?: number
  requiredMcpServers?: string[]
}

export type { AgentId, AgentStatus, PermissionMode } from '../types.js'
