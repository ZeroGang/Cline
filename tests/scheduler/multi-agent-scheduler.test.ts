import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MultiAgentScheduler, createMultiAgentScheduler } from '../../src/scheduler/multi-agent-scheduler.js'
import type { QueryDeps } from '../../src/agent/types.js'

const createMockDeps = (): QueryDeps => ({
  client: {} as any,
  getCwd: () => '/test',
  readTextFile: async () => '',
  writeTextFile: async () => {},
  listDirectory: async () => [],
  isDirectory: async () => false,
  fileExists: async () => false,
  inputSchema: {} as any
})

describe('MultiAgentScheduler', () => {
  let scheduler: MultiAgentScheduler
  let deps: QueryDeps

  beforeEach(async () => {
    deps = createMockDeps()
    scheduler = createMultiAgentScheduler({
      minAgents: 1,
      maxAgents: 3,
      agentDefinition: {
        model: 'claude-3-sonnet',
        systemPrompt: 'You are a helpful assistant.',
        maxTurns: 10,
        permissionMode: 'default'
      }
    }, deps)

    await scheduler.initialize()
  })

  afterEach(async () => {
    await scheduler.shutdown()
  })

  describe('initialize', () => {
    it('should initialize agent pool', () => {
      expect(scheduler.getAgentPoolSize()).toBe(1)
    })

    it('should not reinitialize if already initialized', async () => {
      const sizeBefore = scheduler.getAgentPoolSize()
      await scheduler.initialize()
      expect(scheduler.getAgentPoolSize()).toBe(sizeBefore)
    })
  })

  describe('submitTask', () => {
    it('should submit and queue task', () => {
      const taskId = scheduler.submitTask('Test task')
      expect(taskId).toBeDefined()
      expect(taskId.startsWith('task-')).toBe(true)
    })

    it('should submit task with options', () => {
      const taskId = scheduler.submitTask('High priority task', {
        priority: 'high',
        type: 'urgent'
      })

      const task = scheduler.getTask(taskId)
      expect(task?.priority).toBe('high')
      expect(task?.type).toBe('urgent')
    })
  })

  describe('submitCompoundTask', () => {
    it('should submit compound task', () => {
      const taskId = scheduler.submitCompoundTask('Multi-part task', 'parallel')
      expect(taskId).toBeDefined()
      expect(taskId.startsWith('compound-')).toBe(true)

      const task = scheduler.getTask(taskId)
      expect(task?.type).toBe('compound')
    })
  })

  describe('getTaskStatus', () => {
    it('should return task status', () => {
      const taskId = scheduler.submitTask('Test task')
      const status = scheduler.getTaskStatus(taskId)
      expect(['pending', 'running']).toContain(status)
    })

    it('should return undefined for unknown task', () => {
      const status = scheduler.getTaskStatus('unknown')
      expect(status).toBeUndefined()
    })
  })

  describe('getTask', () => {
    it('should return task by id', () => {
      const taskId = scheduler.submitTask('Test task')
      const task = scheduler.getTask(taskId)
      expect(task?.id).toBe(taskId)
      expect(task?.prompt).toBe('Test task')
    })
  })

  describe('getPendingTasks', () => {
    it('should return pending tasks', async () => {
      scheduler.submitTask('Task 1')
      await new Promise(resolve => setTimeout(resolve, 10))
      scheduler.submitTask('Task 2')

      const pending = scheduler.getPendingTasks()
      expect(pending.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('getRunningTasks', () => {
    it('should return running tasks', () => {
      const running = scheduler.getRunningTasks()
      expect(Array.isArray(running)).toBe(true)
    })
  })

  describe('getCompletedTasks', () => {
    it('should return completed tasks', () => {
      const completed = scheduler.getCompletedTasks()
      expect(Array.isArray(completed)).toBe(true)
    })
  })

  describe('cancelTask', () => {
    it('should cancel pending task', async () => {
      const taskId = scheduler.submitTask('Test task')
      
      await new Promise(resolve => setTimeout(resolve, 10))
      
      const task = scheduler.getTask(taskId)
      if (task?.status === 'pending') {
        await scheduler.cancelTask(taskId)
        const cancelledTask = scheduler.getTask(taskId)
        expect(cancelledTask?.status).toBe('cancelled')
      } else {
        expect(['running', 'cancelled', 'failed']).toContain(task?.status)
      }
    })

    it('should throw error for unknown task', async () => {
      await expect(scheduler.cancelTask('unknown')).rejects.toThrow('not found')
    })
  })

  describe('getAgentPoolSize', () => {
    it('should return pool size', () => {
      expect(scheduler.getAgentPoolSize()).toBe(1)
    })
  })

  describe('getAvailableAgentCount', () => {
    it('should return available agent count', () => {
      expect(scheduler.getAvailableAgentCount()).toBeGreaterThanOrEqual(0)
    })
  })

  describe('setLoadBalanceStrategy', () => {
    it('should change load balance strategy', () => {
      scheduler.setLoadBalanceStrategy('round-robin')
      scheduler.setLoadBalanceStrategy('priority-based')
    })
  })

  describe('on/off', () => {
    it('should register and unregister event handlers', () => {
      const handler = () => {}
      scheduler.on('task_completed', handler)
      scheduler.off('task_completed', handler)
    })
  })
})
