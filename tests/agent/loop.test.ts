import { describe, it, expect, beforeEach } from 'vitest'
import { 
  agentLoop, 
  shouldTerminate, 
  createSyntheticAbortResult,
  extractToolUseBlocks,
  createAgentLoopConfig
} from '../../src/agent/loop.js'
import type { Message, AgentContext, AgentDefinition } from '../../src/agent/types.js'
import type { Task } from '../../src/scheduler/types.js'
import { ToolRegistry, createTool } from '../../src/tools/registry.js'
import { createDefaultPermissionSystem } from '../../src/permissions/system.js'
import { Store } from '../../src/infrastructure/state/store.js'
import { DEFAULT_APP_STATE } from '../../src/infrastructure/state/index.js'
import { testDeps, createMockMessage } from '../../src/agent/deps.js'
import { z } from 'zod'

function createTestContext(): AgentContext {
  const registry = new ToolRegistry()
  registry.register(createTool({
    name: 'test_tool',
    description: 'A test tool',
    inputSchema: z.object({ message: z.string() }),
    execute: async (input) => ({
      output: `Result: ${input.message}`
    })
  }))

  return {
    messages: [],
    abortController: new AbortController(),
    tools: registry,
    permissionSystem: createDefaultPermissionSystem(),
    setAppState: () => {},
    readFileState: new Map(),
    contentReplacementState: new Map(),
    toolPermissionContext: {
      mode: 'default',
      sessionId: 'test-session'
    },
    mcpTools: [],
    store: new Store(DEFAULT_APP_STATE)
  }
}

function createTestTask(prompt: string): Task {
  return {
    id: 'task-1',
    type: 'test',
    priority: 'normal',
    status: 'pending',
    prompt,
    dependencies: [],
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now()
  }
}

describe('shouldTerminate', () => {
  it('should return true when aborted', () => {
    const state = {
      messages: [],
      turn: 1,
      maxTurns: 100,
      aborted: true,
      detained: false,
      lastContentBlockIndex: 0
    }
    
    expect(shouldTerminate(state, null)).toBe(true)
  })

  it('should return true when max turns reached', () => {
    const state = {
      messages: [],
      turn: 100,
      maxTurns: 100,
      aborted: false,
      detained: false,
      lastContentBlockIndex: 0
    }
    
    expect(shouldTerminate(state, null)).toBe(true)
  })

  it('should return true when assistant sends text-only message', () => {
    const state = {
      messages: [],
      turn: 1,
      maxTurns: 100,
      aborted: false,
      detained: false,
      lastContentBlockIndex: 0
    }
    
    const lastMessage: Message = {
      role: 'assistant',
      content: 'I am done'
    }
    
    expect(shouldTerminate(state, lastMessage)).toBe(true)
  })

  it('should return true when assistant sends content blocks without tool_use', () => {
    const state = {
      messages: [],
      turn: 1,
      maxTurns: 100,
      aborted: false,
      detained: false,
      lastContentBlockIndex: 0
    }
    
    const lastMessage: Message = {
      role: 'assistant',
      content: [{ type: 'text', text: 'Done' }]
    }
    
    expect(shouldTerminate(state, lastMessage)).toBe(true)
  })

  it('should return false when assistant sends tool_use', () => {
    const state = {
      messages: [],
      turn: 1,
      maxTurns: 100,
      aborted: false,
      detained: false,
      lastContentBlockIndex: 0
    }
    
    const lastMessage: Message = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Using tool' },
        { type: 'tool_use', name: 'test', input: {} }
      ]
    }
    
    expect(shouldTerminate(state, lastMessage)).toBe(false)
  })

  it('should return false when no last message', () => {
    const state = {
      messages: [],
      turn: 1,
      maxTurns: 100,
      aborted: false,
      detained: false,
      lastContentBlockIndex: 0
    }
    
    expect(shouldTerminate(state, null)).toBe(false)
  })
})

describe('createSyntheticAbortResult', () => {
  it('should create tool_result message', () => {
    const message = createSyntheticAbortResult('tool-123')
    
    expect(message.role).toBe('user')
    
    const content = message.content
    if (Array.isArray(content)) {
      expect(content[0]?.type).toBe('tool_result')
      expect(content[0]?.tool_use_id).toBe('tool-123')
      expect(content[0]?.is_error).toBe(true)
      expect(content[0]?.content).toContain('interrupted')
    }
  })
})

describe('extractToolUseBlocks', () => {
  it('should return empty array for string content', () => {
    const message: Message = {
      role: 'assistant',
      content: 'text only'
    }
    
    const blocks = extractToolUseBlocks(message)
    expect(blocks).toEqual([])
  })

  it('should extract tool_use blocks', () => {
    const message: Message = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Using tool' },
        { type: 'tool_use', name: 'test_tool', input: { message: 'hello' }, tool_use_id: 'tool-1' }
      ]
    }
    
    const blocks = extractToolUseBlocks(message)
    
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.name).toBe('test_tool')
    expect(blocks[0]?.input).toEqual({ message: 'hello' })
  })

  it('should extract multiple tool_use blocks', () => {
    const message: Message = {
      role: 'assistant',
      content: [
        { type: 'tool_use', name: 'tool1', input: {}, tool_use_id: 'tool-1' },
        { type: 'tool_use', name: 'tool2', input: {}, tool_use_id: 'tool-2' }
      ]
    }
    
    const blocks = extractToolUseBlocks(message)
    expect(blocks).toHaveLength(2)
  })
})

