import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CircuitBreaker, CircuitBreakerManager, circuitBreakerManager } from '../../src/error/circuit-breaker.js'

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker

  beforeEach(() => {
    breaker = new CircuitBreaker('test', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 100,
      resetTimeout: 200
    })
  })

  describe('initial state', () => {
    it('should start in closed state', () => {
      expect(breaker.getState()).toBe('closed')
    })

    it('should have zero failure count', () => {
      const stats = breaker.getStats()
      expect(stats.failureCount).toBe(0)
      expect(stats.successCount).toBe(0)
    })
  })

  describe('closed state', () => {
    it('should execute operation successfully', async () => {
      const operation = vi.fn().mockResolvedValue('success')
      
      const result = await breaker.execute(operation)
      
      expect(result).toBe('success')
      expect(breaker.getState()).toBe('closed')
    })

    it('should count failures', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('fail'))
      
      await expect(breaker.execute(operation)).rejects.toThrow()
      await expect(breaker.execute(operation)).rejects.toThrow()
      
      const stats = breaker.getStats()
      expect(stats.failureCount).toBe(2)
      expect(breaker.getState()).toBe('closed')
    })

    it('should open after threshold failures', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('fail'))
      
      await expect(breaker.execute(operation)).rejects.toThrow()
      await expect(breaker.execute(operation)).rejects.toThrow()
      await expect(breaker.execute(operation)).rejects.toThrow()
      
      expect(breaker.getState()).toBe('open')
    })

    it('should reset failure count on success', async () => {
      const failOperation = vi.fn().mockRejectedValue(new Error('fail'))
      const successOperation = vi.fn().mockResolvedValue('success')
      
      await expect(breaker.execute(failOperation)).rejects.toThrow()
      await breaker.execute(successOperation)
      
      const stats = breaker.getStats()
      expect(stats.failureCount).toBe(0)
    })
  })

  describe('open state', () => {
    beforeEach(async () => {
      const operation = vi.fn().mockRejectedValue(new Error('fail'))
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(operation)).rejects.toThrow()
      }
    })

    it('should reject operations immediately', async () => {
      const operation = vi.fn().mockResolvedValue('success')
      
      await expect(breaker.execute(operation)).rejects.toThrow('is open')
      expect(operation).not.toHaveBeenCalled()
    })

    it('should transition to half-open after reset timeout', async () => {
      await new Promise(resolve => setTimeout(resolve, 250))
      
      const operation = vi.fn().mockResolvedValue('success')
      await breaker.execute(operation)
      
      expect(breaker.getState()).toBe('half-open')
    })
  })

  describe('half-open state', () => {
    beforeEach(async () => {
      const operation = vi.fn().mockRejectedValue(new Error('fail'))
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(operation)).rejects.toThrow()
      }
      await new Promise(resolve => setTimeout(resolve, 250))
    })

    it('should allow test operation', async () => {
      const operation = vi.fn().mockResolvedValue('success')
      
      await breaker.execute(operation)
      
      expect(operation).toHaveBeenCalled()
      expect(breaker.getState()).toBe('half-open')
    })

    it('should close after success threshold', async () => {
      const operation = vi.fn().mockResolvedValue('success')
      
      await breaker.execute(operation)
      await breaker.execute(operation)
      
      expect(breaker.getState()).toBe('closed')
    })

    it('should reopen on failure', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('fail'))
      
      await expect(breaker.execute(operation)).rejects.toThrow()
      
      expect(breaker.getState()).toBe('open')
    })
  })

  describe('reset', () => {
    it('should reset to closed state', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('fail'))
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(operation)).rejects.toThrow()
      }
      
      breaker.reset()
      
      expect(breaker.getState()).toBe('closed')
      const stats = breaker.getStats()
      expect(stats.failureCount).toBe(0)
    })
  })

  describe('forceOpen', () => {
    it('should force open state', () => {
      breaker.forceOpen()
      
      expect(breaker.getState()).toBe('open')
    })
  })

  describe('timeout', () => {
    it('should timeout long operations', async () => {
      const slowOperation = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 200))
      )
      
      await expect(breaker.execute(slowOperation)).rejects.toThrow('timeout')
    })
  })
})

describe('CircuitBreakerManager', () => {
  let manager: CircuitBreakerManager

  beforeEach(() => {
    manager = new CircuitBreakerManager()
  })

  it('should create and retrieve breakers', () => {
    const breaker1 = manager.getBreaker('service1')
    const breaker2 = manager.getBreaker('service2')
    
    expect(breaker1).not.toBe(breaker2)
    expect(manager.getBreaker('service1')).toBe(breaker1)
  })

  it('should return all stats', () => {
    manager.getBreaker('service1')
    manager.getBreaker('service2')
    
    const stats = manager.getAllStats()
    
    expect(Object.keys(stats)).toHaveLength(2)
    expect(stats['service1']).toBeDefined()
    expect(stats['service2']).toBeDefined()
  })

  it('should reset all breakers', async () => {
    const breaker = manager.getBreaker('service1')
    
    const operation = vi.fn().mockRejectedValue(new Error('fail'))
    for (let i = 0; i < 5; i++) {
      await expect(breaker.execute(operation)).rejects.toThrow()
    }
    
    manager.resetAll()
    
    expect(breaker.getState()).toBe('closed')
  })

  it('should remove breaker', () => {
    manager.getBreaker('service1')
    
    const result = manager.removeBreaker('service1')
    
    expect(result).toBe(true)
    expect(manager.getAllStats()['service1']).toBeUndefined()
  })

  it('should clear all breakers', () => {
    manager.getBreaker('service1')
    manager.getBreaker('service2')
    
    manager.clearAll()
    
    expect(Object.keys(manager.getAllStats())).toHaveLength(0)
  })
})
