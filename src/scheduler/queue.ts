import type { Task, TaskQueueConfig } from './types.js'
import type { TaskId, TaskPriority, TaskStatus } from '../types.js'
import { DependencyResolver, createDependencyResolver } from './dependency.js'

const DEFAULT_QUEUE_CONFIG: TaskQueueConfig = {
  maxConcurrent: 10,
  defaultPriority: 'normal'
}

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  high: 3,
  normal: 2,
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
      const cancelledTask: Task = {
        ...task,
        status: 'cancelled',
        completedAt: Date.now()
      }
      this.queue.splice(queueIndex, 1)
      this.completed.set(taskId, cancelledTask)
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
      high: { pending: 0, running: 0, completed: 0 },
      normal: { pending: 0, running: 0, completed: 0 },
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
    priority: options.priority || 'normal',
    status: 'pending',
    prompt,
    dependencies: options.dependencies || [],
    retryCount: options.retryCount || 0,
    maxRetries: options.maxRetries || 3,
    createdAt: Date.now(),
    metadata: options.metadata
  }
}
