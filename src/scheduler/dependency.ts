import type { Task, TaskId } from './types.js'

export interface DependencyResolverConfig {
  maxDepth?: number
}

const DEFAULT_CONFIG: DependencyResolverConfig = {
  maxDepth: 100
}

export class DependencyResolver {
  private config: DependencyResolverConfig

  constructor(config: Partial<DependencyResolverConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  hasCircularDependency(task: Task, allTasks: Map<TaskId, Task>): boolean {
    const visited = new Set<TaskId>()
    const recursionStack = new Set<TaskId>()

    return this.detectCycle(task.id, allTasks, visited, recursionStack, 0)
  }

  private detectCycle(
    taskId: TaskId,
    allTasks: Map<TaskId, Task>,
    visited: Set<TaskId>,
    recursionStack: Set<TaskId>,
    depth: number
  ): boolean {
    if (depth > this.config.maxDepth!) {
      return false
    }

    visited.add(taskId)
    recursionStack.add(taskId)

    const task = allTasks.get(taskId)
    if (!task) {
      return false
    }

    for (const depId of task.dependencies) {
      if (!visited.has(depId)) {
        if (this.detectCycle(depId, allTasks, visited, recursionStack, depth + 1)) {
          return true
        }
      } else if (recursionStack.has(depId)) {
        return true
      }
    }

    recursionStack.delete(taskId)
    return false
  }

  areDependenciesMet(task: Task, completedTasks: Set<TaskId>): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true
    }

    return task.dependencies.every(depId => completedTasks.has(depId))
  }

  getDependencies(task: Task, allTasks: Map<TaskId, Task>): Task[] {
    const dependencies: Task[] = []

    for (const depId of task.dependencies) {
      const depTask = allTasks.get(depId)
      if (depTask) {
        dependencies.push(depTask)
      }
    }

    return dependencies
  }

  getDependents(taskId: TaskId, allTasks: Map<TaskId, Task>): Task[] {
    const dependents: Task[] = []

    for (const task of allTasks.values()) {
      if (task.dependencies.includes(taskId)) {
        dependents.push(task)
      }
    }

    return dependents
  }

  getExecutionOrder(tasks: Task[]): Task[] {
    const sorted: Task[] = []
    const visited = new Set<TaskId>()
    const taskMap = new Map<TaskId, Task>()

    for (const task of tasks) {
      taskMap.set(task.id, task)
    }

    const visit = (taskId: TaskId, path: Set<TaskId>): boolean => {
      if (visited.has(taskId)) {
        return true
      }

      if (path.has(taskId)) {
        return false
      }

      const task = taskMap.get(taskId)
      if (!task) {
        return true
      }

      path.add(taskId)

      for (const depId of task.dependencies) {
        if (!visit(depId, path)) {
          return false
        }
      }

      path.delete(taskId)
      visited.add(taskId)
      sorted.push(task)

      return true
    }

    for (const task of tasks) {
      visit(task.id, new Set())
    }

    return sorted
  }

  findMissingDependencies(task: Task, allTasks: Map<TaskId, Task>): TaskId[] {
    const missing: TaskId[] = []

    for (const depId of task.dependencies) {
      if (!allTasks.has(depId)) {
        missing.push(depId)
      }
    }

    return missing
  }
}

export function createDependencyResolver(config?: Partial<DependencyResolverConfig>): DependencyResolver {
  return new DependencyResolver(config)
}
