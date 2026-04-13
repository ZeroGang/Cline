import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { AgentPool, createAgentPool } from '../../src/scheduler/pool.js'
import type { AgentDefinition } from '../../src/agent/types.js'
import { testDeps } from '../../src/agent/index.js'

function createTestPool(minAgents = 1, maxAgents = 3): AgentPool {
  const definition: AgentDefinition = {
    agentType: 'test',
    permissionMode: 'default',
    isolation: 'shared',
    background: false
  }

  const deps = testDeps()

  return createAgentPool({
    minAgents,
    maxAgents,
    agentDefinition: definition
  }, deps)
}

describe('AgentPool', () => {
  let pool: AgentPool

  afterEach(async () => {
    if (pool) {
      await pool.shutdown()
    }
  })

  describe('initialize', () => {
    it('should create minAgents instances', async () => {
      pool = createTestPool(2, 5)
      await pool.initialize()

      expect(pool.getPoolSize()).toBe(2)
    })

    it('should not initialize twice', async () => {
      pool = createTestPool(1, 3)
      await pool.initialize()
      await pool.initialize()

      expect(pool.getPoolSize()).toBe(1)
    })
  })

  describe('acquire', () => {
    it('should return an available agent', async () => {
      pool = createTestPool(1, 3)
      await pool.initialize()

      const agent = await pool.acquire()

      expect(agent).toBeDefined()
      expect(agent?.status).toBe('idle')
    })

    it('should mark agent as in use', async () => {
      pool = createTestPool(1, 3)
      await pool.initialize()

      await pool.acquire()

      expect(pool.getInUseCount()).toBe(1)
      expect(pool.getAvailableCount()).toBe(0)
    })

    it('should create new agent if pool not full', async () => {
      pool = createTestPool(1, 3)
      await pool.initialize()

      const agent1 = await pool.acquire()
      const agent2 = await pool.acquire()

      expect(agent1).toBeDefined()
      expect(agent2).toBeDefined()
      expect(pool.getPoolSize()).toBe(2)
    })

    it('should return null if pool is full', async () => {
      pool = createTestPool(1, 2)
      await pool.initialize()

      await pool.acquire()
      await pool.acquire()
      const agent3 = await pool.acquire()

      expect(agent3).toBeNull()
    })

    it('should auto-initialize if not initialized', async () => {
      pool = createTestPool(1, 3)

      const agent = await pool.acquire()

      expect(agent).toBeDefined()
      expect(pool.getPoolSize()).toBe(1)
    })
  })

  describe('release', () => {
    it('should mark agent as available', async () => {
      pool = createTestPool(1, 3)
      await pool.initialize()

      const agent = await pool.acquire()
      expect(pool.getInUseCount()).toBe(1)

      await pool.release(agent!.id)
      expect(pool.getInUseCount()).toBe(0)
      expect(pool.getAvailableCount()).toBe(1)
    })

    it('should handle unknown agent', async () => {
      pool = createTestPool(1, 3)
      await pool.initialize()

      await pool.release('unknown-agent')
      expect(pool.getPoolSize()).toBe(1)
    })
  })

  describe('terminate', () => {
    it('should remove agent from pool', async () => {
      pool = createTestPool(1, 3)
      await pool.initialize()

      const agent = await pool.acquire()
      const agentId = agent!.id

      await pool.terminate(agentId)

      expect(pool.getPoolSize()).toBe(0)
    })

    it('should dispose agent resources', async () => {
      pool = createTestPool(1, 3)
      await pool.initialize()

      const agent = await pool.acquire()
      const agentId = agent!.id

      await pool.terminate(agentId)

      const disposedAgent = pool.getAgent(agentId)
      expect(disposedAgent).toBeUndefined()
    })
  })

  describe('shutdown', () => {
    it('should dispose all agents', async () => {
      pool = createTestPool(2, 5)
      await pool.initialize()

      expect(pool.getPoolSize()).toBe(2)

      await pool.shutdown()

      expect(pool.getPoolSize()).toBe(0)
    })

    it('should stop shrink timer', async () => {
      pool = createTestPool(1, 3)
      await pool.initialize()

      await pool.shutdown()

      expect(pool.getPoolSize()).toBe(0)
    })
  })

  describe('getAvailableCount', () => {
    it('should return correct count', async () => {
      pool = createTestPool(2, 5)
      await pool.initialize()

      expect(pool.getAvailableCount()).toBe(2)

      await pool.acquire()
      expect(pool.getAvailableCount()).toBe(1)

      await pool.acquire()
      expect(pool.getAvailableCount()).toBe(0)
    })
  })

  describe('getInUseCount', () => {
    it('should return correct count', async () => {
      pool = createTestPool(2, 5)
      await pool.initialize()

      expect(pool.getInUseCount()).toBe(0)

      await pool.acquire()
      expect(pool.getInUseCount()).toBe(1)

      await pool.acquire()
      expect(pool.getInUseCount()).toBe(2)
    })
  })

  describe('getAgent', () => {
    it('should return agent by id', async () => {
      pool = createTestPool(1, 3)
      await pool.initialize()

      const agent = await pool.acquire()
      const found = pool.getAgent(agent!.id)

      expect(found).toBeDefined()
      expect(found?.id).toBe(agent!.id)
    })

    it('should return undefined for unknown agent', async () => {
      pool = createTestPool(1, 3)
      await pool.initialize()

      const found = pool.getAgent('unknown-agent')
      expect(found).toBeUndefined()
    })
  })

  describe('getAllAgents', () => {
    it('should return all agents', async () => {
      pool = createTestPool(2, 5)
      await pool.initialize()

      const agents = pool.getAllAgents()

      expect(agents).toHaveLength(2)
    })
  })

  describe('elastic scaling', () => {
    it('should scale up when needed', async () => {
      pool = createTestPool(1, 3)
      await pool.initialize()

      expect(pool.getPoolSize()).toBe(1)

      await pool.acquire()
      await pool.acquire()

      expect(pool.getPoolSize()).toBe(2)
    })

    it('should respect maxAgents limit', async () => {
      pool = createTestPool(1, 2)
      await pool.initialize()

      await pool.acquire()
      await pool.acquire()
      const agent3 = await pool.acquire()

      expect(agent3).toBeNull()
      expect(pool.getPoolSize()).toBe(2)
    })
  })
})
