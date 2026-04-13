import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { 
  SubagentExecutor, 
  createSubagentExecutor,
  createChildAbortController,
  createSubagentContext
} from '../../src/agent/subagent.js'
import type { AgentContext, AgentDefinition, QueryDeps } from '../../src/agent/types.js'
import type { Task } from '../../src/scheduler/types.js'
import { ToolRegistry } from '../../src/tools/registry.js'
import { Store } from '../../src/infrastructure/state/store.js'
import { DEFAULT_APP_STATE } from '../../src/infrastructure/state/index.js'
import { createDefaultPermissionSystem } from '../../src/permissions/system.js'

const createMockParentContext = (): AgentContext => ({
  messages: [],
  abortController: new AbortController(),
  tools: new ToolRegistry(),
  permissionSystem: createDefaultPermissionSystem('default'),
  setAppState: () => {},
  readFileState: new Map(),
  contentReplacementState: new Map(),
  toolPermissionContext: {
    mode: 'default',
    sessionId: 'parent-session'
  },
  mcpTools: [],
  store: new Store(DEFAULT_APP_STATE)
})

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

const createMockTask = (id: string): Task => ({
  id,
  type: 'single',
  priority: 'medium',
  status: 'pending',
  prompt: 'Test task',
  dependencies: [],
  retryCount: 0,
  maxRetries: 3,
  createdAt: Date.now()
})

describe('createChildAbortController', () => {
  it('should create child abort controller', () => {
    const parent = new AbortController()
    const child = createChildAbortController(parent)

    expect(child).toBeInstanceOf(AbortController)
    expect(child.signal.aborted).toBe(false)
  })

  it('should abort child when parent aborts', () => {
    const parent = new AbortController()
    const child = createChildAbortController(parent)

    expect(child.signal.aborted).toBe(false)

    parent.abort()

    expect(child.signal.aborted).toBe(true)
  })

  it('should create already aborted child if parent is aborted', () => {
    const parent = new AbortController()
    parent.abort()

    const child = createChildAbortController(parent)

    expect(child.signal.aborted).toBe(true)
  })
})

describe('createSubagentContext', () => {
  it('should create isolated subagent context', () => {
    const parentContext = createMockParentContext()
    const definition: AgentDefinition = {
      agentType: 'test',
      permissionMode: 'default',
      isolation: 'isolated',
      background: false
    }

    const subagentContext = createSubagentContext({
      parentContext,
      definition,
      parentAbortController: parentContext.abortController
    })

    expect(subagentContext.messages).toEqual([])
    expect(subagentContext.abortController).toBeInstanceOf(AbortController)
    expect(subagentContext.tools).toBeInstanceOf(ToolRegistry)
    expect(subagentContext.store).toBeInstanceOf(Store)
  })

  it('should use provided tools if specified', () => {
    const parentContext = createMockParentContext()
    const customTools = new ToolRegistry()
    const definition: AgentDefinition = {
      agentType: 'test',
      permissionMode: 'default',
      isolation: 'isolated',
      background: false
    }

    const subagentContext = createSubagentContext({
      parentContext,
      definition,
      parentAbortController: parentContext.abortController,
      tools: customTools
    })

    expect(subagentContext.tools).toBe(customTools)
  })

  it('should use provided store if specified', () => {
    const parentContext = createMockParentContext()
    const customStore = new Store(DEFAULT_APP_STATE)
    const definition: AgentDefinition = {
      agentType: 'test',
      permissionMode: 'default',
      isolation: 'isolated',
      background: false
    }

    const subagentContext = createSubagentContext({
      parentContext,
      definition,
      parentAbortController: parentContext.abortController,
      store: customStore
    })

    expect(subagentContext.store).toBe(customStore)
  })

  it('should cascade abort from parent', () => {
    const parentContext = createMockParentContext()
    const definition: AgentDefinition = {
      agentType: 'test',
      permissionMode: 'default',
      isolation: 'isolated',
      background: false
    }

    const subagentContext = createSubagentContext({
      parentContext,
      definition,
      parentAbortController: parentContext.abortController
    })

    expect(subagentContext.abortController.signal.aborted).toBe(false)

    parentContext.abortController.abort()

    expect(subagentContext.abortController.signal.aborted).toBe(true)
  })
})

describe('SubagentExecutor', () => {
  let executor: SubagentExecutor
  let parentContext: AgentContext
  let deps: QueryDeps
  let definition: AgentDefinition

  beforeEach(() => {
    parentContext = createMockParentContext()
    deps = createMockDeps()
    definition = {
      agentType: 'test',
      permissionMode: 'default',
      isolation: 'isolated',
      background: false,
      maxTurns: 5
    }
    executor = createSubagentExecutor(definition, parentContext, deps)
  })

  afterEach(async () => {
    await executor.interruptAll()
  })

  describe('executeSync', () => {
    it('should execute task synchronously', async () => {
      const task = createMockTask('test-task-1')

      const result = await executor.executeSync(task)

      expect(result.taskId).toBe('test-task-1')
      expect(result.agentId).toBeDefined()
      expect(result.events).toBeInstanceOf(Array)
    })

    it('should track active subagent during execution', async () => {
      const task = createMockTask('test-task-2')

      expect(executor.getActiveCount()).toBe(0)

      await executor.executeSync(task)

      expect(executor.getActiveCount()).toBe(0)
    })

    it('should store result after execution', async () => {
      const task = createMockTask('test-task-3')

      expect(executor.hasResult('test-task-3')).toBe(false)

      await executor.executeSync(task)

      expect(executor.hasResult('test-task-3')).toBe(true)
    })
  })

  describe('executeAsync', () => {
    it('should execute task asynchronously', () => {
      const task = createMockTask('test-task-4')

      const taskId = executor.executeAsync(task)

      expect(taskId).toBe('test-task-4')
    })

    it('should return taskId immediately', () => {
      const task = createMockTask('test-task-5')

      const startTime = Date.now()
      const taskId = executor.executeAsync(task)
      const endTime = Date.now()

      expect(taskId).toBe('test-task-5')
      expect(endTime - startTime).toBeLessThan(100)
    })
  })

  describe('getResult', () => {
    it('should return undefined for unknown task', () => {
      const result = executor.getResult('unknown-task')
      expect(result).toBeUndefined()
    })

    it('should return result after sync execution', async () => {
      const task = createMockTask('test-task-6')
      await executor.executeSync(task)

      const result = executor.getResult('test-task-6')
      expect(result).toBeDefined()
      expect(result?.taskId).toBe('test-task-6')
    })
  })

  describe('interrupt', () => {
    it('should interrupt active subagent', async () => {
      const task = createMockTask('test-task-7')

      executor.executeAsync(task)

      await new Promise(resolve => setTimeout(resolve, 10))

      await executor.interrupt('test-task-7')
    })
  })

  describe('interruptAll', () => {
    it('should interrupt all active subagents', async () => {
      executor.executeAsync(createMockTask('test-task-8'))
      executor.executeAsync(createMockTask('test-task-9'))

      await new Promise(resolve => setTimeout(resolve, 10))

      await executor.interruptAll()
    })
  })

  describe('clearResults', () => {
    it('should clear all results', async () => {
      const task = createMockTask('test-task-10')
      await executor.executeSync(task)

      expect(executor.hasResult('test-task-10')).toBe(true)

      executor.clearResults()

      expect(executor.hasResult('test-task-10')).toBe(false)
    })
  })
})
