import type { Task, TaskQueueConfig, AgentEvent } from './types.js'
import type { AgentId, TaskId, TaskPriority, TaskStatus } from '../types.js'
import type { AgentDefinition, QueryDeps } from '../agent/types.js'
import type { AgentInstanceImpl } from '../agent/instance.js'
import { TaskQueue, createTaskQueue, createTask } from './queue.js'
import { AgentPool, createAgentPool } from './pool.js'
import { LoadBalancer, createLoadBalancer } from './loadbalancer.js'
import { Coordinator, createCoordinator } from './coordinator.js'
import { Logger } from '../infrastructure/logging/logger.js'

export interface MultiAgentSchedulerConfig {
  minAgents: number
  maxAgents: number
  taskQueueConfig?: Partial<TaskQueueConfig>
  loadBalanceStrategy?: 'round-robin' | 'least-loaded' | 'priority-based'
  agentDefinition: AgentDefinition
  /**
   * 为 true 时：仅当 `task.metadata.assignAgent` 指向池内当前 **idle** 的 Agent 时才出队执行；
   * 新任务在未分配前会一直保持待办（pending）。
   */
  requireAssignAgentBeforeRun?: boolean
}

/** POST /api/agents 可选字段，用于新建实例的展示与 system 人格 */
export interface SpawnAgentInput {
  displayName?: string
  avatar?: string
  personalityPrompt?: string
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
  private logger: Logger
  private agentDefinition: AgentDefinition
  private readonly requireAssignAgentBeforeRun: boolean
  private running = false
  private eventHandlers: Map<string, ((event: AgentEvent) => void)[]> = new Map()
  private agentTaskCount: Map<AgentId, number> = new Map()
  private initialized = false

