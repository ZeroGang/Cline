import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HookSystem, createHookSystem, commonHooks, type HookContext, type HookResult } from '../../src/hooks/hook-system.js'
import { Logger } from '../../src/infrastructure/logging/logger.js'

describe('HookSystem', () => {
  let hookSystem: HookSystem

  beforeEach(() => {
    hookSystem = createHookSystem()
  })

  describe('registerHook', () => {
    it('should register a hook', () => {
      const id = hookSystem.registerHook('PreToolUse', 'test-hook', async () => ({ action: 'continue' }))
      
      expect(id).toBeDefined()
      const hooks = hookSystem.getHooks('PreToolUse')
      expect(hooks).toHaveLength(1)
      expect(hooks[0].name).toBe('test-hook')
    })

    it('should register hooks with different priorities', () => {
      hookSystem.registerHook('PreToolUse', 'low-priority', async () => ({ action: 'continue' }), { priority: 100 })
      hookSystem.registerHook('PreToolUse', 'high-priority', async () => ({ action: 'continue' }), { priority: 10 })
      
      const hooks = hookSystem.getHooks('PreToolUse')
      expect(hooks[0].name).toBe('high-priority')
      expect(hooks[1].name).toBe('low-priority')
    })

    it('should throw error when max hooks reached', () => {
      const limitedSystem = createHookSystem({ maxHooks: 2 })
      
      limitedSystem.registerHook('PreToolUse', 'hook1', async () => ({ action: 'continue' }))
      limitedSystem.registerHook('PostToolUse', 'hook2', async () => ({ action: 'continue' }))
      
      expect(() => {
        limitedSystem.registerHook('OnError', 'hook3', async () => ({ action: 'continue' }))
      }).toThrow('Maximum hooks limit')
    })

    it('should register disabled hook', () => {
      hookSystem.registerHook('PreToolUse', 'disabled-hook', async () => ({ action: 'continue' }), { enabled: false })
      
      const hooks = hookSystem.getHooks('PreToolUse')
      expect(hooks[0].enabled).toBe(false)
    })
  })

  describe('unregisterHook', () => {
    it('should unregister a hook', () => {
      const id = hookSystem.registerHook('PreToolUse', 'test-hook', async () => ({ action: 'continue' }))
      
      const result = hookSystem.unregisterHook(id)
      
      expect(result).toBe(true)
      expect(hookSystem.getHooks('PreToolUse')).toHaveLength(0)
    })

    it('should return false for non-existent hook', () => {
      const result = hookSystem.unregisterHook('non-existent')
      
      expect(result).toBe(false)
    })
  })

  describe('enableHook/disableHook', () => {
    it('should enable a disabled hook', () => {
      const id = hookSystem.registerHook('PreToolUse', 'test-hook', async () => ({ action: 'continue' }), { enabled: false })
      
      const result = hookSystem.enableHook(id)
      
      expect(result).toBe(true)
      expect(hookSystem.getHook(id)?.enabled).toBe(true)
    })

    it('should disable an enabled hook', () => {
      const id = hookSystem.registerHook('PreToolUse', 'test-hook', async () => ({ action: 'continue' }))
      
      const result = hookSystem.disableHook(id)
      
      expect(result).toBe(true)
      expect(hookSystem.getHook(id)?.enabled).toBe(false)
    })

    it('should return false for non-existent hook', () => {
      expect(hookSystem.enableHook('non-existent')).toBe(false)
      expect(hookSystem.disableHook('non-existent')).toBe(false)
    })
  })

  describe('executeHooks', () => {
    it('should execute hooks and return continue', async () => {
      hookSystem.registerHook('PreToolUse', 'test-hook', async () => ({ action: 'continue' }))
      
      const result = await hookSystem.executeHooks('PreToolUse', { tool: 'Read', input: { path: '/test' } })
      
      expect(result.action).toBe('continue')
    })

    it('should skip remaining hooks on skip action', async () => {
      const handler1 = vi.fn(async () => ({ action: 'skip', reason: 'test skip' } as HookResult))
      const handler2 = vi.fn(async () => ({ action: 'continue' }))
      
      hookSystem.registerHook('PreToolUse', 'hook1', handler1)
      hookSystem.registerHook('PreToolUse', 'hook2', handler2)
      
      const result = await hookSystem.executeHooks('PreToolUse', { tool: 'Read' })
      
      expect(result.action).toBe('skip')
      expect(handler1).toHaveBeenCalled()
      expect(handler2).not.toHaveBeenCalled()
    })

    it('should modify context on modify action', async () => {
      hookSystem.registerHook('PreToolUse', 'modify-hook', async (ctx) => ({
        action: 'modify',
        input: { ...ctx.input, modified: true }
      }))
      
      const result = await hookSystem.executeHooks('PreToolUse', { 
        tool: 'Read', 
        input: { path: '/test' } 
      })
      
      expect(result.action).toBe('modify')
      if (result.action === 'modify') {
        expect(result.input?.modified).toBe(true)
      }
    })

    it('should abort on abort action', async () => {
      hookSystem.registerHook('PreToolUse', 'abort-hook', async () => ({
        action: 'abort',
        reason: 'test abort'
      }))
      
      const result = await hookSystem.executeHooks('PreToolUse', { tool: 'Read' })
      
      expect(result.action).toBe('abort')
      if (result.action === 'abort') {
        expect(result.reason).toBe('test abort')
      }
    })

    it('should skip disabled hooks', async () => {
      const handler = vi.fn(async () => ({ action: 'continue' }))
      
      hookSystem.registerHook('PreToolUse', 'disabled-hook', handler, { enabled: false })
      
      const result = await hookSystem.executeHooks('PreToolUse', { tool: 'Read' })
      
      expect(result.action).toBe('continue')
      expect(handler).not.toHaveBeenCalled()
    })

    it('should continue on error when continueOnError is true', async () => {
      const handler1 = vi.fn(async () => { throw new Error('test error') })
      const handler2 = vi.fn(async () => ({ action: 'continue' }))
      
      hookSystem.registerHook('PreToolUse', 'error-hook', handler1)
      hookSystem.registerHook('PreToolUse', 'normal-hook', handler2)
      
      const result = await hookSystem.executeHooks('PreToolUse', { tool: 'Read' })
      
      expect(result.action).toBe('continue')
      expect(handler2).toHaveBeenCalled()
    })

    it('should abort on error when continueOnError is false', async () => {
      const errorSystem = createHookSystem({ continueOnError: false })
      const handler = vi.fn(async () => { throw new Error('test error') })
      
      errorSystem.registerHook('PreToolUse', 'error-hook', handler)
      
      const result = await errorSystem.executeHooks('PreToolUse', { tool: 'Read' })
      
      expect(result.action).toBe('abort')
    })

    it('should return continue when disabled', async () => {
      const disabledSystem = createHookSystem({ enabled: false })
      disabledSystem.registerHook('PreToolUse', 'test-hook', async () => ({ action: 'abort', reason: 'test' }))
      
      const result = await disabledSystem.executeHooks('PreToolUse', { tool: 'Read' })
      
      expect(result.action).toBe('continue')
    })

    it('should return continue when no hooks registered', async () => {
      const result = await hookSystem.executeHooks('PreToolUse', { tool: 'Read' })
      
      expect(result.action).toBe('continue')
    })
  })

  describe('getHooks', () => {
    it('should return hooks for a specific hook point', () => {
      hookSystem.registerHook('PreToolUse', 'hook1', async () => ({ action: 'continue' }))
      hookSystem.registerHook('PostToolUse', 'hook2', async () => ({ action: 'continue' }))
      
      const preHooks = hookSystem.getHooks('PreToolUse')
      const postHooks = hookSystem.getHooks('PostToolUse')
      
      expect(preHooks).toHaveLength(1)
      expect(postHooks).toHaveLength(1)
    })

    it('should return all hooks when no hook point specified', () => {
      hookSystem.registerHook('PreToolUse', 'hook1', async () => ({ action: 'continue' }))
      hookSystem.registerHook('PostToolUse', 'hook2', async () => ({ action: 'continue' }))
      
      const allHooks = hookSystem.getHooks()
      
      expect(allHooks).toHaveLength(2)
    })
  })

  describe('clearHooks', () => {
    it('should clear hooks for a specific hook point', () => {
      hookSystem.registerHook('PreToolUse', 'hook1', async () => ({ action: 'continue' }))
      hookSystem.registerHook('PostToolUse', 'hook2', async () => ({ action: 'continue' }))
      
      hookSystem.clearHooks('PreToolUse')
      
      expect(hookSystem.getHooks('PreToolUse')).toHaveLength(0)
      expect(hookSystem.getHooks('PostToolUse')).toHaveLength(1)
    })

    it('should clear all hooks when no hook point specified', () => {
      hookSystem.registerHook('PreToolUse', 'hook1', async () => ({ action: 'continue' }))
      hookSystem.registerHook('PostToolUse', 'hook2', async () => ({ action: 'continue' }))
      
      hookSystem.clearHooks()
      
      expect(hookSystem.getHooks()).toHaveLength(0)
    })
  })

  describe('config', () => {
    it('should return current config', () => {
      const config = hookSystem.getConfig()
      
      expect(config.enabled).toBe(true)
      expect(config.maxHooks).toBe(100)
    })

    it('should update config', () => {
      hookSystem.updateConfig({ maxHooks: 50 })
      
      const config = hookSystem.getConfig()
      expect(config.maxHooks).toBe(50)
    })
  })

  describe('commonHooks', () => {
    it('should create logging hook', async () => {
      const logger = new Logger('test')
      const loggingHook = commonHooks.logging(logger)
      
      const id = hookSystem.registerHook(loggingHook.hookPoint, loggingHook.name, loggingHook.handler)
      
      const result = await hookSystem.executeHooks('PreToolUse', { tool: 'Read', input: { path: '/test' } })
      
      expect(result.action).toBe('continue')
    })

    it('should create validation hook that passes', async () => {
      const validationHook = commonHooks.validation((input) => !!input.path)
      
      hookSystem.registerHook(validationHook.hookPoint, validationHook.name, validationHook.handler)
      
      const result = await hookSystem.executeHooks('PreToolUse', { tool: 'Read', input: { path: '/test' } })
      
      expect(result.action).toBe('continue')
    })

    it('should create validation hook that fails', async () => {
      const validationHook = commonHooks.validation((input) => !!input.path)
      
      hookSystem.registerHook(validationHook.hookPoint, validationHook.name, validationHook.handler)
      
      const result = await hookSystem.executeHooks('PreToolUse', { tool: 'Read', input: {} })
      
      expect(result.action).toBe('abort')
    })

    it('should create error reporting hook', async () => {
      const reporter = vi.fn()
      const errorHook = commonHooks.errorReporting(reporter)
      
      hookSystem.registerHook(errorHook.hookPoint, errorHook.name, errorHook.handler)
      
      const error = new Error('test error')
      await hookSystem.executeHooks('OnError', { error })
      
      expect(reporter).toHaveBeenCalled()
    })

    it('should create input transformation hook', async () => {
      const transformHook = commonHooks.inputTransformation((input) => ({
        ...input,
        transformed: true
      }))
      
      hookSystem.registerHook(transformHook.hookPoint, transformHook.name, transformHook.handler)
      
      const result = await hookSystem.executeHooks('PreToolUse', { tool: 'Read', input: { path: '/test' } })
      
      expect(result.action).toBe('modify')
      if (result.action === 'modify') {
        expect(result.input?.transformed).toBe(true)
      }
    })
  })
})
