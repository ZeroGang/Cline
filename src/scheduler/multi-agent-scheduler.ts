import type { Task, TaskQueueConfig, AgentEvent } from './types.js'
import type { AgentId, TaskId } from '../types.js'
import type { AgentDefinition, QueryDeps } from '../agent/types.js'
import { TaskQueue, createTaskQueue, createTask } from './queue.js'
import { AgentPool, createAgentPool } from './pool.js'
import { LoadBalancer, createLoadBalancer } from './loadbalancer.js'
import { Coordinator, createCoordinator } from './coordinator.js'
import { Store } from '../infrastructure/state/store.js'
import { DEFAULT_APP_STATE } from '../infrastructure/state/index.js'
import { Logger } from '../infrastructure/logging/logger.js'

export interface MultiAgentSchedulerConfig {
  minAgents: number
  maxAgents: number
  taskQueueConfig?: Partial<TaskQueueConfig>
  loadBalanceStrategy?: 'round-robin' | 'least-loaded' | 'priority-based'
  agentDefinition: AgentDefinition
}

interface AgentInfo {
  id: AgentId
  status: string
  taskCount: number
  currentTaskId?: TaskId
}

export class MultiAgentScheduler {
  private taskQueue: TaskQueue
  private agentPool: AgentPool
  private loadBalancer: LoadBalancer
  private coordinator: Coordinator
  private store: Store<typeof DEFAULT_APP_STATE>
  private logger: Logger
  private deps: QueryDeps
  private agentDefinition: AgentDefinition
  private running = false
  private eventHandlers: Map<string, ((event: AgentEvent) => void)[]> = new Map()
  private agentTaskCount: Map<AgentId, number> = new Map()
  private initialized = false

  constructor(
    config: MultiAgentSchedulerConfig,
    deps: QueryDeps
  ) {
    this.taskQueue = createTaskQueue(config.taskQueueConfig)
    this.store = new Store(DEFAULT_APP_STATE)
    this.logger = new Logger('MultiAgentScheduler')
    this.deps = deps
    this.agentDefinition = config.agentDefinition

    this.agentPool = createAgentPool({
      minAgents: config.minAgents,
      maxAgents: config.maxAgents,
      maxTurnsPerAgent: this.agentDefinition.maxTurns || 100,
      agentTimeout: 300000
    }, deps)

    this.loadBalancer = createLoadBalancer({
      strategy: config.loadBalanceStrategy || 'least-loaded'
    })

    this.coordinator = createCoordinator()
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.agentPool.initialize()

    for (const agent of this.agentPool.getAllAgents()) {
      this.coordinator.registerAgent(agent.id)
      this.agentTaskCount.set(agent.id, 0)
    }

    this.initialized = true
    this.logger.info('MultiAgentScheduler initialized', {
      agentCount: this.agentPool.getPoolSize()
    })
  }

  submitTask(
    prompt: string,
    options?: Partial<Omit<Task, 'id' | 'prompt' | 'status' | 'createdAt'>>
  ): TaskId {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const task = createTask(taskId, prompt, options)

    this.taskQueue.enqueue(task)
    this.logger.info('Task submitted', { taskId, prompt, priority: task.priority })

    if (!this.running) {
      this.start()
    }

    return taskId
  }

  submitCompoundTask(
    prompt: string,
    strategy: 'parallel' | 'sequential' | 'dependency' = 'parallel',
    options?: Partial<Omit<Task, 'id' | 'prompt' | 'status' | 'createdAt'>>
  ): TaskId {
    const taskId = `compound-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const task: Task = {
      id: taskId,
      type: 'compound',
      priority: options?.priority || 'normal',
      status: 'pending',
      prompt,
      dependencies: options?.dependencies || [],
      retryCount: 0,
      maxRetries: options?.maxRetries || 3,
      createdAt: Date.now(),
      metadata: options?.metadata
    }

    this.taskQueue.enqueue(task)
    this.logger.info('Compound task submitted', { taskId, strategy })

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

    if (task.status === 'pending') {
      this.taskQueue.cancel(taskId)
      this.logger.info('Pending task cancelled', { taskId })
    } else if (task.status === 'running') {
      const agents = this.agentPool.getAllAgents()
      for (const agent of agents) {
        if (agent.status === 'busy') {
          await agent.interrupt()
        }
      }
      this.taskQueue.cancel(taskId)
      this.logger.info('Running task cancelled', { taskId })
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

  getAgentPoolSize(): number {
    return this.agentPool.getPoolSize()
  }

  getAvailableAgentCount(): number {
    return this.agentPool.getAvailableCount()
  }

  setLoadBalanceStrategy(strategy: 'round-robin' | 'least-loaded' | 'priority-based'): void {
    this.loadBalancer.setStrategy(strategy)
    this.logger.info('Load balance strategy changed', { strategy })
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
    await this.agentPool.shutdown()
    this.coordinator.clearAll()
    this.logger.info('MultiAgentScheduler shutdown complete')
  }

  private start(): void {
    if (this.running) return
    this.running = true
    this.runLoop()
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      const pendingTasks = this.taskQueue.getPending()
      const runningTasks = this.taskQueue.getRunning()

      if (pendingTasks.length === 0 && runningTasks.length === 0) {
        await this.sleep(100)
        continue
      }

      const agents = this.getAgentInfos()

      const assignment = this.loadBalancer.assign(pendingTasks, agents)

      if (!assignment) {
        await this.sleep(100)
        continue
      }

      const { task, agent: agentId } = assignment

      const agent = this.agentPool.getAgent(agentId)
      if (!agent) {
        await this.sleep(100)
        continue
      }

      const dequeuedTask = this.taskQueue.dequeue()
      if (!dequeuedTask || dequeuedTask.id !== task.id) {
        await this.sleep(100)
        continue
      }

      this.executeTaskOnAgent(dequeuedTask, agent)
    }
  }

  private async executeTaskOnAgent(task: Task, agent: any): Promise<void> {
    this.logger.info('Executing task on agent', {
      taskId: task.id,
      agentId: agent.id
    })

    const taskCount = this.agentTaskCount.get(agent.id) || 0
    this.agentTaskCount.set(agent.id, taskCount + 1)

    try {
      for await (const event of agent.execute(task)) {
        this.handleAgentEvent(event, agent.id)
      }

      this.taskQueue.complete(task.id)
      this.coordinator.collectResult(task.id, agent.id, { success: true })
      this.logger.info('Task completed', { taskId: task.id, agentId: agent.id })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.taskQueue.fail(task.id, errorMessage)
      this.coordinator.collectResult(task.id, agent.id, null, errorMessage)
      this.logger.error('Task failed', {
        taskId: task.id,
        agentId: agent.id,
        error: errorMessage
      })
    } finally {
      this.agentTaskCount.set(agent.id, Math.max(0, (this.agentTaskCount.get(agent.id) || 1) - 1))
    }
  }

  private getAgentInfos(): AgentInfo[] {
    const agents = this.agentPool.getAllAgents()
    return agents.map(agent => ({
      id: agent.id,
      status: agent.status,
      taskCount: this.agentTaskCount.get(agent.id) || 0
    }))
  }

  private handleAgentEvent(event: AgentEvent, agentId: AgentId): void {
    this.logger.debug('Agent event', {
      type: event.type,
      taskId: event.taskId,
      agentId
    })

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
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export function createMultiAgentScheduler(
  config: MultiAgentSchedulerConfig,
  deps: QueryDeps
): MultiAgentScheduler {
  return new MultiAgentScheduler(config, deps)
}
