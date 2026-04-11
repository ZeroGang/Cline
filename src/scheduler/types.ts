import type { AgentId, TaskId, TaskPriority, TaskStatus, BackendType } from '../types.js'

export interface Task {
  id: TaskId
  type: string
  priority: TaskPriority
  status: TaskStatus
  prompt: string
  dependencies: TaskId[]
  retryCount: number
  maxRetries: number
  createdAt: number
  startedAt?: number
  completedAt?: number
  error?: string
  result?: unknown
  metadata?: Record<string, unknown>
}

export interface TaskQueueConfig {
  maxConcurrent: number
  defaultPriority: TaskPriority
}

export interface SchedulerConfig {
  maxAgents: number
  minAgents: number
  defaultBackend: BackendType
  taskQueue: TaskQueueConfig
}

export interface AgentMetrics {
  totalTokens: number
  inputTokens: number
  outputTokens: number
  cost: number
  toolCalls: number
  turns: number
}

export interface AgentEvent {
  type: string
  agentId: AgentId
  taskId?: TaskId
  timestamp: number
  data?: unknown
}

export interface SchedulerEvent {
  type: string
  timestamp: number
  data?: unknown
}

export interface LoadBalanceStrategy {
  name: string
  select(tasks: Task[], agents: { id: AgentId; status: string }[]): Task | null
}

export type { AgentId, TaskId, TaskPriority, TaskStatus, BackendType } from '../types.js'
