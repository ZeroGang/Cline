import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PluginManager, createPluginManager, type Plugin } from '../../src/plugins/manager.js'
import { ToolRegistry, createToolRegistry } from '../../src/tools/index.js'
import { LoadBalancer, createLoadBalancer } from '../../src/scheduler/loadbalancer.js'
import { MetricsCollector } from '../../src/monitoring/metrics.js'

describe('PluginManager', () => {
  let manager: PluginManager
  let toolRegistry: ToolRegistry
  let loadBalancer: LoadBalancer
  let metricsCollector: MetricsCollector

  beforeEach(() => {
    toolRegistry = createToolRegistry()
    loadBalancer = createLoadBalancer()
    metricsCollector = new MetricsCollector()

    manager = createPluginManager(
      {},
      { toolRegistry, loadBalancer, metricsCollector }
    )
  })

  afterEach(async () => {
    await manager.unloadAll()
  })

  describe('load', () => {
    it('should load plugin', async () => {
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin'
      }

      await manager.load(plugin)

      expect(manager.hasPlugin('test-plugin')).toBe(true)
      expect(manager.getPlugin('test-plugin')).toBe(plugin)
    })

    it('should call onLoad hook', async () => {
      const onLoad = vi.fn()
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        onLoad
      }

      await manager.load(plugin)

      expect(onLoad).toHaveBeenCalled()
    })

    it('should not load duplicate plugin', async () => {
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0'
      }

      await manager.load(plugin)
      await manager.load(plugin)

      expect(manager.getPluginCount()).toBe(1)
    })

    it('should enforce max plugins', async () => {
      const smallManager = createPluginManager({ maxPlugins: 1 })

      const plugin1: Plugin = { name: 'plugin-1', version: '1.0.0' }
      const plugin2: Plugin = { name: 'plugin-2', version: '1.0.0' }

      await smallManager.load(plugin1)
      
      await expect(smallManager.load(plugin2)).rejects.toThrow('Maximum plugins')
      
      await smallManager.unloadAll()
    })

    it('should register plugin tools', async () => {
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        tools: [
          {
            name: 'test-tool',
            description: 'Test tool',
            inputSchema: { type: 'object' },
            execute: vi.fn()
          }
        ]
      }

      await manager.load(plugin)

      expect(toolRegistry.get('test-tool')).toBeDefined()
    })

    it('should register plugin strategies', async () => {
      const strategy = {
        name: 'test-strategy',
        select: vi.fn()
      }

      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        strategies: [strategy]
      }

      await manager.load(plugin)

      expect(loadBalancer.getStrategy('test-strategy')).toBe(strategy)
    })
  })

  describe('unload', () => {
    it('should unload plugin', async () => {
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0'
      }

      await manager.load(plugin)
      await manager.unload('test-plugin')

      expect(manager.hasPlugin('test-plugin')).toBe(false)
    })

    it('should call onUnload hook', async () => {
      const onUnload = vi.fn()
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        onUnload
      }

      await manager.load(plugin)
      await manager.unload('test-plugin')

      expect(onUnload).toHaveBeenCalled()
    })

    it('should unregister plugin tools', async () => {
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        tools: [
          {
            name: 'test-tool',
            description: 'Test tool',
            inputSchema: { type: 'object' },
            execute: vi.fn()
          }
        ]
      }

      await manager.load(plugin)
      await manager.unload('test-plugin')

      expect(toolRegistry.get('test-tool')).toBeUndefined()
    })

    it('should unregister plugin strategies', async () => {
      const strategy = {
        name: 'test-strategy',
        select: vi.fn()
      }

      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        strategies: [strategy]
      }

      await manager.load(plugin)
      await manager.unload('test-plugin')

      expect(loadBalancer.getStrategy('test-strategy')).toBeUndefined()
    })
  })

  describe('unloadAll', () => {
    it('should unload all plugins', async () => {
      const plugin1: Plugin = { name: 'plugin-1', version: '1.0.0' }
      const plugin2: Plugin = { name: 'plugin-2', version: '1.0.0' }

      await manager.load(plugin1)
      await manager.load(plugin2)
      await manager.unloadAll()

      expect(manager.getPluginCount()).toBe(0)
    })
  })

  describe('getPlugin', () => {
    it('should return plugin by name', async () => {
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0'
      }

      await manager.load(plugin)

      expect(manager.getPlugin('test-plugin')).toBe(plugin)
    })

    it('should return undefined for non-existent plugin', () => {
      expect(manager.getPlugin('non-existent')).toBeUndefined()
    })
  })

  describe('getAllPlugins', () => {
    it('should return all plugins', async () => {
      const plugin1: Plugin = { name: 'plugin-1', version: '1.0.0' }
      const plugin2: Plugin = { name: 'plugin-2', version: '1.0.0' }

      await manager.load(plugin1)
      await manager.load(plugin2)

      const plugins = manager.getAllPlugins()
      expect(plugins.length).toBe(2)
    })
  })

  describe('commands', () => {
    it('should execute plugin command', async () => {
      const execute = vi.fn()
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        commands: [
          {
            name: 'test-command',
            description: 'Test command',
            execute
          }
        ]
      }

      await manager.load(plugin)
      await manager.executeCommand('test-plugin', 'test-command', ['arg1', 'arg2'])

      expect(execute).toHaveBeenCalledWith(['arg1', 'arg2'])
    })

    it('should throw error for non-existent plugin', async () => {
      try {
        await manager.executeCommand('non-existent', 'command', [])
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain('Plugin non-existent not found')
      }
    })

    it('should throw error for non-existent command', async () => {
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0'
      }

      await manager.load(plugin)

      try {
        await manager.executeCommand('test-plugin', 'non-existent', [])
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain('Command non-existent not found')
      }
    })

    it('should get plugin commands', async () => {
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        commands: [
          { name: 'cmd1', description: 'Command 1', execute: vi.fn() },
          { name: 'cmd2', description: 'Command 2', execute: vi.fn() }
        ]
      }

      await manager.load(plugin)

      const commands = manager.getCommands('test-plugin')
      expect(commands.length).toBe(2)
    })

    it('should get all commands', async () => {
      const plugin1: Plugin = {
        name: 'plugin-1',
        version: '1.0.0',
        commands: [
          { name: 'cmd1', description: 'Command 1', execute: vi.fn() }
        ]
      }
      const plugin2: Plugin = {
        name: 'plugin-2',
        version: '1.0.0',
        commands: [
          { name: 'cmd2', description: 'Command 2', execute: vi.fn() }
        ]
      }

      await manager.load(plugin1)
      await manager.load(plugin2)

      const allCommands = manager.getAllCommands()
      expect(allCommands.size).toBe(2)
    })
  })

  describe('dependency injection', () => {
    it('should set dependencies after creation', async () => {
      const newManager = createPluginManager()
      const registry = createToolRegistry()

      newManager.setToolRegistry(registry)

      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        tools: [
          {
            name: 'test-tool',
            description: 'Test tool',
            inputSchema: { type: 'object' },
            execute: vi.fn()
          }
        ]
      }

      await newManager.load(plugin)

      expect(registry.get('test-tool')).toBeDefined()
      
      await newManager.unloadAll()
    })
  })
})

import { afterEach } from 'vitest'
