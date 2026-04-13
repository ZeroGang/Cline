import type { Task, TaskQueueConfig, AgentEvent } from './types.js'
import type { AgentId, TaskId } from '../types.js'
import type { AgentDefinition, QueryDeps } from '../agent/types.js'
import { TaskQueue, createTaskQueue, createTask } from './queue.js'
import { AgentInstanceImpl, createAgentInstance } from '../agent/instance.js'
import { createAgentContext } from '../agent/context.js'
import { ToolRegistry } from '../tools/registry.js'
import { Store } from '../infrastructure/state/store.js'
import { DEFAULT_APP_STATE } from '../infrastructure/state/index.js'
import { Logger } from '../infrastructure/logging/logger.js'

export interface SchedulerConfig {
  agentId: AgentId
  agentDefinition: AgentDefinition
  taskQueueConfig?: Partial<TaskQueueConfig>
}

export class Scheduler {
  private taskQueue: TaskQueue
  private agent: AgentInstanceImpl
  private store: Store<typeof DEFAULT_APP_STATE>
  private logger: Logger
  private running = false
  private currentTaskId: TaskId | null = null
  private eventHandlers: Map<string, ((event: AgentEvent) => void)[]> = new Map()

  constructor(
    config: SchedulerConfig,
    deps: QueryDeps
  ) {
    this.taskQueue = createTaskQueue(config.taskQueueConfig)
    this.store = new Store(DEFAULT_APP_STATE)
    this.logger = new Logger({ source: 'Scheduler' })

    const tools = new ToolRegistry()

    const context = createAgentContext({
      tools,
      permissionMode: config.agentDefinition.permissionMode,
      store: this.store,
      sessionId: config.agentId
    })

    this.agent = createAgentInstance(
      config.agentId,
      config.agentDefinition,
      context,
      deps
    )
  }

  submitTask(prompt: string, options?: Partial<Omit<Task, 'id' | 'prompt' | 'status' | 'createdAt'>>): TaskId {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const task = createTask(taskId, prompt, options)

    this.taskQueue.enqueue(task)
    this.logger.info('Task submitted', { taskId, prompt })

    if (!this.running) {
      this.start()
    }

    return taskId
  }

  async cancelTask(taskId: TaskId): Promise<void> {
    const task = this.taskQueue.getTask(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    if (task.status === 'running' && this.currentTaskId === taskId) {
      await this.agent.interrupt()
      this.logger.info('Task cancelled', { taskId })
    } else if (task.status === 'pending') {
      this.taskQueue.cancel(taskId)
      this.logger.info('Pending task cancelled', { taskId })
    }
  }

  getTaskStatus(taskId: TaskId): string | undefined {
    return this.taskQueue.getTaskStatus(taskId)
  }

  getTask(taskId: TaskId): Task | undefined {
    return this.taskQueue.getTask(taskId)
  }

  getPendingTasks(): Task[] {
    return this.taskQueue.getPending()
  }

  getRunningTasks(): Task[] {
    return this.taskQueue.getRunning()
  }

  getCompletedTasks(): Task[] {
    return this.taskQueue.getCompleted()
  }

  on(eventType: string, handler: (event: AgentEvent) => void): void {
    const handlers = this.eventHandlers.get(eventType) || []
    handlers.push(handler)
    this.eventHandlers.set(eventType, handlers)
  }

  off(eventType: string, handler: (event: AgentEvent) => void): void {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index !== -1) {
        handlers.splice(index, 1)
      }
    }
  }

  async shutdown(): Promise<void> {
    this.running = false

    if (this.currentTaskId) {
      await this.agent.interrupt()
    }

    await this.agent.dispose()
    this.logger.info('Scheduler shutdown complete')
  }

  private async start(): Promise<void> {
    if (this.running) return

    this.running = true
    this.runLoop()
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      const task = this.taskQueue.dequeue()
      if (!task) {
        await this.sleep(100)
        continue
      }

      this.currentTaskId = task.id

      try {
        await this.executeTask(task)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        this.taskQueue.fail(task.id, errorMessage)
        this.logger.error('Task execution failed', { taskId: task.id, error: errorMessage })
      }

      this.currentTaskId = null
    }
  }

  private async executeTask(task: Task): Promise<void> {
    this.logger.info('Executing task', { taskId: task.id })

    try {
      for await (const event of this.agent.execute(task)) {
        this.handleAgentEvent(event)
      }

      this.taskQueue.complete(task.id)
      this.logger.info('Task completed', { taskId: task.id })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.taskQueue.fail(task.id, errorMessage)
      this.logger.error('Task failed', { taskId: task.id, error: errorMessage })
      throw error
    }
  }

  private handleAgentEvent(event: AgentEvent): void {
    this.logger.debug('Agent event', { type: event.type, taskId: event.taskId })

    this.store.setState(state => ({
      ...state,
      agents: {
        ...state.agents,
        [this.agent.id]: {
          id: this.agent.id,
          status: this.agent.status,
          currentTaskId: this.currentTaskId,
          metrics: this.agent.getMetrics()
        }
      }
    }))

    const handlers = this.eventHandlers.get(event.type)
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event)
        } catch (error) {
          this.logger.error('Event handler error', { 
            eventType: event.type, 
            error: error instanceof Error ? error.message : String(error) 
          })
        }
      }
    }

    const allHandlers = this.eventHandlers.get('*')
    if (allHandlers) {
      for (const handler of allHandlers) {
        try {
          handler(event)
        } catch (error) {
          this.logger.error('Event handler error', { 
            eventType: '*', 
            error: error instanceof Error ? error.message : String(error) 
          })
        }
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export function createScheduler(
  config: SchedulerConfig,
  deps: QueryDeps
): Scheduler {
  return new Scheduler(config, deps)
}
