import type { AgentId, TaskId, LogLevel, PermissionMode, AgentStatus, TaskStatus, TaskPriority, BackendType } from '../../types.js'

export type DeepImmutable<T> = {
  readonly [P in keyof T]: T[P] extends Function ? T[P] : DeepImmutable<T[P]>
}

export type Subscriber<T> = (state: DeepImmutable<T>) => void
export type Selector<T, R> = (state: DeepImmutable<T>) => R
export type Unsubscribe = () => void

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

export const DEFAULT_APP_STATE: AppState = {
  scheduler: {
    status: 'stopped',
    activeAgents: 0,
    pendingTasks: 0
  },
  tasks: [],
  agents: [],
  logs: [],
  metrics: {
    totalTokens: 0,
    totalCost: 0,
    completedTasks: 0,
    failedTasks: 0
  },
  config: {
    maxAgents: 4,
    defaultBackend: 'in-process',
    permissionMode: 'default'
  },
  permissions: {
    mode: 'default',
    sessionCache: {}
  }
}
