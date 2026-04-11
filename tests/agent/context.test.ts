import { describe, it, expect, beforeEach } from 'vitest'
import { createAgentContext, resetAgentContext, addMessage, getMessages, abort, isAborted } from '../../src/agent/context.js'
import { ToolRegistry } from '../../src/tools/registry.js'
import { Store } from '../../src/infrastructure/state/store.js'
import { DEFAULT_APP_STATE } from '../../src/infrastructure/state/index.js'
import { createMockMessage } from '../../src/agent/deps.js'

describe('createAgentContext', () => {
  let registry: ToolRegistry
  let store: Store<typeof DEFAULT_APP_STATE>

  beforeEach(() => {
    registry = new ToolRegistry()
    store = new Store(DEFAULT_APP_STATE)
  })

  it('should create context with required options', () => {
    const context = createAgentContext({ tools: registry, store })
    
    expect(context.messages).toEqual([])
    expect(context.abortController).toBeInstanceOf(AbortController)
    expect(context.tools).toBe(registry)
    expect(context.permissionSystem).toBeDefined()
    expect(context.store).toBe(store)
  })

  it('should create context with custom messages', () => {
    const messages = [createMockMessage('user', 'Hello')]
    const context = createAgentContext({ tools: registry, store, messages })
    
    expect(context.messages.length).toBe(1)
    expect(context.messages[0]?.content).toBe('Hello')
  })

  it('should create context with custom permission mode', () => {
    const context = createAgentContext({ tools: registry, store, permissionMode: 'plan' })
    
    expect(context.permissionSystem.getMode()).toBe('plan')
    expect(context.toolPermissionContext.mode).toBe('plan')
  })

  it('should create context with custom session ID', () => {
    const context = createAgentContext({ tools: registry, store, sessionId: 'custom-session' })
    
    expect(context.toolPermissionContext.sessionId).toBe('custom-session')
  })

  it('should create context with MCP tools', () => {
    const mcpTools = [{ name: 'mcp_tool', description: 'MCP Tool', inputSchema: {} }]
    const context = createAgentContext({ tools: registry, store, mcpTools })
    
    expect(context.mcpTools.length).toBe(1)
    expect(context.mcpTools[0]?.name).toBe('mcp_tool')
  })

  it('should initialize empty state maps', () => {
    const context = createAgentContext({ tools: registry, store })
    
    expect(context.readFileState).toBeInstanceOf(Map)
    expect(context.contentReplacementState).toBeInstanceOf(Map)
    expect(context.readFileState.size).toBe(0)
    expect(context.contentReplacementState.size).toBe(0)
  })
})

describe('resetAgentContext', () => {
  let context: ReturnType<typeof createAgentContext>
  let registry: ToolRegistry
  let store: Store<typeof DEFAULT_APP_STATE>

  beforeEach(() => {
    registry = new ToolRegistry()
    store = new Store(DEFAULT_APP_STATE)
    context = createAgentContext({ tools: registry, store })
  })

  it('should clear messages', () => {
    context.messages.push(createMockMessage('user', 'test'))
    resetAgentContext(context)
    
    expect(context.messages.length).toBe(0)
  })

  it('should create new AbortController', () => {
    const oldController = context.abortController
    resetAgentContext(context)
    
    expect(context.abortController).not.toBe(oldController)
  })

  it('should clear state maps', () => {
    context.readFileState.set('file1', 'content1')
    context.contentReplacementState.set('key1', 'value1')
    resetAgentContext(context)
    
    expect(context.readFileState.size).toBe(0)
    expect(context.contentReplacementState.size).toBe(0)
  })
})

describe('addMessage', () => {
  let context: ReturnType<typeof createAgentContext>
  let registry: ToolRegistry
  let store: Store<typeof DEFAULT_APP_STATE>

  beforeEach(() => {
    registry = new ToolRegistry()
    store = new Store(DEFAULT_APP_STATE)
    context = createAgentContext({ tools: registry, store })
  })

  it('should add message to context', () => {
    addMessage(context, createMockMessage('user', 'Hello'))
    
    expect(context.messages.length).toBe(1)
    expect(context.messages[0]?.content).toBe('Hello')
  })

  it('should add multiple messages', () => {
    addMessage(context, createMockMessage('user', 'Hello'))
    addMessage(context, createMockMessage('assistant', 'Hi'))
    
    expect(context.messages.length).toBe(2)
  })
})

describe('getMessages', () => {
  let context: ReturnType<typeof createAgentContext>
  let registry: ToolRegistry
  let store: Store<typeof DEFAULT_APP_STATE>

  beforeEach(() => {
    registry = new ToolRegistry()
    store = new Store(DEFAULT_APP_STATE)
    context = createAgentContext({ tools: registry, store })
  })

  it('should return copy of messages', () => {
    addMessage(context, createMockMessage('user', 'test'))
    const messages = getMessages(context)
    
    expect(messages.length).toBe(1)
    expect(messages).not.toBe(context.messages)
  })
})

describe('abort', () => {
  let context: ReturnType<typeof createAgentContext>
  let registry: ToolRegistry
  let store: Store<typeof DEFAULT_APP_STATE>

  beforeEach(() => {
    registry = new ToolRegistry()
    store = new Store(DEFAULT_APP_STATE)
    context = createAgentContext({ tools: registry, store })
  })

  it('should abort the context', () => {
    expect(isAborted(context)).toBe(false)
    abort(context)
    expect(isAborted(context)).toBe(true)
  })
})

describe('isAborted', () => {
  let context: ReturnType<typeof createAgentContext>
  let registry: ToolRegistry
  let store: Store<typeof DEFAULT_APP_STATE>

  beforeEach(() => {
    registry = new ToolRegistry()
    store = new Store(DEFAULT_APP_STATE)
    context = createAgentContext({ tools: registry, store })
  })

  it('should return false initially', () => {
    expect(isAborted(context)).toBe(false)
  })

  it('should return true after abort', () => {
    context.abortController.abort()
    expect(isAborted(context)).toBe(true)
  })
})
