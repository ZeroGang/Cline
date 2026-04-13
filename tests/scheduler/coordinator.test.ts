import { describe, it, expect, beforeEach } from 'vitest'
import { AgentMailbox, createAgentMailbox, type AgentMessage } from '../../src/scheduler/mailbox.js'
import { Coordinator, createCoordinator } from '../../src/scheduler/coordinator.js'
import type { Task } from '../../src/scheduler/types.js'
import type { AgentId } from '../../src/types.js'

const createMockTask = (id: string, prompt: string = 'Test task'): Task => ({
  id,
  type: 'default',
  priority: 'medium',
  status: 'pending',
  prompt,
  dependencies: [],
  retryCount: 0,
  maxRetries: 3,
  createdAt: Date.now()
})

describe('AgentMailbox', () => {
  let mailbox: AgentMailbox

  beforeEach(() => {
    mailbox = createAgentMailbox()
  })

  describe('register', () => {
    it('should register agent mailbox', () => {
      mailbox.register('agent-1' as AgentId)
      expect(mailbox.hasMessages('agent-1' as AgentId)).toBe(false)
    })

    it('should not duplicate registration', () => {
      mailbox.register('agent-1' as AgentId)
      mailbox.register('agent-1' as AgentId)
      expect(mailbox.getMessageCount('agent-1' as AgentId)).toBe(0)
    })
  })

  describe('send and receive', () => {
    it('should send and receive message', () => {
      mailbox.register('agent-1' as AgentId)
      mailbox.register('agent-2' as AgentId)

      const message: AgentMessage = {
        id: 'msg-1',
        from: 'agent-1' as AgentId,
        to: 'agent-2' as AgentId,
        type: 'task',
        payload: { data: 'test' },
        timestamp: Date.now()
      }

      mailbox.send(message)

      expect(mailbox.hasMessages('agent-2' as AgentId)).toBe(true)
      expect(mailbox.getMessageCount('agent-2' as AgentId)).toBe(1)

      const received = mailbox.receive('agent-2' as AgentId)
      expect(received?.id).toBe('msg-1')
      expect(received?.from).toBe('agent-1')
    })

    it('should return null for empty mailbox', () => {
      mailbox.register('agent-1' as AgentId)
      expect(mailbox.receive('agent-1' as AgentId)).toBeNull()
    })

    it('should return null for unknown agent', () => {
      expect(mailbox.receive('unknown' as AgentId)).toBeNull()
    })
  })

  describe('receiveAll', () => {
    it('should receive all messages', () => {
      mailbox.register('agent-1' as AgentId)
      mailbox.register('agent-2' as AgentId)

      mailbox.send({
        id: 'msg-1',
        from: 'agent-1' as AgentId,
        to: 'agent-2' as AgentId,
        type: 'task',
        payload: {},
        timestamp: Date.now()
      })

      mailbox.send({
        id: 'msg-2',
        from: 'agent-1' as AgentId,
        to: 'agent-2' as AgentId,
        type: 'progress',
        payload: {},
        timestamp: Date.now()
      })

      const messages = mailbox.receiveAll('agent-2' as AgentId)
      expect(messages).toHaveLength(2)
      expect(mailbox.getMessageCount('agent-2' as AgentId)).toBe(0)
    })
  })

  describe('broadcast', () => {
    it('should broadcast to all agents except sender', () => {
      mailbox.register('agent-1' as AgentId)
      mailbox.register('agent-2' as AgentId)
      mailbox.register('agent-3' as AgentId)

      const message: AgentMessage = {
        id: 'msg-1',
        from: 'agent-1' as AgentId,
        to: 'broadcast',
        type: 'control',
        payload: { action: 'sync' },
        timestamp: Date.now()
      }

      mailbox.broadcast(message)

      expect(mailbox.getMessageCount('agent-1' as AgentId)).toBe(0)
      expect(mailbox.getMessageCount('agent-2' as AgentId)).toBe(1)
      expect(mailbox.getMessageCount('agent-3' as AgentId)).toBe(1)
    })
  })

  describe('unregister', () => {
    it('should unregister agent mailbox', () => {
      mailbox.register('agent-1' as AgentId)
      mailbox.unregister('agent-1' as AgentId)

      mailbox.send({
        id: 'msg-1',
        from: 'agent-2' as AgentId,
        to: 'agent-1' as AgentId,
        type: 'task',
        payload: {},
        timestamp: Date.now()
      })

      expect(mailbox.getMessageCount('agent-1' as AgentId)).toBe(0)
    })
  })

  describe('clear', () => {
    it('should clear specific mailbox', () => {
      mailbox.register('agent-1' as AgentId)
      mailbox.register('agent-2' as AgentId)

      mailbox.send({
        id: 'msg-1',
        from: 'agent-2' as AgentId,
        to: 'agent-1' as AgentId,
        type: 'task',
        payload: {},
        timestamp: Date.now()
      })

      mailbox.clear('agent-1' as AgentId)
      expect(mailbox.getMessageCount('agent-1' as AgentId)).toBe(0)
    })

    it('should clear all mailboxes', () => {
      mailbox.register('agent-1' as AgentId)
      mailbox.register('agent-2' as AgentId)

      mailbox.send({
        id: 'msg-1',
        from: 'agent-1' as AgentId,
        to: 'agent-2' as AgentId,
        type: 'task',
        payload: {},
        timestamp: Date.now()
      })

      mailbox.clearAll()
      expect(mailbox.getMessageCount('agent-2' as AgentId)).toBe(0)
    })
  })
})

