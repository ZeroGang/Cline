import type { AgentContext, Message } from './types.js'
import type { ToolRegistry } from '../tools/registry.js'
import type { Store } from '../infrastructure/state/store.js'
import type { AppState } from '../infrastructure/state/index.js'
import type { MCPTool } from '../mcp/types.js'
import type { PermissionMode } from '../types.js'
import { createDefaultPermissionSystem } from '../permissions/system.js'

export interface CreateAgentContextOptions {
  messages?: Message[]
  tools: ToolRegistry
  permissionMode?: PermissionMode
  store: Store<AppState>
  mcpTools?: MCPTool[]
  sessionId?: string
}

export function createAgentContext(options: CreateAgentContextOptions): AgentContext {
  const {
    messages = [],
    tools,
    permissionMode = 'default',
    store,
    mcpTools = [],
    sessionId = 'default-session'
  } = options

  return {
    messages,
    abortController: new AbortController(),
    tools,
    permissionSystem: createDefaultPermissionSystem(permissionMode),
    setAppState: (updater) => store.setState(updater),
    readFileState: new Map(),
    contentReplacementState: new Map(),
    toolPermissionContext: {
      mode: permissionMode,
      sessionId
    },
    mcpTools,
    store
  }
}

export function resetAgentContext(context: AgentContext): void {
  context.messages = []
  context.abortController = new AbortController()
  context.readFileState.clear()
  context.contentReplacementState.clear()
}

export function addMessage(context: AgentContext, message: Message): void {
  context.messages.push(message)
}

export function getMessages(context: AgentContext): Message[] {
  return [...context.messages]
}

export function abort(context: AgentContext): void {
  context.abortController.abort()
}

export function isAborted(context: AgentContext): boolean {
  return context.abortController.signal.aborted
}
