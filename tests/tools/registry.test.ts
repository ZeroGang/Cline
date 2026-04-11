import { describe, it, expect, beforeEach } from 'vitest'
import { z } from 'zod'
import { ToolRegistry, createToolRegistry, createTool } from '../../src/tools/registry.js'
import type { Tool, ToolResult } from '../../src/tools/types.js'

const testInputSchema = z.object({
  message: z.string()
})

describe('ToolRegistry', () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = createToolRegistry()
  })

  it('should register a tool', () => {
    const tool = createTool({
      name: 'test-tool',
      description: 'A test tool',
      inputSchema: testInputSchema,
      execute: async (input) => ({ output: input.message })
    })
    registry.register(tool)
    expect(registry.size()).toBe(1)
    expect(registry.has('test-tool')).toBe(true)
  })

  it('should throw when registering duplicate tool', () => {
    const tool = createTool({
      name: 'test-tool',
      description: 'A test tool',
      inputSchema: testInputSchema,
      execute: async (input) => ({ output: input.message })
    })
    registry.register(tool)
    expect(() => registry.register(tool)).toThrow('already registered')
  })

  it('should get a tool by name', () => {
    const tool = createTool({
      name: 'test-tool',
      description: 'A test tool',
      inputSchema: testInputSchema,
      execute: async (input) => ({ output: input.message })
    })
    registry.register(tool)
    const retrieved = registry.get('test-tool')
    expect(retrieved?.name).toBe('test-tool')
  })

  it('should return undefined for non-existent tool', () => {
    expect(registry.get('non-existent')).toBeUndefined()
  })

  it('should get all tools', () => {
    const tool1 = createTool({
      name: 'tool1',
      description: 'Tool 1',
      inputSchema: testInputSchema,
      execute: async (input) => ({ output: input.message })
    })
    const tool2 = createTool({
      name: 'tool2',
      description: 'Tool 2',
      inputSchema: testInputSchema,
      execute: async (input) => ({ output: input.message })
    })
    registry.register(tool1)
    registry.register(tool2)
    expect(registry.getAll().length).toBe(2)
  })

  it('should filter tools', () => {
    const readOnlyTool = createTool({
      name: 'read-tool',
      description: 'Read tool',
      inputSchema: testInputSchema,
      isReadOnly: () => true,
      execute: async (input) => ({ output: input.message })
    })
    const writeTool = createTool({
      name: 'write-tool',
      description: 'Write tool',
      inputSchema: testInputSchema,
      isReadOnly: () => false,
      isDestructive: () => true,
      execute: async (input) => ({ output: input.message })
    })
    registry.register(readOnlyTool)
    registry.register(writeTool)

    const readOnly = registry.getReadOnly()
    expect(readOnly.length).toBe(1)
    expect(readOnly[0]?.name).toBe('read-tool')

    const destructive = registry.getDestructive()
    expect(destructive.length).toBe(1)
    expect(destructive[0]?.name).toBe('write-tool')
  })

  it('should get enabled tools', () => {
    const enabledTool = createTool({
      name: 'enabled',
      description: 'Enabled tool',
      inputSchema: testInputSchema,
      isEnabled: () => true,
      execute: async (input) => ({ output: input.message })
    })
    const disabledTool = createTool({
      name: 'disabled',
      description: 'Disabled tool',
      inputSchema: testInputSchema,
      isEnabled: () => false,
      execute: async (input) => ({ output: input.message })
    })
    registry.register(enabledTool)
    registry.register(disabledTool)

    const enabled = registry.getEnabled()
    expect(enabled.length).toBe(1)
    expect(enabled[0]?.name).toBe('enabled')
  })

  it('should remove a tool', () => {
    const tool = createTool({
      name: 'test-tool',
      description: 'A test tool',
      inputSchema: testInputSchema,
      execute: async (input) => ({ output: input.message })
    })
    registry.register(tool)
    expect(registry.remove('test-tool')).toBe(true)
    expect(registry.has('test-tool')).toBe(false)
    expect(registry.remove('non-existent')).toBe(false)
  })

  it('should clear all tools', () => {
    const tool1 = createTool({
      name: 'tool1',
      description: 'Tool 1',
      inputSchema: testInputSchema,
      execute: async (input) => ({ output: input.message })
    })
    const tool2 = createTool({
      name: 'tool2',
      description: 'Tool 2',
      inputSchema: testInputSchema,
      execute: async (input) => ({ output: input.message })
    })
    registry.register(tool1)
    registry.register(tool2)
    registry.clear()
    expect(registry.size()).toBe(0)
  })
})

describe('createTool', () => {
  it('should create a tool with defaults', () => {
    const tool = createTool({
      name: 'test-tool',
      description: 'A test tool',
      inputSchema: testInputSchema,
      execute: async (input) => ({ output: input.message })
    })

    expect(tool.name).toBe('test-tool')
    expect(tool.description).toBe('A test tool')
    expect(tool.isEnabled()).toBe(true)
    expect(tool.isConcurrencySafe({ message: 'test' })).toBe(false)
    expect(tool.isReadOnly()).toBe(false)
    expect(tool.isDestructive()).toBe(false)
    expect(tool.checkPermissions({ message: 'test' })).toBe('ask')
  })

  it('should create a tool with custom methods', () => {
    const tool = createTool({
      name: 'custom-tool',
      description: 'Custom tool',
      inputSchema: testInputSchema,
      isEnabled: () => false,
      isConcurrencySafe: () => true,
      isReadOnly: () => true,
      isDestructive: () => true,
      checkPermissions: () => 'allow',
      execute: async (input) => ({ output: input.message, metadata: { custom: true } })
    })

    expect(tool.isEnabled()).toBe(false)
    expect(tool.isConcurrencySafe({ message: 'test' })).toBe(true)
    expect(tool.isReadOnly()).toBe(true)
    expect(tool.isDestructive()).toBe(true)
    expect(tool.checkPermissions({ message: 'test' })).toBe('allow')
  })

  it('should execute tool and return result', async () => {
    const tool = createTool({
      name: 'echo',
      description: 'Echo tool',
      inputSchema: testInputSchema,
      execute: async (input) => ({ output: `Echo: ${input.message}` })
    })

    const result = await tool.execute({ message: 'hello' })
    expect(result.output).toBe('Echo: hello')
  })

  it('should return error result on failure', async () => {
    const tool = createTool({
      name: 'failing-tool',
      description: 'Failing tool',
      inputSchema: testInputSchema,
      execute: async () => {
        throw new Error('Tool failed')
      }
    })

    try {
      await tool.execute({ message: 'test' })
    } catch (error) {
      expect((error as Error).message).toBe('Tool failed')
    }
  })
})
