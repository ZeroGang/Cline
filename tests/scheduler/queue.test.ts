import { describe, it, expect, beforeEach } from 'vitest'
import { TaskQueue, createTaskQueue, createTask } from '../../src/scheduler/queue.js'

describe('TaskQueue', () => {
  let queue: TaskQueue

  beforeEach(() => {
    queue = createTaskQueue()
  })

  describe('enqueue', () => {
    it('should add task to queue', () => {
      const task = createTask('task-1', 'Test task')
      queue.enqueue(task)

      expect(queue.size()).toBe(1)
      expect(queue.getPending()).toHaveLength(1)
    })

    it('should set status to pending', () => {
      const task = createTask('task-1', 'Test task')
      queue.enqueue(task)

      const pending = queue.getPending()
      expect(pending[0].status).toBe('pending')
    })

    it('should throw error if task already exists', () => {
      const task = createTask('task-1', 'Test task')
      queue.enqueue(task)

      expect(() => queue.enqueue(task)).toThrow('already exists in queue')
    })

    it('should sort by priority', () => {
      const lowTask = createTask('task-1', 'Low task', { priority: 'low' })
      const highTask = createTask('task-2', 'High task', { priority: 'high' })
      const normalTask = createTask('task-3', 'Normal task', { priority: 'normal' })

      queue.enqueue(lowTask)
      queue.enqueue(highTask)
      queue.enqueue(normalTask)

      const pending = queue.getPending()
      expect(pending[0].id).toBe('task-2') // high
      expect(pending[1].id).toBe('task-3') // normal
      expect(pending[2].id).toBe('task-1') // low
    })

    it('should sort by creation time when priority is same', () => {
      const task1 = createTask('task-1', 'Task 1', { priority: 'normal' })
      const task2 = createTask('task-2', 'Task 2', { priority: 'normal' })

      queue.enqueue(task1)
      queue.enqueue(task2)

      const pending = queue.getPending()
      expect(pending[0].id).toBe('task-1')
      expect(pending[1].id).toBe('task-2')
    })
  })

  describe('dequeue', () => {
    it('should return null when queue is empty', () => {
      expect(queue.dequeue()).toBeNull()
    })

    it('should return task and set status to running', () => {
      const task = createTask('task-1', 'Test task')
      queue.enqueue(task)

      const dequeued = queue.dequeue()

      expect(dequeued).not.toBeNull()
      expect(dequeued?.status).toBe('running')
      expect(dequeued?.startedAt).toBeDefined()
      expect(queue.size()).toBe(0)
      expect(queue.runningCount()).toBe(1)
    })

    it('should return null when max concurrent reached', () => {
      const config = { maxConcurrent: 2 }
      const limitedQueue = createTaskQueue(config)

      limitedQueue.enqueue(createTask('task-1', 'Task 1'))
      limitedQueue.enqueue(createTask('task-2', 'Task 2'))
      limitedQueue.enqueue(createTask('task-3', 'Task 3'))

      limitedQueue.dequeue()
      limitedQueue.dequeue()

      expect(limitedQueue.dequeue()).toBeNull()
    })

    it('should return highest priority task', () => {
      queue.enqueue(createTask('task-1', 'Low', { priority: 'low' }))
      queue.enqueue(createTask('task-2', 'High', { priority: 'high' }))

      const dequeued = queue.dequeue()
      expect(dequeued?.id).toBe('task-2')
    })
  })

  describe('complete', () => {
    it('should mark task as completed', () => {
      const task = createTask('task-1', 'Test task')
      queue.enqueue(task)
      queue.dequeue()

      queue.complete('task-1', { result: 'success' })

      expect(queue.runningCount()).toBe(0)
      expect(queue.completedCount()).toBe(1)

      const completed = queue.getCompleted()[0]
      expect(completed.status).toBe('completed')
      expect(completed.result).toEqual({ result: 'success' })
      expect(completed.completedAt).toBeDefined()
    })

    it('should throw error if task not running', () => {
      expect(() => queue.complete('task-1')).toThrow('is not running')
    })
  })

  describe('fail', () => {
    it('should mark task as failed', () => {
      const task = createTask('task-1', 'Test task')
      queue.enqueue(task)
      queue.dequeue()

      queue.fail('task-1', 'Something went wrong')

      expect(queue.runningCount()).toBe(0)
      expect(queue.completedCount()).toBe(1)

      const failed = queue.getCompleted()[0]
      expect(failed.status).toBe('failed')
      expect(failed.error).toBe('Something went wrong')
    })
  })

  describe('retry', () => {
    it('should move failed task back to queue', () => {
      const task = createTask('task-1', 'Test task')
      queue.enqueue(task)
      queue.dequeue()
      queue.fail('task-1', 'Error')

      queue.retry('task-1')

      expect(queue.size()).toBe(1)
      expect(queue.completedCount()).toBe(0)

      const retried = queue.getPending()[0]
      expect(retried.retryCount).toBe(1)
      expect(retried.status).toBe('pending')
    })

    it('should throw error if task not in completed queue', () => {
      expect(() => queue.retry('task-1')).toThrow('not in completed queue')
    })

    it('should throw error if max retries reached', () => {
      const task = createTask('task-1', 'Test task', { maxRetries: 1 })
      queue.enqueue(task)
      queue.dequeue()
      queue.fail('task-1', 'Error')

      queue.retry('task-1')
      queue.dequeue()
      queue.fail('task-1', 'Error')

      expect(() => queue.retry('task-1')).toThrow('max retries')
    })
  })

  describe('cancel', () => {
    it('should cancel pending task', () => {
      const task = createTask('task-1', 'Test task')
      queue.enqueue(task)

      queue.cancel('task-1')

      expect(queue.size()).toBe(0)
      expect(queue.completedCount()).toBe(1)

      const cancelled = queue.getCompleted()[0]
      expect(cancelled.status).toBe('cancelled')
    })

    it('should cancel running task', () => {
      const task = createTask('task-1', 'Test task')
      queue.enqueue(task)
      queue.dequeue()

      queue.cancel('task-1')

      expect(queue.runningCount()).toBe(0)
      expect(queue.completedCount()).toBe(1)

      const cancelled = queue.getCompleted()[0]
      expect(cancelled.status).toBe('cancelled')
    })

    it('should throw error if task not found', () => {
      expect(() => queue.cancel('task-1')).toThrow('not found')
    })
  })

  describe('getTask', () => {
    it('should return task from queue', () => {
      const task = createTask('task-1', 'Test task')
      queue.enqueue(task)

      const found = queue.getTask('task-1')
      expect(found?.id).toBe('task-1')
    })

    it('should return task from running', () => {
      const task = createTask('task-1', 'Test task')
      queue.enqueue(task)
      queue.dequeue()

      const found = queue.getTask('task-1')
      expect(found?.status).toBe('running')
    })

    it('should return task from completed', () => {
      const task = createTask('task-1', 'Test task')
      queue.enqueue(task)
      queue.dequeue()
      queue.complete('task-1')

      const found = queue.getTask('task-1')
      expect(found?.status).toBe('completed')
    })

    it('should return undefined if not found', () => {
      expect(queue.getTask('task-1')).toBeUndefined()
    })
  })

  describe('getTaskStatus', () => {
    it('should return task status', () => {
      const task = createTask('task-1', 'Test task')
      queue.enqueue(task)

      expect(queue.getTaskStatus('task-1')).toBe('pending')
    })

    it('should return undefined if not found', () => {
      expect(queue.getTaskStatus('task-1')).toBeUndefined()
    })
  })

  describe('clear', () => {
    it('should clear all queues', () => {
      queue.enqueue(createTask('task-1', 'Task 1'))
      queue.enqueue(createTask('task-2', 'Task 2'))
      queue.dequeue()
      queue.complete('task-1')

      queue.clear()

      expect(queue.size()).toBe(0)
      expect(queue.runningCount()).toBe(0)
      expect(queue.completedCount()).toBe(0)
    })
  })
})

describe('createTask', () => {
  it('should create task with defaults', () => {
    const task = createTask('task-1', 'Test task')

    expect(task.id).toBe('task-1')
    expect(task.prompt).toBe('Test task')
    expect(task.type).toBe('default')
    expect(task.priority).toBe('normal')
    expect(task.status).toBe('pending')
    expect(task.dependencies).toEqual([])
    expect(task.retryCount).toBe(0)
    expect(task.maxRetries).toBe(3)
    expect(task.createdAt).toBeDefined()
  })

  it('should accept custom options', () => {
    const task = createTask('task-1', 'Test task', {
      type: 'custom',
      priority: 'high',
      dependencies: ['task-0'],
      maxRetries: 5,
      metadata: { key: 'value' }
    })

    expect(task.type).toBe('custom')
    expect(task.priority).toBe('high')
    expect(task.dependencies).toEqual(['task-0'])
    expect(task.maxRetries).toBe(5)
    expect(task.metadata).toEqual({ key: 'value' })
  })
})
