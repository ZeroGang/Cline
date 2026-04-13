import { describe, it, expect, beforeEach } from 'vitest'
import { DependencyResolver, createDependencyResolver } from '../../src/scheduler/dependency.js'
import { TaskQueue, createTaskQueue, createTask } from '../../src/scheduler/queue.js'
import type { Task, TaskId } from '../../src/scheduler/types.js'

describe('DependencyResolver', () => {
  let resolver: DependencyResolver

  beforeEach(() => {
    resolver = createDependencyResolver()
  })

  describe('hasCircularDependency', () => {
    it('should return false for task without dependencies', () => {
      const task: Task = {
        id: 'task-1',
        type: 'default',
        priority: 'normal',
        status: 'pending',
        prompt: 'Test task',
        dependencies: [],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const taskMap = new Map<TaskId, Task>()
      taskMap.set(task.id, task)

      expect(resolver.hasCircularDependency(task, taskMap)).toBe(false)
    })

    it('should return false for valid dependency chain', () => {
      const task1: Task = {
        id: 'task-1',
        type: 'default',
        priority: 'normal',
        status: 'pending',
        prompt: 'Test task 1',
        dependencies: [],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const task2: Task = {
        id: 'task-2',
        type: 'default',
        priority: 'normal',
        status: 'pending',
        prompt: 'Test task 2',
        dependencies: ['task-1'],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const taskMap = new Map<TaskId, Task>()
      taskMap.set('task-1', task1)
      taskMap.set('task-2', task2)

      expect(resolver.hasCircularDependency(task2, taskMap)).toBe(false)
    })

    it('should return true for circular dependency', () => {
      const task1: Task = {
        id: 'task-1',
        type: 'default',
        priority: 'normal',
        status: 'pending',
        prompt: 'Test task 1',
        dependencies: ['task-2'],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const task2: Task = {
        id: 'task-2',
        type: 'default',
        priority: 'normal',
        status: 'pending',
        prompt: 'Test task 2',
        dependencies: ['task-1'],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const taskMap = new Map<TaskId, Task>()
      taskMap.set('task-1', task1)
      taskMap.set('task-2', task2)

      expect(resolver.hasCircularDependency(task1, taskMap)).toBe(true)
    })

    it('should return true for longer circular dependency', () => {
      const task1: Task = {
        id: 'task-1',
        type: 'default',
        priority: 'normal',
        status: 'pending',
        prompt: 'Test task 1',
        dependencies: ['task-3'],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const task2: Task = {
        id: 'task-2',
        type: 'default',
        priority: 'normal',
        status: 'pending',
        prompt: 'Test task 2',
        dependencies: ['task-1'],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const task3: Task = {
        id: 'task-3',
        type: 'default',
        priority: 'normal',
        status: 'pending',
        prompt: 'Test task 3',
        dependencies: ['task-2'],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const taskMap = new Map<TaskId, Task>()
      taskMap.set('task-1', task1)
      taskMap.set('task-2', task2)
      taskMap.set('task-3', task3)

      expect(resolver.hasCircularDependency(task1, taskMap)).toBe(true)
    })
  })

  describe('areDependenciesMet', () => {
    it('should return true for task without dependencies', () => {
      const task: Task = {
        id: 'task-1',
        type: 'default',
        priority: 'normal',
        status: 'pending',
        prompt: 'Test task',
        dependencies: [],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const completed = new Set<TaskId>()
      expect(resolver.areDependenciesMet(task, completed)).toBe(true)
    })

    it('should return false if dependencies not completed', () => {
      const task: Task = {
        id: 'task-2',
        type: 'default',
        priority: 'normal',
        status: 'pending',
        prompt: 'Test task',
        dependencies: ['task-1'],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const completed = new Set<TaskId>()
      expect(resolver.areDependenciesMet(task, completed)).toBe(false)
    })

    it('should return true if all dependencies completed', () => {
      const task: Task = {
        id: 'task-2',
        type: 'default',
        priority: 'normal',
        status: 'pending',
        prompt: 'Test task',
        dependencies: ['task-1', 'task-0'],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const completed = new Set<TaskId>(['task-0', 'task-1'])
      expect(resolver.areDependenciesMet(task, completed)).toBe(true)
    })

    it('should return false if some dependencies not completed', () => {
      const task: Task = {
        id: 'task-3',
        type: 'default',
        priority: 'normal',
        status: 'pending',
        prompt: 'Test task',
        dependencies: ['task-1', 'task-2'],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const completed = new Set<TaskId>(['task-1'])
      expect(resolver.areDependenciesMet(task, completed)).toBe(false)
    })
  })

  describe('getExecutionOrder', () => {
    it('should return tasks in correct order', () => {
      const task1: Task = {
        id: 'task-1',
        type: 'default',
        priority: 'normal',
        status: 'pending',
        prompt: 'Test task 1',
        dependencies: [],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const task2: Task = {
        id: 'task-2',
        type: 'default',
        priority: 'normal',
        status: 'pending',
        prompt: 'Test task 2',
        dependencies: ['task-1'],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const task3: Task = {
        id: 'task-3',
        type: 'default',
        priority: 'normal',
        status: 'pending',
        prompt: 'Test task 3',
        dependencies: ['task-2'],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const order = resolver.getExecutionOrder([task3, task2, task1])

      expect(order[0].id).toBe('task-1')
      expect(order[1].id).toBe('task-2')
      expect(order[2].id).toBe('task-3')
    })
  })

  describe('findMissingDependencies', () => {
    it('should return empty array for no missing dependencies', () => {
      const task: Task = {
        id: 'task-2',
        type: 'default',
        priority: 'normal',
        status: 'pending',
        prompt: 'Test task',
        dependencies: ['task-1'],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const taskMap = new Map<TaskId, Task>()
      taskMap.set('task-1', { id: 'task-1' } as Task)

      const missing = resolver.findMissingDependencies(task, taskMap)
      expect(missing).toHaveLength(0)
    })

    it('should return missing dependencies', () => {
      const task: Task = {
        id: 'task-3',
        type: 'default',
        priority: 'normal',
        status: 'pending',
        prompt: 'Test task',
        dependencies: ['task-1', 'task-2'],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const taskMap = new Map<TaskId, Task>()
      taskMap.set('task-1', { id: 'task-1' } as Task)

      const missing = resolver.findMissingDependencies(task, taskMap)
      expect(missing).toEqual(['task-2'])
    })
  })
})

describe('TaskQueue with Dependencies', () => {
  let queue: TaskQueue

  beforeEach(() => {
    queue = createTaskQueue()
  })

  describe('enqueue with dependencies', () => {
    it('should enqueue task with valid dependencies', () => {
      queue.enqueue(createTask('task-1', 'Task 1'))
      queue.enqueue(createTask('task-2', 'Task 2', { dependencies: ['task-1'] }))

      expect(queue.size()).toBe(2)
    })

    it('should throw error for circular dependencies', () => {
      queue.enqueue(createTask('task-1', 'Task 1'))

      expect(() => {
        queue.enqueue(createTask('task-2', 'Task 2', { dependencies: ['task-1'] }))
        queue.enqueue(createTask('task-1', 'Task 1 Updated', { dependencies: ['task-2'] }))
      }).toThrow()
    })
  })

  describe('dequeue with dependencies', () => {
    it('should skip task with unmet dependencies', () => {
      queue.enqueue(createTask('task-1', 'Task 1'))
      queue.enqueue(createTask('task-2', 'Task 2', { dependencies: ['task-1'] }))

      const task = queue.dequeue()
      expect(task?.id).toBe('task-1')
    })

    it('should return task when dependencies are met', () => {
      queue.enqueue(createTask('task-1', 'Task 1'))
      queue.enqueue(createTask('task-2', 'Task 2', { dependencies: ['task-1'] }))

      const task1 = queue.dequeue()
      expect(task1?.id).toBe('task-1')

      queue.complete('task-1')

      const task2 = queue.dequeue()
      expect(task2?.id).toBe('task-2')
    })

    it('should return null if all tasks have unmet dependencies', () => {
      queue.enqueue(createTask('task-1', 'Task 1', { dependencies: ['task-0'] }))

      const task = queue.dequeue()
      expect(task).toBeNull()
    })

    it('should respect priority with dependencies', () => {
      queue.enqueue(createTask('task-1', 'Task 1'))
      queue.enqueue(createTask('task-2', 'Task 2', { priority: 'high' }))
      queue.enqueue(createTask('task-3', 'Task 3', { dependencies: ['task-1'] }))

      const first = queue.dequeue()
      expect(first?.id).toBe('task-2')

      const second = queue.dequeue()
      expect(second?.id).toBe('task-1')
    })
  })
})
