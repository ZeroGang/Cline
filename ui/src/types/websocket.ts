import type { TaskCard, TaskStatus } from './task'
import type { AgentStatus, AgentHealth } from './agent'
import type { LogEntry, MetricsData } from './ui'

export type WSEventType =
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'TASK_STATUS_CHANGED'
  | 'AGENT_STATUS_CHANGED'
  | 'LOG_ENTRY'
  | 'METRICS_UPDATED'

export interface WSEventBase {
  type: WSEventType
  timestamp: string
}

export interface TaskCreatedEvent extends WSEventBase {
  type: 'TASK_CREATED'
  payload: TaskCard
}

export interface TaskUpdatedEvent extends WSEventBase {
  type: 'TASK_UPDATED'
  payload: TaskCard
}

export interface TaskStatusChangedEvent extends WSEventBase {
  type: 'TASK_STATUS_CHANGED'
  payload: {
    taskId: string
    newStatus: TaskStatus
    previousStatus: TaskStatus
  }
}

export interface AgentStatusChangedEvent extends WSEventBase {
  type: 'AGENT_STATUS_CHANGED'
  payload: {
    agentId: string
    status: AgentStatus
    health: AgentHealth
  }
}

export interface LogEntryEvent extends WSEventBase {
  type: 'LOG_ENTRY'
  payload: LogEntry
}

export interface MetricsUpdatedEvent extends WSEventBase {
  type: 'METRICS_UPDATED'
  payload: MetricsData
}

export type WSEvent =
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskStatusChangedEvent
  | AgentStatusChangedEvent
  | LogEntryEvent
  | MetricsUpdatedEvent

export type WSConnectionStatus = 'connected' | 'disconnected' | 'reconnecting'
