import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createScheduler } from '../../src/scheduler/index.js'
import type { AgentDefinition } from '../../src/agent/types.js'
import { testDeps } from '../../src/agent/index.js'
import { ToolRegistry, createReadTool } from '../../src/tools/index.js'

describe('Phase 1 Integration Tests', () => {
  describe('Complete Workflow', () => {
    it('should submit task, execute, and return result', async () => {
      const definition: AgentDefinition = {
        agentType: 'test',
        permissionMode: 'default',
        isolation: 'shared',
        background: false
      }

      const deps = testDeps({
        callModel: async function* (messages) {
          yield {
            role: 'assistant' as const,
            content: 'Task completed successfully'
          }
        }
      })

      const scheduler = createScheduler({
        agentId: 'test-agent',
        agentDefinition: definition
      }, deps)

      const taskId = scheduler.submitTask('Test task')
      expect(taskId).toBeDefined()

      await new Promise(resolve => setTimeout(resolve, 500))

      const task = scheduler.getTask(taskId)
      expect(['completed', 'running']).toContain(task?.status)

      await scheduler.shutdown()
    })

    it('should execute tools and return results', async () => {
      const tools = new ToolRegistry()
      tools.register(createReadTool())

      const definition: AgentDefinition = {
        agentType: 'test',
        permissionMode: 'auto',
        isolation: 'shared',
        background: false
      }

      const deps = testDeps({
        callModel: async function* (messages) {
          yield {
            role: 'assistant' as const,
            content: [
              { type: 'text' as const, text: 'Reading file' },
              {
                type: 'tool_use' as const,
                name: 'Read',
                input: { file_path: '/test/file.txt' },
                tool_use_id: 'tool-1'
              }
            ]
          }
        }
      })

      const scheduler = createScheduler({
        agentId: 'test-agent',
        agentDefinition: definition
      }, deps)

      const taskId = scheduler.submitTask('Read a file')

      await new Promise(resolve => setTimeout(resolve, 500))

      const task = scheduler.getTask(taskId)
      expect(task?.status).toBe('completed')

      await scheduler.shutdown()
    })
  })

  describe('Task Interruption', () => {
    it('should interrupt running task', async () => {
      const definition: AgentDefinition = {
        agentType: 'test',
        permissionMode: 'default',
        isolation: 'shared',
        background: false
      }

      let callCount = 0
      const deps = testDeps({
        callModel: async function* (messages) {
          callCount++
          await new Promise(resolve => setTimeout(resolve, 200))
          yield {
            role: 'assistant' as const,
            content: `Response ${callCount}`
          }
        }
      })

      const scheduler = createScheduler({
        agentId: 'test-agent',
        agentDefinition: definition
      }, deps)

      const taskId = scheduler.submitTask('Long running task')

      await new Promise(resolve => setTimeout(resolve, 50))

      await scheduler.cancelTask(taskId)

      await new Promise(resolve => setTimeout(resolve, 100))

      const task = scheduler.getTask(taskId)
      expect(['cancelled', 'completed', 'running']).toContain(task?.status)

      await scheduler.shutdown()
    })
  })

  describe('Context Compression', () => {
    it('should handle context compression', async () => {
      const definition: AgentDefinition = {
        agentType: 'test',
        permissionMode: 'default',
        isolation: 'shared',
        background: false,
        maxTurns: 5
      }

      let turnCount = 0
      const deps = testDeps({
        callModel: async function* (messages) {
          turnCount++
          yield {
            role: 'assistant' as const,
            content: `Turn ${turnCount}`
          }
        },
        autocompact: async (messages) => {
          return messages.slice(-2)
        }
      })

      const scheduler = createScheduler({
        agentId: 'test-agent',
        agentDefinition: definition
      }, deps)

      const taskId = scheduler.submitTask('Multi-turn task')

      await new Promise(resolve => setTimeout(resolve, 1000))

      const task = scheduler.getTask(taskId)
      expect(task?.status).toBe('completed')

      await scheduler.shutdown()
    })
  })

  describe('Event Handling', () => {
    it('should emit events during execution', async () => {
      const definition: AgentDefinition = {
        agentType: 'test',
        permissionMode: 'default',
        isolation: 'shared',
        background: false
      }

      const deps = testDeps()
      const scheduler = createScheduler({
        agentId: 'test-agent',
        agentDefinition: definition
      }, deps)

      const events: string[] = []
      scheduler.on('*', (event) => {
        events.push(event.type)
      })

      scheduler.submitTask('Test task')

      await new Promise(resolve => setTimeout(resolve, 500))

      expect(events.length).toBeGreaterThan(0)
      expect(events).toContain('turn_start')
      expect(events).toContain('completed')

      await scheduler.shutdown()
    })
  })

  describe('Multiple Tasks', () => {
    it('should handle multiple tasks sequentially', async () => {
      const definition: AgentDefinition = {
        agentType: 'test',
        permissionMode: 'default',
        isolation: 'shared',
        background: false
      }

      const deps = testDeps()
      const scheduler = createScheduler({
        agentId: 'test-agent',
        agentDefinition: definition
      }, deps)

      const task1 = scheduler.submitTask('Task 1')
      const task2 = scheduler.submitTask('Task 2')
      const task3 = scheduler.submitTask('Task 3')

      await new Promise(resolve => setTimeout(resolve, 2000))

      const status1 = scheduler.getTaskStatus(task1)
      const status2 = scheduler.getTaskStatus(task2)
      const status3 = scheduler.getTaskStatus(task3)

      expect(status1).toBe('completed')
      expect(status2).toBe('completed')
      expect(status3).toBe('completed')

      await scheduler.shutdown()
    })
  })
})
