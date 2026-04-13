import { describe, it, expect, beforeEach } from 'vitest'
import { EventEmitter, createEventEmitter, type SchedulerEventMap, type AgentEventMap } from '../../src/monitoring/events.js'
import { AgentMonitor, createAgentMonitor, type AgentStatus } from '../../src/monitoring/monitor.js'

describe('EventEmitter', () => {
  let emitter: EventEmitter<SchedulerEventMap>

  beforeEach(() => {
    emitter = createEventEmitter<SchedulerEventMap>()
  })

  describe('on', () => {
    it('should register event listener', () => {
      const callback = () => {}
      const id = emitter.on('scheduler:started', callback)
      
      expect(id).toBeDefined()
      expect(emitter.getListenerCount('scheduler:started')).toBe(1)
    })

    it('should call listener on emit', async () => {
      let called = false
      let receivedData: any = null
      
      emitter.on('scheduler:started', (data) => {
        called = true
        receivedData = data
      })

      await emitter.emit('scheduler:started', { timestamp: new Date() })
      
      expect(called).toBe(true)
      expect(receivedData).toBeDefined()
      expect(receivedData.timestamp).toBeInstanceOf(Date)
    })

    it('should support multiple listeners', async () => {
      let count = 0
      
      emitter.on('scheduler:started', () => count++)
      emitter.on('scheduler:started', () => count++)

      await emitter.emit('scheduler:started', { timestamp: new Date() })
      
      expect(count).toBe(2)
    })
  })

  describe('once', () => {
    it('should register one-time listener', async () => {
      let count = 0
      
      emitter.once('scheduler:started', () => count++)

      await emitter.emit('scheduler:started', { timestamp: new Date() })
      await emitter.emit('scheduler:started', { timestamp: new Date() })
      
      expect(count).toBe(1)
      expect(emitter.getListenerCount('scheduler:started')).toBe(0)
    })
  })

  describe('off', () => {
    it('should remove listener', async () => {
      let called = false
      const id = emitter.on('scheduler:started', () => called = true)
      
      emitter.off(id)
      await emitter.emit('scheduler:started', { timestamp: new Date() })
      
      expect(called).toBe(false)
    })

    it('should return false for non-existent listener', () => {
      const result = emitter.off('non-existent')
      expect(result).toBe(false)
    })
  })

  describe('emit', () => {
    it('should handle async listeners', async () => {
      let value = 0
      
      emitter.on('scheduler:started', async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        value = 42
      })

      await emitter.emit('scheduler:started', { timestamp: new Date() })
      
      expect(value).toBe(42)
    })

    it('should not throw on listener error', async () => {
      emitter.on('scheduler:started', () => {
        throw new Error('test error')
      })

      await expect(
        emitter.emit('scheduler:started', { timestamp: new Date() })
      ).resolves.not.toThrow()
    })
  })

  describe('getListenerCount', () => {
    it('should return total count when no event type specified', () => {
      emitter.on('scheduler:started', () => {})
      emitter.on('scheduler:stopped', () => {})
      
      expect(emitter.getListenerCount()).toBe(2)
    })

    it('should return 0 for non-existent event type', () => {
      expect(emitter.getListenerCount('non-existent')).toBe(0)
    })
  })

  describe('removeAllListeners', () => {
    it('should remove all listeners for specific event', () => {
      emitter.on('scheduler:started', () => {})
      emitter.on('scheduler:stopped', () => {})
      
      emitter.removeAllListeners('scheduler:started')
      
      expect(emitter.getListenerCount('scheduler:started')).toBe(0)
      expect(emitter.getListenerCount('scheduler:stopped')).toBe(1)
    })

    it('should remove all listeners when no event specified', () => {
      emitter.on('scheduler:started', () => {})
      emitter.on('scheduler:stopped', () => {})
      
      emitter.removeAllListeners()
      
      expect(emitter.getListenerCount()).toBe(0)
    })
  })
})

