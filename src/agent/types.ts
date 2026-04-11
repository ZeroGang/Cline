import type { AgentId, AgentStatus, PermissionMode } from '../types.js'
import type { AgentMetrics, AgentEvent } from '../scheduler/types.js'
import type { ToolRegistry } from '../tools/registry.js'
import type { PermissionSystem } from '../permissions/system.js'
import type { Store } from '../infrastructure/state/store.js'
import type { AppState } from '../infrastructure/state/index.js'
import type { MCPTool } from '../mcp/types.js'

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string
  is_error?: boolean
}

export interface AgentContext {
  messages: Message[]
  abortController: AbortController
  tools: ToolRegistry
  permissionSystem: PermissionSystem
  setAppState: (updater: (state: AppState) => AppState) => void
  readFileState: Map<string, string>
  contentReplacementState: Map<string, string>
  toolPermissionContext: {
    mode: PermissionMode
    sessionId: string
  }
  mcpTools: MCPTool[]
  store: Store<AppState>
}

export interface QueryDeps {
  callModel: (messages: Message[], tools: unknown[]) => AsyncGenerator<Message>
  autocompact: (messages: Message[]) => Promise<Message[]>
  microcompact: (messages: Message[]) => Promise<Message[]>
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