describe('Coordinator', () => {
  let coordinator: Coordinator

  beforeEach(() => {
    coordinator = createCoordinator()
  })

  describe('registerAgent', () => {
    it('should register agent', () => {
      coordinator.registerAgent('agent-1' as AgentId)
      expect(coordinator.receiveMessage('agent-1' as AgentId)).toBeNull()
    })
  })

  describe('splitTask', () => {
    it('should create single subtask for simple task', () => {
      const task = createMockTask('task-1')
      const split = coordinator.splitTask(task)

      expect(split.subtasks).toHaveLength(1)
      expect(split.subtasks[0].type).toBe('subtask')
      expect(split.subtasks[0].metadata?.parentTask).toBe('task-1')
    })

    it('should split compound task', () => {
      const task: Task = {
        id: 'task-1',
        type: 'compound',
        priority: 'medium',
        status: 'pending',
        prompt: '- Task part 1\n- Task part 2\n- Task part 3',
        dependencies: [],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const split = coordinator.splitTask(task)
      expect(split.subtasks.length).toBeGreaterThan(0)
    })

    it('should create sequential dependencies', () => {
      const task: Task = {
        id: 'task-1',
        type: 'compound',
        priority: 'medium',
        status: 'pending',
        prompt: '- Part 1\n- Part 2\n- Part 3',
        dependencies: [],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const split = coordinator.splitTask(task, 'sequential')

      for (let i = 1; i < split.subtasks.length; i++) {
        expect(split.subtasks[i].dependencies).toContain(`${task.id}-sub-${i - 1}`)
      }
    })
  })

  describe('assignTask', () => {
    it('should assign task to agent', () => {
      coordinator.registerAgent('agent-1' as AgentId)

      const task = createMockTask('task-1')
      coordinator.assignTask(task, 'agent-1' as AgentId)

      const message = coordinator.receiveMessage('agent-1' as AgentId)
      expect(message?.type).toBe('task')
      expect(message?.taskId).toBe('task-1')
    })

    it('should track pending tasks', () => {
      coordinator.registerAgent('agent-1' as AgentId)

      const task = createMockTask('task-1')
      coordinator.assignTask(task, 'agent-1' as AgentId)

      expect(coordinator.getPendingCount('task-1')).toBe(1)
    })
  })

  describe('collectResult', () => {
    it('should collect result', () => {
      coordinator.registerAgent('agent-1' as AgentId)

      const task = createMockTask('task-1')
      coordinator.assignTask(task, 'agent-1' as AgentId)
      coordinator.collectResult('task-1', 'agent-1' as AgentId, { success: true })

      expect(coordinator.getResultCount('task-1')).toBe(1)
      expect(coordinator.getPendingCount('task-1')).toBe(0)
    })

    it('should collect error result', () => {
      coordinator.registerAgent('agent-1' as AgentId)

      const task = createMockTask('task-1')
      coordinator.assignTask(task, 'agent-1' as AgentId)
      coordinator.collectResult('task-1', 'agent-1' as AgentId, null, 'Error occurred')

      expect(coordinator.getResultCount('task-1')).toBe(1)
    })
  })

  describe('mergeResults', () => {
    it('should merge results', () => {
      coordinator.registerAgent('agent-1' as AgentId)
      coordinator.registerAgent('agent-2' as AgentId)

      const task = createMockTask('task-1')
      coordinator.assignTask(task, 'agent-1' as AgentId)
      coordinator.assignTask(task, 'agent-2' as AgentId)

      coordinator.collectResult('task-1', 'agent-1' as AgentId, { data: 'result1' })
      coordinator.collectResult('task-1', 'agent-2' as AgentId, { data: 'result2' })

      const merged = coordinator.mergeResults('task-1') as any
      expect(merged.results).toHaveLength(2)
      expect(merged.success).toBe(true)
    })

    it('should return null for no results', () => {
      expect(coordinator.mergeResults('unknown')).toBeNull()
    })
  })

  describe('isComplete', () => {
    it('should return true when no pending tasks', () => {
      expect(coordinator.isComplete('task-1')).toBe(true)
    })

    it('should return false when pending tasks exist', () => {
      coordinator.registerAgent('agent-1' as AgentId)

      const task = createMockTask('task-1')
      coordinator.assignTask(task, 'agent-1' as AgentId)

      expect(coordinator.isComplete('task-1')).toBe(false)
    })

    it('should return true after all results collected', () => {
      coordinator.registerAgent('agent-1' as AgentId)

      const task = createMockTask('task-1')
      coordinator.assignTask(task, 'agent-1' as AgentId)
      coordinator.collectResult('task-1', 'agent-1' as AgentId, {})

      expect(coordinator.isComplete('task-1')).toBe(true)
    })
  })

  describe('broadcast', () => {
    it('should broadcast message to all agents', () => {
      coordinator.registerAgent('agent-1' as AgentId)
      coordinator.registerAgent('agent-2' as AgentId)

      coordinator.broadcast('coordinator' as AgentId, 'control', { action: 'sync' })

      expect(coordinator.receiveMessage('agent-1' as AgentId)).not.toBeNull()
      expect(coordinator.receiveMessage('agent-2' as AgentId)).not.toBeNull()
    })
  })
})
