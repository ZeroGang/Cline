import { describe, it, expect, beforeEach } from 'vitest'
import { 
  ContextManager, 
  CircuitBreaker, 
  createContextManager,
  DEFAULT_CONTEXT_CONFIG
} from '../../src/agent/context-manager.js'
import { createMockMessage, createMockToolResult } from '../../src/agent/deps.js'

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker

  beforeEach(() => {
    breaker = new CircuitBreaker(3, 1000)
  })

  it('should allow execution initially', () => {
    expect(breaker.canExecute()).toBe(true)
  })

  it('should allow execution after failures below threshold', () => {
    breaker.recordFailure()
    breaker.recordFailure()
    expect(breaker.canExecute()).toBe(true)
  })

  it('should block execution after threshold failures', () => {
    breaker.recordFailure()
    breaker.recordFailure()
    breaker.recordFailure()
    expect(breaker.canExecute()).toBe(false)
  })

  it('should allow execution after reset time', async () => {
    breaker.recordFailure()
    breaker.recordFailure()
    breaker.recordFailure()
    expect(breaker.canExecute()).toBe(false)
    
    await new Promise(resolve => setTimeout(resolve, 1100))
    expect(breaker.canExecute()).toBe(true)
  })

  it('should reset on success', () => {
    breaker.recordFailure()
    breaker.recordFailure()
    breaker.recordSuccess()
    expect(breaker.getFailureCount()).toBe(0)
  })

  it('should reset manually', () => {
    breaker.recordFailure()
    breaker.recordFailure()
    breaker.recordFailure()
    breaker.reset()
    expect(breaker.canExecute()).toBe(true)
    expect(breaker.getFailureCount()).toBe(0)
  })
})

describe('ContextManager', () => {
  let manager: ContextManager

  beforeEach(() => {
    manager = createContextManager({
      maxToolResultSize: 100,
      maxContextSize: 1000,
      snipThreshold: 0.9,
      microCompactThreshold: 0.8,
      collapseThreshold: 0.85,
      autoCompactThreshold: 0.95
    })
  })

  describe('applyToolResultBudget', () => {
    it('should not truncate small results', () => {
      const result = 'small result'
      expect(manager.applyToolResultBudget(result)).toBe(result)
    })

    it('should truncate large results', () => {
      const result = 'x'.repeat(200)
      const truncated = manager.applyToolResultBudget(result)
      expect(truncated.length).toBeLessThanOrEqual(120)
      expect(truncated).toContain('truncated')
    })
  })

  describe('estimateTokenCount', () => {
    it('should estimate tokens for string content', () => {
      const messages = [createMockMessage('user', 'hello world')]
      const count = manager.estimateTokenCount(messages)
      expect(count).toBeGreaterThan(0)
    })

    it('should estimate tokens for content blocks', () => {
      const messages = [createMockToolResult('tool-1', 'result content')]
      const count = manager.estimateTokenCount(messages)
      expect(count).toBeGreaterThan(0)
    })
  })

  describe('snipCompactIfNeeded', () => {
    it('should not compact small messages', () => {
      const messages = [
        createMockMessage('user', 'hello'),
        createMockMessage('assistant', 'hi')
      ]
      const result = manager.snipCompactIfNeeded(messages)
      expect(result.length).toBe(2)
    })

    it('should compact large messages', () => {
      const messages: ReturnType<typeof createMockMessage>[] = []
      for (let i = 0; i < 100; i++) {
        messages.push(createMockMessage('user', 'x'.repeat(50)))
      }
      
      const result = manager.snipCompactIfNeeded(messages)
      expect(result.length).toBeLessThan(messages.length)
    })
  })

  describe('microCompact', () => {
    it('should keep string messages unchanged', () => {
      const messages = [createMockMessage('user', 'hello')]
      const result = manager.microCompact(messages)
      expect(result).toEqual(messages)
    })

    it('should truncate large tool results', () => {
      const largeContent = 'x'.repeat(15000)
      const messages = [createMockToolResult('tool-1', largeContent)]
      const result = manager.microCompact(messages)
      
      const block = (result[0]?.content as Array<{ content: string }>)[0]
      expect(block?.content.length).toBeLessThan(largeContent.length)
      expect(block?.content).toContain('truncated')
    })
  })

  describe('applyCollapsesIfNeeded', () => {
    it('should collapse multiple tool results', () => {
      const messages = [
        createMockToolResult('tool-1', 'result1'),
        createMockToolResult('tool-2', 'result2'),
        createMockToolResult('tool-3', 'result3'),
        createMockToolResult('tool-4', 'result4')
      ]
      
      const result = manager.applyCollapsesIfNeeded(messages)
      expect(result.length).toBe(1)
      expect((result[0]?.content as string)).toContain('collapsed')
    })

    it('should not collapse few tool results', () => {
      const messages = [
        createMockToolResult('tool-1', 'result1'),
        createMockToolResult('tool-2', 'result2')
      ]
      
      const result = manager.applyCollapsesIfNeeded(messages)
      expect(result.length).toBe(2)
    })
  })

  describe('autoCompact', () => {
    it('should not compact small messages', async () => {
      const messages = [createMockMessage('user', 'hello')]
      const compactFn = async (m: typeof messages) => m
      
      const result = await manager.autoCompact(messages, compactFn)
      expect(result).toEqual(messages)
    })

    it('should use circuit breaker on failure', async () => {
      const messages: ReturnType<typeof createMockMessage>[] = []
      for (let i = 0; i < 100; i++) {
        messages.push(createMockMessage('user', 'x'.repeat(50)))
      }
      
      const compactFn = async () => {
        throw new Error('Compact failed')
      }
      
      const result = await manager.autoCompact(messages, compactFn)
      expect(result.length).toBeLessThan(messages.length)
      expect(manager.getCircuitBreaker().getFailureCount()).toBe(1)
    })
  })

  describe('applyContextPipeline', () => {
    it('should apply all compression layers', async () => {
      const messages = [
        createMockMessage('user', 'hello'),
        createMockMessage('assistant', 'hi')
      ]
      
      const result = await manager.applyContextPipeline(messages)
      expect(result.length).toBe(2)
    })

    it('should use custom compact function for large context', async () => {
      const messages: ReturnType<typeof createMockMessage>[] = []
      for (let i = 0; i < 100; i++) {
        messages.push(createMockMessage('user', 'x'.repeat(50)))
      }
      
      const compactFn = async () => [
        createMockMessage('system', 'compacted')
      ]
      
      const result = await manager.applyContextPipeline(messages, compactFn)
      expect(result[0]?.content).toBe('compacted')
    })
  })

  describe('getConfig', () => {
    it('should return config copy', () => {
      const config = manager.getConfig()
      expect(config).toEqual({
        maxToolResultSize: 100,
        maxContextSize: 1000,
        snipThreshold: 0.9,
        microCompactThreshold: 0.8,
        collapseThreshold: 0.85,
        autoCompactThreshold: 0.95
      })
    })
  })
})

describe('createContextManager', () => {
  it('should create manager with default config', () => {
    const manager = createContextManager()
    expect(manager.getConfig()).toEqual(DEFAULT_CONTEXT_CONFIG)
  })

  it('should create manager with custom config', () => {
    const manager = createContextManager({ maxToolResultSize: 500 })
    expect(manager.getConfig().maxToolResultSize).toBe(500)
  })
})