describe('AgentMonitor', () => {
  let schedulerEmitter: EventEmitter<SchedulerEventMap>
  let monitor: AgentMonitor

  beforeEach(() => {
    schedulerEmitter = createEventEmitter<SchedulerEventMap>()
    monitor = createAgentMonitor(schedulerEmitter)
  })

  describe('scheduler events', () => {
    it('should track scheduler started', async () => {
      await schedulerEmitter.emit('scheduler:started', { timestamp: new Date() })
      
      const status = monitor.getSchedulerStatus()
      expect(status.running).toBe(true)
    })

    it('should track scheduler stopped', async () => {
      await schedulerEmitter.emit('scheduler:started', { timestamp: new Date() })
      await schedulerEmitter.emit('scheduler:stopped', { timestamp: new Date() })
      
      const status = monitor.getSchedulerStatus()
      expect(status.running).toBe(false)
    })

    it('should track task queued', async () => {
      await schedulerEmitter.emit('task:queued', { 
        taskId: 'task-1', 
        priority: 1, 
        timestamp: new Date() 
      })
      
      const status = monitor.getSchedulerStatus()
      expect(status.queuedTasks).toBe(1)
    })

    it('should track task completed', async () => {
      await schedulerEmitter.emit('agent:created', { 
        agentId: 'agent-1', 
        timestamp: new Date() 
      })
      await schedulerEmitter.emit('task:queued', { 
        taskId: 'task-1', 
        priority: 1, 
        timestamp: new Date() 
      })
      await schedulerEmitter.emit('task:started', { 
        taskId: 'task-1', 
        agentId: 'agent-1', 
        timestamp: new Date() 
      })
      await schedulerEmitter.emit('task:completed', { 
        taskId: 'task-1', 
        agentId: 'agent-1', 
        duration: 1000, 
        timestamp: new Date() 
      })
      
      const status = monitor.getSchedulerStatus()
      expect(status.completedTasks).toBe(1)
      expect(status.queuedTasks).toBe(0)
    })

    it('should track task failed', async () => {
      await schedulerEmitter.emit('agent:created', { 
        agentId: 'agent-1', 
        timestamp: new Date() 
      })
      await schedulerEmitter.emit('task:started', { 
        taskId: 'task-1', 
        agentId: 'agent-1', 
        timestamp: new Date() 
      })
      await schedulerEmitter.emit('task:failed', { 
        taskId: 'task-1', 
        agentId: 'agent-1', 
        error: 'test error', 
        timestamp: new Date() 
      })
      
      const status = monitor.getSchedulerStatus()
      expect(status.failedTasks).toBe(1)
    })
  })

  describe('agent tracking', () => {
    it('should track agent created', async () => {
      await schedulerEmitter.emit('agent:created', { 
        agentId: 'agent-1', 
        timestamp: new Date() 
      })
      
      const agentStatus = monitor.getAgentStatus('agent-1')
      expect(agentStatus).toBeDefined()
      expect(agentStatus?.status).toBe('idle')
      
      const schedulerStatus = monitor.getSchedulerStatus()
      expect(schedulerStatus.totalAgents).toBe(1)
    })

    it('should track agent destroyed', async () => {
      await schedulerEmitter.emit('agent:created', { 
        agentId: 'agent-1', 
        timestamp: new Date() 
      })
      await schedulerEmitter.emit('agent:destroyed', { 
        agentId: 'agent-1', 
        timestamp: new Date() 
      })
      
      const agentStatus = monitor.getAgentStatus('agent-1')
      expect(agentStatus).toBeUndefined()
      
      const schedulerStatus = monitor.getSchedulerStatus()
      expect(schedulerStatus.totalAgents).toBe(0)
    })

    it('should track agent busy state', async () => {
      await schedulerEmitter.emit('agent:created', { 
        agentId: 'agent-1', 
        timestamp: new Date() 
      })
      await schedulerEmitter.emit('agent:busy', { 
        agentId: 'agent-1', 
        taskId: 'task-1', 
        timestamp: new Date() 
      })
      
      const agentStatus = monitor.getAgentStatus('agent-1')
      expect(agentStatus?.status).toBe('busy')
      expect(agentStatus?.currentTask).toBe('task-1')
      
      const schedulerStatus = monitor.getSchedulerStatus()
      expect(schedulerStatus.activeAgents).toBe(1)
    })

    it('should track agent idle state', async () => {
      await schedulerEmitter.emit('agent:created', { 
        agentId: 'agent-1', 
        timestamp: new Date() 
      })
      await schedulerEmitter.emit('agent:busy', { 
        agentId: 'agent-1', 
        taskId: 'task-1', 
        timestamp: new Date() 
      })
      await schedulerEmitter.emit('agent:idle', { 
        agentId: 'agent-1', 
        timestamp: new Date() 
      })
      
      const agentStatus = monitor.getAgentStatus('agent-1')
      expect(agentStatus?.status).toBe('idle')
      
      const schedulerStatus = monitor.getSchedulerStatus()
      expect(schedulerStatus.idleAgents).toBe(1)
    })
  })

  describe('recent events', () => {
    it('should track recent events', async () => {
      await schedulerEmitter.emit('scheduler:started', { timestamp: new Date() })
      await schedulerEmitter.emit('agent:created', { 
        agentId: 'agent-1', 
        timestamp: new Date() 
      })
      
      const events = monitor.getRecentEvents()
      expect(events.length).toBe(2)
    })

    it('should limit recent events', async () => {
      const limitedMonitor = createAgentMonitor(schedulerEmitter, { maxRecentEvents: 5 })
      
      for (let i = 0; i < 10; i++) {
        await schedulerEmitter.emit('task:queued', { 
          taskId: `task-${i}`, 
          priority: 1, 
          timestamp: new Date() 
        })
      }
      
      const events = limitedMonitor.getRecentEvents()
      expect(events.length).toBe(5)
    })

    it('should filter events by type', async () => {
      await schedulerEmitter.emit('task:queued', { 
        taskId: 'task-1', 
        priority: 1, 
        timestamp: new Date() 
      })
      await schedulerEmitter.emit('agent:created', { 
        agentId: 'agent-1', 
        timestamp: new Date() 
      })
      await schedulerEmitter.emit('task:queued', { 
        taskId: 'task-2', 
        priority: 2, 
        timestamp: new Date() 
      })
      
      const events = monitor.getRecentEventsByType('task:queued')
      expect(events.length).toBe(2)
    })

    it('should clear recent events', async () => {
      await schedulerEmitter.emit('scheduler:started', { timestamp: new Date() })
      
      monitor.clearRecentEvents()
      
      const events = monitor.getRecentEvents()
      expect(events.length).toBe(0)
    })
  })

  describe('agent event listeners', () => {
    it('should track agent query completed', async () => {
      await schedulerEmitter.emit('agent:created', { 
        agentId: 'agent-1', 
        timestamp: new Date() 
      })
      
      const agentEmitter = createEventEmitter<AgentEventMap>()
      monitor.registerAgent('agent-1', agentEmitter)
      
      await agentEmitter.emit('query:completed', { 
        queryId: 'query-1', 
        duration: 1000, 
        tokenUsage: 100, 
        timestamp: new Date() 
      })
      
      const agentStatus = monitor.getAgentStatus('agent-1')
      expect(agentStatus?.totalQueries).toBe(1)
      expect(agentStatus?.totalTokens).toBe(100)
    })
  })

  describe('getAllAgentStatuses', () => {
    it('should return all agent statuses', async () => {
      await schedulerEmitter.emit('agent:created', { 
        agentId: 'agent-1', 
        timestamp: new Date() 
      })
      await schedulerEmitter.emit('agent:created', { 
        agentId: 'agent-2', 
        timestamp: new Date() 
      })
      
      const statuses = monitor.getAllAgentStatuses()
      expect(statuses.length).toBe(2)
    })
  })
})
