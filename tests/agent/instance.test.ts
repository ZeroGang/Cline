import { describe, it, expect, beforeEach } from 'vitest'
import { AgentInstanceImpl, createAgentInstance } from '../../src/agent/instance.js'
import type { AgentDefinition, QueryDeps } from '../../src/agent/types.js'
import type { Task } from '../../src/scheduler/types.js'
import { createAgentContext, testDeps } from '../../src/agent/index.js'
import { ToolRegistry } from '../../src/tools/registry.js'
import { PermissionSystem } from '../../src/permissions/system.js'
import { Store } from '../../src/infrastructure/state/store.js'
import { DEFAULT_APP_STATE } from '../../src/infrastructure/state/index.js'

function createTestTask(prompt: string): Task {
  return {
    id: `task-${Date.now()}`,
    type: 'test',
    priority: 'normal',
    status: 'pending',
    prompt,
    dependencies: [],
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now()
  }
}

function createTestInstance(): AgentInstanceImpl {
  const store = new Store(DEFAULT_APP_STATE)
  const tools = new ToolRegistry()
  const permissionSystem = new PermissionSystem({ mode: 'default' })
  
  const context = createAgentContext({
    tools,
    permissionSystem,
    store,
    sessionId: 'test-session'
  })

  const definition: AgentDefinition = {
    agentType: 'test',
    permissionMode: 'default',
    isolation: 'shared',
    background: false
  }

  const deps = testDeps()

  return createAgentInstance('agent-1', definition, context, deps)
}

describe('AgentInstanceImpl', () => {
  let instance: AgentInstanceImpl

  beforeEach(() => {
    instance = createTestInstance()
  })

  it('should initialize with idle status', () => {
    expect(instance.status).toBe('idle')
    expect(instance.currentTaskId).toBeNull()
  })

  it('should have correct id', () => {
    expect(instance.id).toBe('agent-1')
  })

  it('should return initial metrics', () => {
    const metrics = instance.getMetrics()
    expect(metrics).toEqual({
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      toolCalls: 0,
      turns: 0
    })
  })

  it('should execute a task and update status', async () => {
    const task = createTestTask('Test task')
    const events = []

    for await (const event of instance.execute(task)) {
      events.push(event)
    }

    expect(instance.status).toBe('idle')
    expect(instance.currentTaskId).toBeNull()
    expect(events.length).toBeGreaterThan(0)
    expect(events.some(e => e.type === 'completed')).toBe(true)
  })

  it('should set busy status during execution', async () => {
    const task = createTestTask('Test task')
    let statusDuringExecution: string | null = null

    const generator = instance.execute(task)
    
    for await (const event of generator) {
      if (event.type === 'turn_start') {
        statusDuringExecution = instance.status
        break
      }
    }

    expect(statusDuringExecution).toBe('busy')
  })

  it('should update currentTaskId during execution', async () => {
    const task = createTestTask('Test task')
    let taskIdDuringExecution: string | null = null

    const generator = instance.execute(task)
    
    for await (const event of generator) {
      if (event.type === 'turn_start') {
        taskIdDuringExecution = instance.currentTaskId
        break
      }
    }

    expect(taskIdDuringExecution).toBe(task.id)
  })

  it('should update metrics during execution', async () => {
    const task = createTestTask('Test task')

    for await (const event of instance.execute(task)) {
      // Just consume events
    }

    const metrics = instance.getMetrics()
    expect(metrics.turns).toBeGreaterThan(0)
  })

  it('should throw error if executing while busy', async () => {
    const task1 = createTestTask('Task 1')
    const task2 = createTestTask('Task 2')

    const generator1 = instance.execute(task1)
    
    // Start first execution
    await generator1.next()

    // Try to execute second task
    await expect(async () => {
      for await (const event of instance.execute(task2)) {
        // Should not reach here
      }
    }).rejects.toThrow('Agent is already executing a task')
  })

  it('should interrupt execution', async () => {
    const task = createTestTask('Test task')
    const events = []

    const generator = instance.execute(task)
    
    // Start execution
    await generator.next()
    
    // Interrupt
    await instance.interrupt()

    // Continue consuming events
    for await (const event of generator) {
      events.push(event)
    }

    expect(events.some(e => e.type === 'aborted')).toBe(true)
  })

  it('should prevent execution after dispose', async () => {
    await instance.dispose()

    const task = createTestTask('Test task')

    await expect(async () => {
      for await (const event of instance.execute(task)) {
        // Should not reach here
      }
    }).rejects.toThrow('Agent instance has been disposed')
  })

  it('should dispose and clear state', async () => {
    await instance.dispose()

    expect(instance.status).toBe('idle')
    expect(instance.currentTaskId).toBeNull()
  })

  it('should interrupt running task on dispose', async () => {
    const task = createTestTask('Test task')

    const generator = instance.execute(task)
    await generator.next()

    await instance.dispose()

    expect(instance.status).toBe('idle')
  })

  it('should handle multiple sequential executions', async () => {
    const task1 = createTestTask('Task 1')
    const task2 = createTestTask('Task 2')

    // Execute first task
    for await (const event of instance.execute(task1)) {
      // Consume events
    }

    expect(instance.status).toBe('idle')

    // Execute second task
    for await (const event of instance.execute(task2)) {
      // Consume events
    }

    expect(instance.status).toBe('idle')
    const metrics = instance.getMetrics()
    expect(metrics.turns).toBeGreaterThan(0)
  })
})
