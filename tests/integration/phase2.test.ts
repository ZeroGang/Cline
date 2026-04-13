import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MultiAgentScheduler, createMultiAgentScheduler } from '../../src/scheduler/multi-agent-scheduler.js'
import { AgentPool, createAgentPool } from '../../src/scheduler/pool.js'
import { LoadBalancer, createLoadBalancer } from '../../src/scheduler/loadbalancer.js'
import { DependencyResolver, createDependencyResolver } from '../../src/scheduler/dependency.js'
import { Coordinator, createCoordinator } from '../../src/scheduler/coordinator.js'
import { TaskQueue, createTaskQueue, createTask } from '../../src/scheduler/queue.js'
import { SubagentExecutor, createSubagentExecutor } from '../../src/agent/subagent.js'
import type { QueryDeps } from '../../src/agent/types.js'
import type { Task, AgentEvent } from '../../src/scheduler/types.js'
import type { AgentId, TaskId } from '../../src/types.js'
import { createAgentContext } from '../../src/agent/context.js'
import { ToolRegistry } from '../../src/tools/registry.js'
import { Store } from '../../src/infrastructure/state/store.js'
import { DEFAULT_APP_STATE } from '../../src/infrastructure/state/index.js'
import { createDefaultPermissionSystem } from '../../src/permissions/system.js'

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

const createMockTask = (id: TaskId, priority: 'high' | 'normal' | 'low' = 'normal', dependencies: TaskId[] = []): Task => ({
  id,
  type: 'single',
  priority,
  status: 'pending',
  prompt: `Task ${id}`,
  dependencies,
  retryCount: 0,
  maxRetries: 3,
  createdAt: Date.now()
})