  constructor(
    config: MultiAgentSchedulerConfig,
    deps: QueryDeps
  ) {
    this.taskQueue = createTaskQueue(config.taskQueueConfig)
    this.logger = new Logger({ source: 'MultiAgentScheduler' })
    this.agentDefinition = config.agentDefinition
    this.requireAssignAgentBeforeRun = config.requireAssignAgentBeforeRun === true

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
      priority: options?.priority || 'medium',
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

    if (task.status === 'pending' || task.status === 'waiting') {
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

  getAllAgentInstances(): AgentInstanceImpl[] {
    return this.agentPool.getAllAgents()
  }

  getAgentInstance(id: AgentId): AgentInstanceImpl | undefined {
    return this.agentPool.getAgent(id)
  }

  /** 扩容一名 Agent（受 `maxAgents` 限制） */
  async spawnAgent(input?: SpawnAgentInput): Promise<AgentId | null> {
    if (!input) {
      return this.agentPool.spawnExtraAgent()
    }
    const displayName = input.displayName?.trim()
    const avatar = input.avatar?.trim()
    const systemPrompt = input.personalityPrompt?.trim()
    if (!displayName && !avatar && !systemPrompt) {
      return this.agentPool.spawnExtraAgent()
    }
    return this.agentPool.spawnExtraAgent({
      ...(displayName ? { displayName } : {}),
      ...(avatar ? { avatar } : {}),
      ...(systemPrompt ? { systemPrompt } : {}),
    })
  }

  getAvailableAgentCount(): number {
    return this.agentPool.getAvailableCount()
  }

  /** 调度循环是否在跑（与任务状态 running 无关） */
  isScheduleLoopRunning(): boolean {
    return this.running
  }

  pauseScheduling(): void {
    this.running = false
    this.logger.info('Scheduling loop paused')
  }

  resumeScheduling(): void {
    if (this.running) return
    this.running = true
    void this.runLoop()
    this.logger.info('Scheduling loop resumed')
  }

  listTasksForApi(filter?: { status?: TaskStatus; priority?: TaskPriority }): Task[] {
    const all = this.taskQueue.getAllTasks()
    if (!filter) return all
    return all.filter((t) => {
      if (filter.status !== undefined && t.status !== filter.status) return false
      if (filter.priority !== undefined && t.priority !== filter.priority) return false
      return true
    })
  }

  async createTaskForApi(input: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const id = this.submitTask(input.prompt, {
      type: input.type,
      priority: input.priority,
      dependencies: input.dependencies,
      retryCount: input.retryCount,
      maxRetries: input.maxRetries,
      metadata: input.metadata,
    })
    const t = this.taskQueue.getTask(id)
    if (!t) {
      throw new Error('Task creation failed')
    }
    return t
  }

  async updateTaskForApi(id: TaskId, updates: Partial<Task>): Promise<Task | undefined> {
    const t = this.taskQueue.getTask(id)
    if (!t) return undefined

    if (updates.metadata !== undefined) {
      t.metadata = { ...(t.metadata ?? {}), ...updates.metadata }
    }
    if (updates.prompt !== undefined && (t.status === 'pending' || t.status === 'waiting')) {
      t.prompt = updates.prompt
    }
    if (updates.priority !== undefined) {
      this.taskQueue.updatePriority(id, updates.priority)
    }
    if (updates.status !== undefined) {
      const next = updates.status
      if (next === 'cancelled') {
        await this.cancelTask(id)
        return this.taskQueue.getTask(id)
      }
      if (next === 'waiting' && (t.status === 'pending' || t.status === 'waiting')) {
        t.status = 'waiting'
        return t
      }
      if (next === 'completed') {
        if (t.status === 'pending' || t.status === 'waiting') {
          const done = this.taskQueue.resolvePendingAsCompleted(id)
          return done ?? this.taskQueue.getTask(id)
        }
        if (t.status === 'running') {
          try {
            this.taskQueue.complete(id)
          } catch {
            /* 可能与 Agent 并发，保留当前视图 */
          }
          return this.taskQueue.getTask(id)
        }
      }
      if (next === 'running' && (t.status === 'pending' || t.status === 'waiting')) {
        this.taskQueue.updatePriority(id, 'critical')
      }
    }
    return this.taskQueue.getTask(id)
  }

  async deleteTaskForApi(id: TaskId): Promise<boolean> {
    return this.taskQueue.removeTask(id)
  }

  async tryCancelTaskForApi(id: TaskId): Promise<boolean> {
    try {
      await this.cancelTask(id)
      return true
    } catch {
      return false
    }
  }

  getSchedulerStatusForApi(): {
    running: boolean
    totalAgents: number
    activeAgents: number
    idleAgents: number
    queuedTasks: number
    completedTasks: number
    failedTasks: number
  } {
    const completed = this.taskQueue.getCompleted()
    const failed = completed.filter((x) => x.status === 'failed').length
    const succeeded = completed.filter((x) => x.status === 'completed').length
    const cancelled = completed.filter((x) => x.status === 'cancelled').length
    return {
      running: this.running,
      totalAgents: this.agentPool.getPoolSize(),
      activeAgents: this.agentPool.getInUseCount(),
      idleAgents: this.agentPool.getAvailableCount(),
      queuedTasks: this.taskQueue.getPending().length,
      completedTasks: succeeded + cancelled,
      failedTasks: failed,
    }
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

      let task: Task | null = null
      let agentId: AgentId | null = null

      if (this.requireAssignAgentBeforeRun) {
        const candidates = pendingTasks.filter((t) => this.canRunWithAssignedAgent(t, agents))
        const picked = this.loadBalancer.selectTask(candidates, agents)
        if (!picked) {
          await this.sleep(100)
          continue
        }
        const assigned = this.getAssignAgentFromMetadata(picked)
        if (!assigned) {
          await this.sleep(100)
          continue
        }
        task = picked
        agentId = assigned
      } else {
        const assignment = this.loadBalancer.assign(pendingTasks, agents)
        if (!assignment) {
          await this.sleep(100)
          continue
        }
        task = assignment.task
        agentId = assignment.agent
      }

      const agent = this.agentPool.getAgent(agentId)
      if (!agent) {
        await this.sleep(100)
        continue
      }

      const dequeuedTask = this.requireAssignAgentBeforeRun
        ? this.taskQueue.claimPendingById(task.id)
        : this.taskQueue.dequeue()
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

  private getAssignAgentFromMetadata(task: Task): AgentId | null {
    const raw = task.metadata && typeof task.metadata.assignAgent === 'string' ? task.metadata.assignAgent.trim() : ''
    if (!raw) {
      return null
    }
    return raw as AgentId
  }

  /** 任务是否已绑定池内空闲 Agent（且依赖已满足由 claim 时再校验） */
  private canRunWithAssignedAgent(task: Task, agents: AgentInfo[]): boolean {
    if (task.status !== 'pending' && task.status !== 'waiting') {
      return false
    }
    const agentId = this.getAssignAgentFromMetadata(task)
    if (!agentId) {
      return false
    }
    const inst = this.agentPool.getAgent(agentId)
    if (!inst || inst.status !== 'idle') {
      return false
    }
    const info = agents.find((a) => a.id === agentId)
    return Boolean(info && info.status === 'idle')
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
