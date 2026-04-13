import { describe, it, expect, beforeEach } from 'vitest'
import { 
  LoadBalancer, 
  createLoadBalancer, 
  RoundRobinStrategy, 
  LeastLoadedStrategy, 
  PriorityBasedStrategy 
} from '../../src/scheduler/loadbalancer.js'
import type { Task } from '../../src/scheduler/types.js'
import type { AgentId } from '../../src/types.js'

const createMockTask = (id: string, priority: 'high' | 'medium' | 'low' = 'medium'): Task => ({
  id,
  type: 'default',
  priority,
  status: 'pending',
  prompt: `Task ${id}`,
  dependencies: [],
  retryCount: 0,
  maxRetries: 3,
  createdAt: Date.now()
})

const createMockAgent = (id: string, status: string = 'idle', taskCount: number = 0) => ({
  id: id as AgentId,
  status,
  taskCount
})

describe('RoundRobinStrategy', () => {
  let strategy: RoundRobinStrategy

  beforeEach(() => {
    strategy = new RoundRobinStrategy()
  })

  describe('select', () => {
    it('should return null for empty tasks', () => {
      const agents = [createMockAgent('agent-1')]
      expect(strategy.select([], agents)).toBeNull()
    })

    it('should return null for no available agents', () => {
      const tasks = [createMockTask('task-1')]
      const agents = [createMockAgent('agent-1', 'busy')]
      expect(strategy.select(tasks, agents)).toBeNull()
    })

    it('should return first task when available', () => {
      const tasks = [createMockTask('task-1'), createMockTask('task-2')]
      const agents = [createMockAgent('agent-1')]
      
      const task = strategy.select(tasks, agents)
      expect(task?.id).toBe('task-1')
    })
  })

  describe('selectAgent', () => {
    it('should rotate through agents', () => {
      const agents = [createMockAgent('agent-1'), createMockAgent('agent-2'), createMockAgent('agent-3')]

      const agent1 = strategy.selectAgent(agents)
      const agent2 = strategy.selectAgent(agents)
      const agent3 = strategy.selectAgent(agents)
      const agent4 = strategy.selectAgent(agents)

      expect(agent1).not.toBe(agent2)
      expect(agent2).not.toBe(agent3)
      expect(agent3).not.toBe(agent4)
    })

    it('should only select idle agents', () => {
      const agents = [
        createMockAgent('agent-1', 'busy'),
        createMockAgent('agent-2', 'idle'),
        createMockAgent('agent-3', 'busy')
      ]

      const agent = strategy.selectAgent(agents)
      expect(agent).toBe('agent-2')
    })
  })

  describe('reset', () => {
    it('should reset index to 0', () => {
      const agents = [createMockAgent('agent-1'), createMockAgent('agent-2')]
      
      strategy.selectAgent(agents)
      strategy.selectAgent(agents)
      strategy.reset()
      
      const agent = strategy.selectAgent(agents)
      expect(agent).toBe('agent-2')
    })
  })
})

describe('LeastLoadedStrategy', () => {
  let strategy: LeastLoadedStrategy

  beforeEach(() => {
    strategy = new LeastLoadedStrategy()
  })

  describe('selectAgent', () => {
    it('should select agent with least tasks', () => {
      const agents = [
        createMockAgent('agent-1', 'idle', 5),
        createMockAgent('agent-2', 'idle', 2),
        createMockAgent('agent-3', 'idle', 3)
      ]

      const agent = strategy.selectAgent(agents)
      expect(agent).toBe('agent-2')
    })

    it('should handle agents with same task count', () => {
      const agents = [
        createMockAgent('agent-1', 'idle', 2),
        createMockAgent('agent-2', 'idle', 2)
      ]

      const agent = strategy.selectAgent(agents)
      expect(agent).toBeDefined()
    })

    it('should return null for no available agents', () => {
      const agents = [
        createMockAgent('agent-1', 'busy', 0),
        createMockAgent('agent-2', 'busy', 0)
      ]

      expect(strategy.selectAgent(agents)).toBeNull()
    })
  })
})

describe('PriorityBasedStrategy', () => {
  let strategy: PriorityBasedStrategy

  beforeEach(() => {
    strategy = new PriorityBasedStrategy()
  })

  describe('select', () => {
    it('should select highest priority task', () => {
      const tasks = [
        createMockTask('task-1', 'low'),
        createMockTask('task-2', 'high'),
        createMockTask('task-3', 'medium')
      ]
      const agents = [createMockAgent('agent-1')]

      const task = strategy.select(tasks, agents)
      expect(task?.id).toBe('task-2')
    })

    it('should handle tasks with same priority', () => {
      const tasks = [
        createMockTask('task-1', 'high'),
        createMockTask('task-2', 'high')
      ]
      const agents = [createMockAgent('agent-1')]

      const task = strategy.select(tasks, agents)
      expect(task?.priority).toBe('high')
    })
  })
})

describe('LoadBalancer', () => {
  let balancer: LoadBalancer

  beforeEach(() => {
    balancer = createLoadBalancer()
  })

  describe('constructor', () => {
    it('should use least-loaded strategy by default', () => {
      expect(balancer.getStrategyName()).toBe('least-loaded')
    })

    it('should accept custom strategy', () => {
      const customBalancer = createLoadBalancer({ strategy: 'round-robin' })
      expect(customBalancer.getStrategyName()).toBe('round-robin')
    })
  })

  describe('selectTask', () => {
    it('should select task using strategy', () => {
      const tasks = [createMockTask('task-1')]
      const agents = [createMockAgent('agent-1')]

      const task = balancer.selectTask(tasks, agents)
      expect(task?.id).toBe('task-1')
    })
  })

  describe('selectAgent', () => {
    it('should select agent using strategy', () => {
      const agents = [createMockAgent('agent-1')]

      const agent = balancer.selectAgent(agents)
      expect(agent).toBe('agent-1')
    })
  })

  describe('assign', () => {
    it('should assign task to agent', () => {
      const tasks = [createMockTask('task-1')]
      const agents = [createMockAgent('agent-1')]

      const assignment = balancer.assign(tasks, agents)
      expect(assignment?.task.id).toBe('task-1')
      expect(assignment?.agent).toBe('agent-1')
    })

    it('should return null if no task available', () => {
      const agents = [createMockAgent('agent-1')]

      expect(balancer.assign([], agents)).toBeNull()
    })

    it('should return null if no agent available', () => {
      const tasks = [createMockTask('task-1')]
      const agents = [createMockAgent('agent-1', 'busy')]

      expect(balancer.assign(tasks, agents)).toBeNull()
    })
  })

  describe('setStrategy', () => {
    it('should change strategy', () => {
      balancer.setStrategy('priority-based')
      expect(balancer.getStrategyName()).toBe('priority-based')
    })

    it('should affect task selection', () => {
      const tasks = [
        createMockTask('task-1', 'low'),
        createMockTask('task-2', 'high')
      ]
      const agents = [createMockAgent('agent-1')]

      balancer.setStrategy('priority-based')
      const task = balancer.selectTask(tasks, agents)
      expect(task?.id).toBe('task-2')
    })
  })
})