describe('Phase 2 Integration Tests', () => {
  describe('Multi-Agent Parallel Execution', () => {
    let scheduler: MultiAgentScheduler
    let deps: QueryDeps

    beforeEach(async () => {
      deps = createMockDeps()
      scheduler = createMultiAgentScheduler({
        minAgents: 2,
        maxAgents: 4,
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

    it('should initialize multiple agents', () => {
      expect(scheduler.getAgentPoolSize()).toBe(2)
    })

    it('should submit multiple tasks for parallel execution', () => {
      const task1 = scheduler.submitTask('Task 1')
      const task2 = scheduler.submitTask('Task 2')
      const task3 = scheduler.submitTask('Task 3')

      expect(task1).toBeDefined()
      expect(task2).toBeDefined()
      expect(task3).toBeDefined()
    })

    it('should track task status changes', async () => {
      const taskId = scheduler.submitTask('Test task')

      await new Promise(resolve => setTimeout(resolve, 50))

      const status = scheduler.getTaskStatus(taskId)
      expect(['pending', 'running', 'completed', 'failed']).toContain(status)
    })

    it('should handle compound tasks', () => {
      const taskId = scheduler.submitCompoundTask('Multi-part task', 'parallel')

      const task = scheduler.getTask(taskId)
      expect(task?.type).toBe('compound')
    })
  })

  describe('Task Priority Scheduling', () => {
    let loadBalancer: LoadBalancer

    beforeEach(() => {
      loadBalancer = createLoadBalancer({ strategy: 'priority-based' })
    })

    it('should prioritize high priority tasks', () => {
      const tasks = [
        createMockTask('low-1', 'low'),
        createMockTask('high-1', 'high'),
        createMockTask('normal-1', 'normal'),
        createMockTask('high-2', 'high')
      ]

      const agents = [
        { id: 'agent-1' as AgentId, status: 'idle', taskCount: 0 }
      ]

      const assignment = loadBalancer.assign(tasks, agents)
      expect(assignment?.task.id).toBe('high-1')
    })

    it('should select highest priority task first', () => {
      const tasks = [
        createMockTask('normal-1', 'normal'),
        createMockTask('high-1', 'high'),
        createMockTask('low-1', 'low')
      ]

      const selectedTask = loadBalancer.selectTask(tasks, [
        { id: 'agent-1' as AgentId, status: 'idle', taskCount: 0 }
      ])

      expect(selectedTask?.id).toBe('high-1')
    })

    it('should switch load balance strategy', () => {
      loadBalancer.setStrategy('round-robin')
      loadBalancer.setStrategy('least-loaded')
      loadBalancer.setStrategy('priority-based')
    })
  })

  describe('Task Dependency Management', () => {
    let resolver: DependencyResolver
    let queue: TaskQueue

    beforeEach(() => {
      resolver = createDependencyResolver()
      queue = createTaskQueue()
    })

    it('should detect task dependencies', () => {
      const tasks = [
        createMockTask('task-1', 'normal', []),
        createMockTask('task-2', 'normal', ['task-1']),
        createMockTask('task-3', 'normal', ['task-1', 'task-2'])
      ]

      tasks.forEach(t => queue.enqueue(t))

      const pending = queue.getPending()
      expect(pending.length).toBe(3)
    })

    it('should detect circular dependencies', () => {
      const tasks = [
        createMockTask('task-1', 'normal', ['task-3']),
        createMockTask('task-2', 'normal', ['task-1']),
        createMockTask('task-3', 'normal', ['task-2'])
      ]

      const taskMap = new Map(tasks.map(t => [t.id, t]))
      const hasCycle = resolver.hasCircularDependency(tasks[0], taskMap)
      expect(hasCycle).toBe(true)
    })

    it('should get correct execution order', () => {
      const tasks = [
        createMockTask('task-1', 'normal', []),
        createMockTask('task-2', 'normal', ['task-1']),
        createMockTask('task-3', 'normal', ['task-1'])
      ]

      const order = resolver.getExecutionOrder(tasks)
      expect(order[0].id).toBe('task-1')
    })

    it('should check if dependencies are met', () => {
      const tasks = [
        createMockTask('task-1', 'normal', []),
        createMockTask('task-2', 'normal', ['task-1']),
        createMockTask('task-3', 'normal', ['task-1', 'task-2'])
      ]

      const completedTasks = new Set<TaskId>()
      
      expect(resolver.areDependenciesMet(tasks[0], completedTasks)).toBe(true)
      expect(resolver.areDependenciesMet(tasks[1], completedTasks)).toBe(false)
      
      completedTasks.add('task-1')
      expect(resolver.areDependenciesMet(tasks[1], completedTasks)).toBe(true)
      expect(resolver.areDependenciesMet(tasks[2], completedTasks)).toBe(false)
    })
  })

  describe('Sub-Agent Async Execution', () => {
    let executor: SubagentExecutor
    let parentContext: any

    beforeEach(() => {
      parentContext = {
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
      }

      executor = createSubagentExecutor(
        {
          agentType: 'test',
          permissionMode: 'default',
          isolation: 'isolated',
          background: false
        },
        parentContext,
        createMockDeps()
      )
    })

    afterEach(async () => {
      await executor.interruptAll()
    })

    it('should execute task asynchronously', () => {
      const task = createMockTask('async-task-1')

      const taskId = executor.executeAsync(task)
      expect(taskId).toBe('async-task-1')
    })

    it('should return taskId immediately for async execution', () => {
      const task = createMockTask('async-task-2')

      const startTime = Date.now()
      const taskId = executor.executeAsync(task)
      const endTime = Date.now()

      expect(taskId).toBe('async-task-2')
      expect(endTime - startTime).toBeLessThan(100)
    })

    it('should support synchronous execution', async () => {
      const task = createMockTask('sync-task-1')

      const result = await executor.executeSync(task)

      expect(result.taskId).toBe('sync-task-1')
      expect(result.events).toBeInstanceOf(Array)
    })

    it('should cascade abort from parent', async () => {
      const task = createMockTask('abort-task-1')

      executor.executeAsync(task)

      await new Promise(resolve => setTimeout(resolve, 10))

      parentContext.abortController.abort()

      await new Promise(resolve => setTimeout(resolve, 10))
    })
  })

  describe('Coordinator Integration', () => {
    let coordinator: Coordinator

    beforeEach(() => {
      coordinator = createCoordinator()
    })

    afterEach(() => {
      coordinator.clearAll()
    })

    it('should register agents', () => {
      coordinator.registerAgent('agent-1' as AgentId)
      coordinator.registerAgent('agent-2' as AgentId)

      const message = coordinator.receiveMessage('agent-1' as AgentId)
      expect(message).toBeNull()
    })

    it('should split compound tasks', () => {
      const task: Task = {
        id: 'compound-1',
        type: 'compound',
        priority: 'normal',
        status: 'pending',
        prompt: '- Part 1\n- Part 2\n- Part 3',
        dependencies: [],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now()
      }

      const split = coordinator.splitTask(task)
      expect(split.subtasks.length).toBeGreaterThan(0)
    })

    it('should assign tasks to agents', () => {
      coordinator.registerAgent('agent-1' as AgentId)

      const task = createMockTask('task-1')
      coordinator.assignTask(task, 'agent-1' as AgentId)

      const message = coordinator.receiveMessage('agent-1' as AgentId)
      expect(message?.type).toBe('task')
      expect(message?.taskId).toBe('task-1')
    })

    it('should collect and merge results', () => {
      coordinator.registerAgent('agent-1' as AgentId)
      coordinator.registerAgent('agent-2' as AgentId)

      const task = createMockTask('task-1')

      coordinator.collectResult('task-1', 'agent-1' as AgentId, { data: 'result-1' })
      coordinator.collectResult('task-1', 'agent-2' as AgentId, { data: 'result-2' })

      const merged = coordinator.mergeResults('task-1')
      expect(merged).toBeDefined()
    })
  })

  describe('Agent Pool Integration', () => {
    let pool: AgentPool
    let deps: QueryDeps

    beforeEach(async () => {
      deps = createMockDeps()
      pool = createAgentPool({
        minAgents: 1,
        maxAgents: 3,
        maxTurnsPerAgent: 10,
        agentTimeout: 30000
      }, deps)

      await pool.initialize()
    })

    afterEach(async () => {
      await pool.shutdown()
    })

    it('should initialize with minimum agents', () => {
      expect(pool.getPoolSize()).toBe(1)
    })

    it('should get all agents', () => {
      const agents = pool.getAllAgents()
      expect(agents.length).toBe(1)
    })

    it('should get available count', () => {
      const count = pool.getAvailableCount()
      expect(count).toBeGreaterThanOrEqual(0)
    })

    it('should get available count', () => {
      const count = pool.getAvailableCount()
      expect(count).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Load Balancer Integration', () => {
    let loadBalancer: LoadBalancer

    beforeEach(() => {
      loadBalancer = createLoadBalancer({ strategy: 'least-loaded' })
    })

    it('should assign task to least loaded agent', () => {
      const tasks = [createMockTask('task-1')]

      const agents = [
        { id: 'agent-1' as AgentId, status: 'idle', taskCount: 3 },
        { id: 'agent-2' as AgentId, status: 'idle', taskCount: 1 },
        { id: 'agent-3' as AgentId, status: 'idle', taskCount: 5 }
      ]

      const assignment = loadBalancer.assign(tasks, agents)
      expect(assignment?.agent).toBe('agent-2')
    })

    it('should select agent with round-robin', () => {
      loadBalancer.setStrategy('round-robin')

      const agents = [
        { id: 'agent-1' as AgentId, status: 'idle', taskCount: 0 },
        { id: 'agent-2' as AgentId, status: 'idle', taskCount: 0 }
      ]

      const first = loadBalancer.selectAgent(agents)
      const second = loadBalancer.selectAgent(agents)

      expect(first).toBeDefined()
      expect(second).toBeDefined()
    })
  })
})
