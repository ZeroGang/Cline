import type { Task, TaskQueueConfig } from './types.js'
import type { TaskId, TaskPriority, TaskStatus } from '../types.js'
import { DependencyResolver, createDependencyResolver } from './dependency.js'

const DEFAULT_QUEUE_CONFIG: TaskQueueConfig = {
  maxConcurrent: 10,
  defaultPriority: 'medium'
}

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
}

export class TaskQueue {
  private queue: Task[] = []
  private running: Map<TaskId, Task> = new Map()
  private completed: Map<TaskId, Task> = new Map()
  private config: TaskQueueConfig
  private dependencyResolver: DependencyResolver

  constructor(config: Partial<TaskQueueConfig> = {}) {
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config }
    this.dependencyResolver = createDependencyResolver()
  }

  enqueue(task: Task): void {
    if (this.queue.find(t => t.id === task.id)) {
      throw new Error(`Task ${task.id} already exists in queue`)
    }

    if (this.running.has(task.id)) {
      throw new Error(`Task ${task.id} is already running`)
    }

    const taskMap = this.getAllTasksMap()
    if (this.dependencyResolver.hasCircularDependency(task, taskMap)) {
      throw new Error(`Task ${task.id} has circular dependencies`)
    }

    const newTask: Task = {
      ...task,
      status: 'pending',
      createdAt: task.createdAt || Date.now()
    }

    this.queue.push(newTask)
    this.sortQueue()
  }

  dequeue(): Task | null {
    if (this.queue.length === 0) {
      return null
    }

    if (this.running.size >= this.config.maxConcurrent) {
      return null
    }

    const completedIds = new Set<TaskId>(this.completed.keys())

    for (let i = 0; i < this.queue.length; i++) {
      const task = this.queue[i]
      if (!task) continue

      if (!this.dependencyResolver.areDependenciesMet(task, completedIds)) {
        continue
      }

      this.queue.splice(i, 1)

      const runningTask: Task = {
        ...task,
        status: 'running',
        startedAt: Date.now()
      }

      this.running.set(task.id, runningTask)
      return runningTask
    }

    return null
  }

  /**
   * 仅将指定 id 的排队任务移入 running（依赖、并发上限与 dequeue 一致）。
   * 用于「已指定 Agent」的调度路径，避免与队首 dequeue 错配。
   */
  claimPendingById(taskId: TaskId): Task | null {
    if (this.running.size >= this.config.maxConcurrent) {
      return null
    }

    const completedIds = new Set<TaskId>(this.completed.keys())
    const idx = this.queue.findIndex((t) => t.id === taskId)
    if (idx === -1) {
      return null
    }

    const task = this.queue[idx]
    if (!task) {
      return null
    }

    if (!this.dependencyResolver.areDependenciesMet(task, completedIds)) {
      return null
    }

    this.queue.splice(idx, 1)

    const runningTask: Task = {
      ...task,
      status: 'running',
      startedAt: Date.now()
    }

    this.running.set(task.id, runningTask)
    return runningTask
  }

  complete(taskId: TaskId, result?: unknown): void {
    const task = this.running.get(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} is not running`)
    }

    const completedTask: Task = {
      ...task,
      status: 'completed',
      completedAt: Date.now(),
      result
    }

    this.running.delete(taskId)
    this.completed.set(taskId, completedTask)
  }

  fail(taskId: TaskId, error: string): void {
    const task = this.running.get(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} is not running`)
    }

    const failedTask: Task = {
      ...task,
      status: 'failed',
      completedAt: Date.now(),
      error
    }

    this.running.delete(taskId)
    this.completed.set(taskId, failedTask)
  }

  retry(taskId: TaskId): void {
    const task = this.completed.get(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} is not in completed queue`)
    }

    if (task.retryCount >= task.maxRetries) {
      throw new Error(`Task ${taskId} has reached max retries`)
    }

    const retryTask: Task = {
      ...task,
      status: 'pending',
      retryCount: task.retryCount + 1,
      startedAt: undefined,
      completedAt: undefined,
      error: undefined
    }

    this.completed.delete(taskId)
    this.queue.push(retryTask)
    this.sortQueue()
  }

  cancel(taskId: TaskId): void {
    const queueIndex = this.queue.findIndex(t => t.id === taskId)
    if (queueIndex !== -1) {
      const task = this.queue[queueIndex]
      if (task) {
        const cancelledTask: Task = {
          ...task,
          status: 'cancelled',
          completedAt: Date.now()
        }
        this.queue.splice(queueIndex, 1)
        this.completed.set(taskId, cancelledTask)
      }
      return
    }

    const runningTask = this.running.get(taskId)
    if (runningTask) {
      const cancelledTask: Task = {
        ...runningTask,
        status: 'cancelled',
        completedAt: Date.now()
      }
      this.running.delete(taskId)
      this.completed.set(taskId, cancelledTask)
      return
    }

    throw new Error(`Task ${taskId} not found`)
  }

  getPending(): Task[] {
    return [...this.queue]
  }

  getRunning(): Task[] {
    return Array.from(this.running.values())
  }

  getCompleted(): Task[] {
    return Array.from(this.completed.values())
  }

  /** 供 API / 控制台：待办、运行中、已结束（含失败、取消）全量列表 */
  getAllTasks(): Task[] {
    return [...this.queue, ...this.running.values(), ...this.completed.values()]
  }

  getTask(taskId: TaskId): Task | undefined {
    const queueTask = this.queue.find(t => t.id === taskId)
    if (queueTask) return queueTask

    const runningTask = this.running.get(taskId)
    if (runningTask) return runningTask

    return this.completed.get(taskId)
  }

  getTaskStatus(taskId: TaskId): TaskStatus | undefined {
    const task = this.getTask(taskId)
    return task?.status
  }

  size(): number {
    return this.queue.length
  }

  runningCount(): number {
    return this.running.size
  }

  completedCount(): number {
    return this.completed.size
  }

  clear(): void {
    this.queue = []
    this.running.clear()
    this.completed.clear()
  }

  /**
   * 从待办或已结束集合中移除任务（运行中不可删，避免与调度循环竞态）。
   * @returns 是否成功移除
   */
  removeTask(taskId: TaskId): boolean {
    const qi = this.queue.findIndex((t) => t.id === taskId)
    if (qi !== -1) {
      this.queue.splice(qi, 1)
      return true
    }
    if (this.running.has(taskId)) {
      return false
    }
    if (this.completed.has(taskId)) {
      this.completed.delete(taskId)
      return true
    }
    return false
  }

  /**
   * 将仍为 pending 的任务直接标记为已完成并移入 completed（用于控制台「Done」等）。
   */
  resolvePendingAsCompleted(taskId: TaskId): Task | undefined {
    const qi = this.queue.findIndex((t) => t.id === taskId)
    if (qi === -1) return undefined
    const task = this.queue[qi]
    if (!task || (task.status !== 'pending' && task.status !== 'waiting')) return undefined
    this.queue.splice(qi, 1)
    const done: Task = {
      ...task,
      status: 'completed',
      completedAt: Date.now(),
    }
    this.completed.set(taskId, done)
    return done
  }

  updatePriority(taskId: TaskId, priority: TaskPriority): void {
    const queueTask = this.queue.find(t => t.id === taskId)
    if (queueTask) {
      queueTask.priority = priority
      this.sortQueue()
      return
    }

    const runningTask = this.running.get(taskId)
    if (runningTask) {
      runningTask.priority = priority
      return
    }

    const completedTask = this.completed.get(taskId)
    if (completedTask) {
      completedTask.priority = priority
      return
    }

    throw new Error(`Task ${taskId} not found`)
  }

  getTasksByPriority(priority: TaskPriority): Task[] {
    const tasks: Task[] = []

    for (const task of this.queue) {
      if (task.priority === priority) {
        tasks.push(task)
      }
    }

    for (const task of this.running.values()) {
      if (task.priority === priority) {
        tasks.push(task)
      }
    }

    return tasks
  }

  getPriorityStats(): Record<TaskPriority, { pending: number; running: number; completed: number }> {
    const stats: Record<TaskPriority, { pending: number; running: number; completed: number }> = {
      critical: { pending: 0, running: 0, completed: 0 },
      high: { pending: 0, running: 0, completed: 0 },
      medium: { pending: 0, running: 0, completed: 0 },
      low: { pending: 0, running: 0, completed: 0 }
    }

    for (const task of this.queue) {
      stats[task.priority].pending++
    }

    for (const task of this.running.values()) {
      stats[task.priority].running++
    }

    for (const task of this.completed.values()) {
      stats[task.priority].completed++
    }

    return stats
  }

  getAllTasksMap(): Map<TaskId, Task> {
    const taskMap = new Map<TaskId, Task>()

    for (const task of this.queue) {
      taskMap.set(task.id, task)
    }

    for (const [id, task] of this.running) {
      taskMap.set(id, task)
    }

    for (const [id, task] of this.completed) {
      taskMap.set(id, task)
    }

    return taskMap
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]
      if (priorityDiff !== 0) return priorityDiff
      return a.createdAt - b.createdAt
    })
  }
}

export function createTaskQueue(config?: Partial<TaskQueueConfig>): TaskQueue {
  return new TaskQueue(config)
}

export function createTask(
  id: TaskId,
  prompt: string,
  options: Partial<Omit<Task, 'id' | 'prompt' | 'status' | 'createdAt'>> = {}
): Task {
  return {
    id,
    type: options.type || 'default',
    priority: options.priority || 'medium',
    status: 'pending',
    prompt,
    dependencies: options.dependencies || [],
    retryCount: options.retryCount || 0,
    maxRetries: options.maxRetries || 3,
    createdAt: Date.now(),
    metadata: options.metadata
  }
}
