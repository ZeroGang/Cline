import type { AgentId, TaskId, LogLevel, PermissionMode, AgentStatus, TaskStatus, TaskPriority, BackendType } from '../../types.js'

export interface AppState {
  scheduler: {
    status: 'running' | 'paused' | 'stopped'
    activeAgents: number
    pendingTasks: number
  }
  tasks: Array<{
    id: TaskId
    status: TaskStatus
    priority: TaskPriority
    prompt: string
  }>
  agents: Array<{
    id: AgentId
    status: AgentStatus
    currentTaskId: TaskId | null
    backend: BackendType
  }>
  logs: Array<{
    level: LogLevel
    message: string
    source: string
    timestamp: number
  }>
  metrics: {
    totalTokens: number
    totalCost: number
    completedTasks: number
    failedTasks: number
  }
  config: {
    maxAgents: number
    defaultBackend: BackendType
    permissionMode: PermissionMode
  }
  permissions: {
    mode: PermissionMode
    sessionCache: Record<string, 'allow' | 'deny'>
  }
}
