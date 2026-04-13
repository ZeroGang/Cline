import type { AgentId, TaskId } from '../types.js'
import type { Task } from './types.js'
import { AgentMailbox, createAgentMailbox, type AgentMessage } from './mailbox.js'
import { Logger } from '../infrastructure/logging/logger.js'

export interface TaskSplit {
  subtasks: Task[]
  strategy: 'parallel' | 'sequential' | 'dependency'
}

export interface CoordinatorConfig {
  maxSubtasks?: number
  resultTimeout?: number
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxSubtasks: 10,
  resultTimeout: 300000
}

interface SubtaskResult {
  taskId: TaskId
  agentId: AgentId
  result: unknown
  error?: string
  timestamp: number
}

export class Coordinator {
  private mailbox: AgentMailbox
  private config: CoordinatorConfig
  private logger: Logger
  private results: Map<TaskId, SubtaskResult[]> = new Map()
  private pendingTasks: Map<TaskId, { task: Task; agentId: AgentId }[]> = new Map()

  constructor(config: Partial<CoordinatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.mailbox = createAgentMailbox()
    this.logger = new Logger({ source: 'Coordinator' })
  }

  registerAgent(agentId: AgentId): void {
    this.mailbox.register(agentId)
    this.logger.info('Agent registered', { agentId })
  }

  unregisterAgent(agentId: AgentId): void {
    this.mailbox.unregister(agentId)
    this.logger.info('Agent unregistered', { agentId })
  }

  splitTask(task: Task, strategy: 'parallel' | 'sequential' | 'dependency' = 'parallel'): TaskSplit {
    const subtasks: Task[] = []

    if (task.type === 'compound') {
      const parts = this.parseCompoundTask(task)
      for (let i = 0; i < Math.min(parts.length, this.config.maxSubtasks!); i++) {
        const part = parts[i]
        if (!part) continue
        subtasks.push({
          id: `${task.id}-sub-${i}` as TaskId,
          type: 'subtask',
          priority: task.priority,
          status: 'pending',
          prompt: part,
          dependencies: strategy === 'sequential' && i > 0 ? [`${task.id}-sub-${i - 1}` as TaskId] : [],
          retryCount: 0,
          maxRetries: task.maxRetries,
          createdAt: Date.now(),
          metadata: { parentTask: task.id }
        })
      }
    } else {
      subtasks.push({
        ...task,
        id: `${task.id}-sub-0` as TaskId,
        type: 'subtask',
        metadata: { parentTask: task.id }
      })
    }

    this.logger.info('Task split', { 
      taskId: task.id, 
      subtaskCount: subtasks.length, 
      strategy 
    })

    return { subtasks, strategy }
  }

  private parseCompoundTask(task: Task): string[] {
    const parts: string[] = []
    const lines = task.prompt.split('\n')
    let currentPart = ''

    for (const line of lines) {
      if (line.trim().match(/^[-*]\s/) && currentPart) {
        parts.push(currentPart.trim())
        currentPart = line + '\n'
      } else {
        currentPart += line + '\n'
      }
    }

    if (currentPart.trim()) {
      parts.push(currentPart.trim())
    }

    return parts.length > 0 ? parts : [task.prompt]
  }

  assignTask(task: Task, agentId: AgentId): void {
    const message: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      from: 'coordinator' as AgentId,
      to: agentId,
      type: 'task',
      taskId: task.id,
      payload: task,
      timestamp: Date.now()
    }

    this.mailbox.send(message)

    if (!this.pendingTasks.has(task.id)) {
      this.pendingTasks.set(task.id, [])
    }
    this.pendingTasks.get(task.id)!.push({ task, agentId })

    this.logger.info('Task assigned', { taskId: task.id, agentId })
  }

  collectResult(taskId: TaskId, agentId: AgentId, result: unknown, error?: string): void {
    const subtaskResult: SubtaskResult = {
      taskId,
      agentId,
      result,
      error,
      timestamp: Date.now()
    }

    if (!this.results.has(taskId)) {
      this.results.set(taskId, [])
    }
    this.results.get(taskId)!.push(subtaskResult)

    const pending = this.pendingTasks.get(taskId)
    if (pending) {
      const index = pending.findIndex(p => p.agentId === agentId)
      if (index >= 0) {
        pending.splice(index, 1)
      }
    }

    this.logger.info('Result collected', { taskId, agentId, hasError: !!error })
  }

  mergeResults(taskId: TaskId): unknown {
    const results = this.results.get(taskId)
    if (!results || results.length === 0) {
      return null
    }

    const merged: {
      taskId: TaskId
      success: boolean
      results: SubtaskResult[]
      summary: string
    } = {
      taskId,
      success: results.every(r => !r.error),
      results,
      summary: `Collected ${results.length} results`
    }

    this.logger.info('Results merged', { 
      taskId, 
      resultCount: results.length, 
      success: merged.success 
    })

    return merged
  }

  getPendingCount(taskId: TaskId): number {
    return this.pendingTasks.get(taskId)?.length ?? 0
  }

  getResultCount(taskId: TaskId): number {
    return this.results.get(taskId)?.length ?? 0
  }

  isComplete(taskId: TaskId): boolean {
    const pending = this.pendingTasks.get(taskId)
    return pending === undefined || pending.length === 0
  }

  broadcast(from: AgentId, type: AgentMessage['type'], payload: unknown): void {
    const message: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      from,
      to: 'broadcast',
      type,
      payload,
      timestamp: Date.now()
    }

    this.mailbox.broadcast(message)
  }

  receiveMessage(agentId: AgentId): AgentMessage | null {
    return this.mailbox.receive(agentId)
  }

  receiveAllMessages(agentId: AgentId): AgentMessage[] {
    return this.mailbox.receiveAll(agentId)
  }

  clearResults(taskId: TaskId): void {
    this.results.delete(taskId)
    this.pendingTasks.delete(taskId)
  }

  clearAll(): void {
    this.results.clear()
    this.pendingTasks.clear()
    this.mailbox.clearAll()
  }
}

export function createCoordinator(config?: Partial<CoordinatorConfig>): Coordinator {
  return new Coordinator(config)
}
