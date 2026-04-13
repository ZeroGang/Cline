import { describe, it, expect, beforeEach } from 'vitest'
import { InProcessBackend, createInProcessBackend } from '../../src/backend/inprocess.js'
import { BackendSelector, createBackendSelector } from '../../src/backend/selector.js'

describe('InProcessBackend', () => {
  let backend: InProcessBackend

  beforeEach(() => {
    backend = createInProcessBackend()
  })

  describe('isAvailable', () => {
    it('should always be available', async () => {
      const available = await backend.isAvailable()
      expect(available).toBe(true)
    })
  })

  describe('spawn', () => {
    it('should spawn a new agent', async () => {
      await backend.spawn({ agentId: 'agent-1' })

      expect(backend.getAgentCount()).toBe(1)
    })

    it('should throw error if agent already exists', async () => {
      await backend.spawn({ agentId: 'agent-1' })

      await expect(backend.spawn({ agentId: 'agent-1' })).rejects.toThrow('already exists')
    })
  })

  describe('sendMessage', () => {
    it('should send message to agent', async () => {
      await backend.spawn({ agentId: 'agent-1' })

      await backend.sendMessage('agent-1', { type: 'test', payload: { data: 'test' } })

      const isActive = await backend.isActive('agent-1')
      expect(isActive).toBe(true)
    })

    it('should throw error if agent not found', async () => {
      await expect(
        backend.sendMessage('unknown', { type: 'test', payload: {} })
      ).rejects.toThrow('not found')
    })
  })

  describe('terminate', () => {
    it('should terminate agent', async () => {
      await backend.spawn({ agentId: 'agent-1' })
      await backend.terminate('agent-1')

      const isActive = await backend.isActive('agent-1')
      expect(isActive).toBe(false)
    })

    it('should handle unknown agent', async () => {
      await backend.terminate('unknown')
      expect(backend.getAgentCount()).toBe(0)
    })
  })

  describe('isActive', () => {
    it('should return true for active agent', async () => {
      await backend.spawn({ agentId: 'agent-1' })

      const isActive = await backend.isActive('agent-1')
      expect(isActive).toBe(true)
    })

    it('should return false for terminated agent', async () => {
      await backend.spawn({ agentId: 'agent-1' })
      await backend.terminate('agent-1')

      const isActive = await backend.isActive('agent-1')
      expect(isActive).toBe(false)
    })

    it('should return false for unknown agent', async () => {
      const isActive = await backend.isActive('unknown')
      expect(isActive).toBe(false)
    })
  })

  describe('getOutput', () => {
    it('should yield events from agent', async () => {
      await backend.spawn({ agentId: 'agent-1' })
      await backend.sendMessage('agent-1', { type: 'test', payload: {} })

      const events = []
      const generator = backend.getOutput('agent-1')

      const firstEvent = await generator.next()
      if (firstEvent.value) {
        events.push(firstEvent.value)
      }

      await backend.terminate('agent-1')

      expect(events.length).toBeGreaterThan(0)
      expect(events[0].type).toBe('message_received')
    })

    it('should throw error for unknown agent', async () => {
      await expect(async () => {
        for await (const event of backend.getOutput('unknown')) {
          // Should not reach here
        }
      }).rejects.toThrow('not found')
    })
  })

  describe('getActiveAgentCount', () => {
    it('should return correct count', async () => {
      await backend.spawn({ agentId: 'agent-1' })
      await backend.spawn({ agentId: 'agent-2' })

      expect(backend.getActiveAgentCount()).toBe(2)

      await backend.terminate('agent-1')

      expect(backend.getActiveAgentCount()).toBe(1)
    })
  })
})

describe('BackendSelector', () => {
  let selector: BackendSelector

  beforeEach(() => {
    selector = createBackendSelector()
  })

  describe('select', () => {
    it('should select available backend', async () => {
      const backend = await selector.select()
      expect(backend).toBeDefined()
      expect(backend.type).toBeDefined()
    })

    it('should prefer inprocess backend when configured', async () => {
      const inProcessSelector = createBackendSelector({ 
        preferredBackend: 'inprocess' 
      })

      const backend = await inProcessSelector.select()
      expect(backend.type).toBe('inprocess')
    })
  })

  describe('getAvailableBackends', () => {
    it('should return list of available backends', async () => {
      const available = await selector.getAvailableBackends()
      expect(available.length).toBeGreaterThan(0)
      expect(available).toContain('inprocess')
    })
  })

  describe('getBackend', () => {
    it('should return backend by type', () => {
      const backend = selector.getBackend('inprocess')
      expect(backend).toBeDefined()
      expect(backend?.type).toBe('inprocess')
    })

    it('should return undefined for unknown type', () => {
      const backend = selector.getBackend('unknown' as any)
      expect(backend).toBeUndefined()
    })
  })

  describe('setPreferredBackend', () => {
    it('should update preferred backend', async () => {
      selector.setPreferredBackend('inprocess')

      const backend = await selector.select()
      expect(backend.type).toBe('inprocess')
    })
  })
})
