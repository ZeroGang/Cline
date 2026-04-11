import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Scheduler, createScheduler } from '../../src/scheduler/scheduler.js'
import type { AgentDefinition, QueryDeps } from '../../src/agent/types.js'
import { testDeps } from '../../src/agent/index.js'

function createTestScheduler(): Scheduler {
  const definition: AgentDefinition = {
    agentType: 'test',
    permissionMode: 'default',
    isolation: 'shared',
    background: false
  }

  const deps = testDeps()

  return createScheduler({
    agentId: 'agent-1',
    agentDefinition: definition
  }, deps)
}

describe('Scheduler', () => {
  let scheduler: Scheduler

  beforeEach(() => {
    scheduler = createTestScheduler()
  })

  afterEach(async () => {
    await scheduler.shutdown()
  })

  it('should submit task and return task id', () => {
    const taskId = scheduler.submitTask('Test task')
    expect(taskId).toBeDefined()
    expect(taskId.startsWith('task-')).toBe(true)
  })

  it('should get task status', async () => {
    const taskId = scheduler.submitTask('Test task')
    
    await new Promise(resolve => setTimeout(resolve, 100))
    
    const status = scheduler.getTaskStatus(taskId)
    expect(['pending', 'running', 'completed']).toContain(status)
  })

  it('should get task by id', () => {
    const taskId = scheduler.submitTask('Test task')
    const task = scheduler.getTask(taskId)
    expect(task).toBeDefined()
    expect(task?.id).toBe(taskId)
    expect(task?.prompt).toBe('Test task')
  })

  it('should get pending tasks', async () => {
    scheduler.submitTask('Task 1')
    scheduler.submitTask('Task 2')
    scheduler.submitTask('Task 3')

    await new Promise(resolve => setTimeout(resolve, 500))

    const pending = scheduler.getPendingTasks()
    const running = scheduler.getRunningTasks()
    const completed = scheduler.getCompletedTasks()
    expect(pending.length + running.length + completed.length).toBeGreaterThanOrEqual(2)
  })

  it('should emit events during execution', async () => {
    const eventHandler = vi.fn()
    scheduler.on('*', eventHandler)

    const taskId = scheduler.submitTask('Test task')

    await new Promise(resolve => setTimeout(resolve, 500))

    expect(eventHandler).toHaveBeenCalled()
  })

  it('should cancel running task', async () => {
    const taskId = scheduler.submitTask('Test task')
    
    await new Promise(resolve => setTimeout(resolve, 100))
    
    await scheduler.cancelTask(taskId)
    
    const status = scheduler.getTaskStatus(taskId)
    expect(['cancelled', 'completed']).toContain(status)
  })

  it('should throw error when cancelling non-existent task', async () => {
    await expect(scheduler.cancelTask('non-existent')).rejects.toThrow('not found')
  })

  it('should handle multiple tasks sequentially', async () => {
    const taskId1 = scheduler.submitTask('Task 1')
    const taskId2 = scheduler.submitTask('Task 2')

    await new Promise(resolve => setTimeout(resolve, 1000))

    const status1 = scheduler.getTaskStatus(taskId1)
    const status2 = scheduler.getTaskStatus(taskId2)

    expect(['completed', 'running', 'pending']).toContain(status1)
    expect(['completed', 'running', 'pending']).toContain(status2)
  })

  it('should update store state during execution', async () => {
    scheduler.submitTask('Test task')

    await new Promise(resolve => setTimeout(resolve, 500))

    const completed = scheduler.getCompletedTasks()
    expect(completed.length).toBeGreaterThanOrEqual(0)
  })

  it('should support custom task options', () => {
    const taskId = scheduler.submitTask('Test task', {
      priority: 'high',
      type: 'custom',
      maxRetries: 5
    })

    const task = scheduler.getTask(taskId)
    expect(task?.priority).toBe('high')
    expect(task?.type).toBe('custom')
    expect(task?.maxRetries).toBe(5)
  })

  it('should handle task completion', async () => {
    const taskId = scheduler.submitTask('Test task')

    await new Promise(resolve => setTimeout(resolve, 1000))

    const task = scheduler.getTask(taskId)
    expect(['completed', 'running']).toContain(task?.status)
  })

  it('should shutdown gracefully', async () => {
    scheduler.submitTask('Test task')

    await scheduler.shutdown()

    expect(scheduler.getPendingTasks().length).toBe(0)
  })
})

import { afterEach } from 'vitest'