describe('createAgentLoopConfig', () => {
  it('should create config with default values', () => {
    const definition: AgentDefinition = {
      agentType: 'test',
      permissionMode: 'default',
      isolation: 'shared',
      background: false
    }
    
    const deps = testDeps()
    const config = createAgentLoopConfig(definition, deps)
    
    expect(config.maxTurns).toBe(100)
    expect(config.deps).toBe(deps)
    expect(config.definition).toBe(definition)
    expect(config.contextManager).toBeDefined()
  })

  it('should use custom maxTurns', () => {
    const definition: AgentDefinition = {
      agentType: 'test',
      permissionMode: 'default',
      isolation: 'shared',
      background: false,
      maxTurns: 50
    }
    
    const deps = testDeps()
    const config = createAgentLoopConfig(definition, deps)
    
    expect(config.maxTurns).toBe(50)
  })
})

describe('agentLoop', () => {
  it('should yield turn_start and turn_end events', async () => {
    const context = createTestContext()
    const task = createTestTask('Hello')
    
    const deps = testDeps({
      callModel: async function* (messages: Message[]) {
        yield {
          role: 'assistant',
          content: 'Hello! How can I help you?'
        }
      }
    })
    
    const definition: AgentDefinition = {
      agentType: 'test',
      permissionMode: 'default',
      isolation: 'shared',
      background: false
    }
    
    const config = createAgentLoopConfig(definition, deps)
    
    const events = []
    for await (const event of agentLoop(task, context, config)) {
      events.push(event)
    }
    
    expect(events.some(e => e.type === 'turn_start')).toBe(true)
    expect(events.some(e => e.type === 'turn_end')).toBe(true)
    expect(events.some(e => e.type === 'completed')).toBe(true)
  })

  it('should yield model_response events', async () => {
    const context = createTestContext()
    const task = createTestTask('Test')
    
    const deps = testDeps({
      callModel: async function* (messages: Message[]) {
        yield {
          role: 'assistant',
          content: 'Response'
        }
      }
    })
    
    const definition: AgentDefinition = {
      agentType: 'test',
      permissionMode: 'default',
      isolation: 'shared',
      background: false
    }
    
    const config = createAgentLoopConfig(definition, deps)
    
    const events = []
    for await (const event of agentLoop(task, context, config)) {
      events.push(event)
    }
    
    const modelEvents = events.filter(e => e.type === 'model_response')
    expect(modelEvents.length).toBeGreaterThan(0)
  })

  it('should execute tools and yield tool events', async () => {
    const context = createTestContext()
    const task = createTestTask('Use tool')
    
    const deps = testDeps({
      callModel: async function* (messages: Message[]) {
        yield {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Using tool' },
            { type: 'tool_use', name: 'test_tool', input: { message: 'test' }, tool_use_id: 'tool-1' }
          ]
        }
      }
    })
    
    const definition: AgentDefinition = {
      agentType: 'test',
      permissionMode: 'default',
      isolation: 'shared',
      background: false
    }
    
    const config = createAgentLoopConfig(definition, deps)
    
    const events = []
    for await (const event of agentLoop(task, context, config)) {
      events.push(event)
    }
    
    expect(events.some(e => e.type === 'tool_start')).toBe(true)
    expect(events.some(e => e.type === 'tool_result')).toBe(true)
  })

  it('should handle abort signal', async () => {
    const context = createTestContext()
    const task = createTestTask('Test abort')
    
    const deps = testDeps({
      callModel: async function* (messages: Message[]) {
        yield {
          role: 'assistant',
          content: [
            { type: 'tool_use', name: 'test_tool', input: { message: 'test' }, tool_use_id: 'tool-1' }
          ]
        }
        yield {
          role: 'assistant',
          content: 'More content'
        }
      }
    })
    
    const definition: AgentDefinition = {
      agentType: 'test',
      permissionMode: 'default',
      isolation: 'shared',
      background: false
    }
    
    const config = createAgentLoopConfig(definition, deps)
    
    const events = []
    const iterator = agentLoop(task, context, config)
    
    for await (const event of iterator) {
      events.push(event)
      if (event.type === 'tool_start') {
        context.abortController.abort()
      }
    }
    
    expect(events.some(e => e.type === 'aborted')).toBe(true)
  })

  it('should stop after maxTurns', async () => {
    const context = createTestContext()
    const task = createTestTask('Test max turns')
    
    let callCount = 0
    const deps = testDeps({
      callModel: async function* (messages: Message[]) {
        callCount++
        yield {
          role: 'assistant',
          content: [
            { type: 'tool_use', name: 'test_tool', input: { message: 'test' }, tool_use_id: `tool-${callCount}` }
          ]
        }
      }
    })
    
    const definition: AgentDefinition = {
      agentType: 'test',
      permissionMode: 'default',
      isolation: 'shared',
      background: false,
      maxTurns: 3
    }
    
    const config = createAgentLoopConfig(definition, deps)
    
    const events = []
    for await (const event of agentLoop(task, context, config)) {
      events.push(event)
    }
    
    expect(callCount).toBeLessThanOrEqual(3)
    expect(events.some(e => e.type === 'completed')).toBe(true)
  })
})
