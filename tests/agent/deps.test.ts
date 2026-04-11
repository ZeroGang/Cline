import { describe, it, expect } from 'vitest'
import { productionDeps, testDeps, createMockMessage, createMockToolUse, createMockToolResult } from '../../src/agent/deps.js'

describe('productionDeps', () => {
  it('should create production dependencies', () => {
    const deps = productionDeps()
    
    expect(deps.callModel).toBeDefined()
    expect(deps.autocompact).toBeDefined()
    expect(deps.microcompact).toBeDefined()
    expect(deps.uuid).toBeDefined()
  })

  it('should generate unique UUIDs', () => {
    const deps = productionDeps()
    const uuid1 = deps.uuid()
    const uuid2 = deps.uuid()
    
    expect(uuid1).not.toBe(uuid2)
    expect(uuid1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('should return messages unchanged from autocompact', async () => {
    const deps = productionDeps()
    const messages = [createMockMessage('user', 'test')]
    const result = await deps.autocompact(messages)
    
    expect(result).toEqual(messages)
  })

  it('should return messages unchanged from microcompact', async () => {
    const deps = productionDeps()
    const messages = [createMockMessage('user', 'test')]
    const result = await deps.microcompact(messages)
    
    expect(result).toEqual(messages)
  })
})

describe('testDeps', () => {
  it('should create test dependencies with defaults', () => {
    const deps = testDeps()
    
    expect(deps.uuid()).toBe('test-uuid-0000-0000-0000-000000000000')
  })

  it('should allow overriding uuid', () => {
    const deps = testDeps({ uuid: () => 'custom-uuid' })
    
    expect(deps.uuid()).toBe('custom-uuid')
  })

  it('should allow overriding autocompact', async () => {
    const deps = testDeps({
      autocompact: async () => [createMockMessage('system', 'compacted')]
    })
    
    const messages = [createMockMessage('user', 'test')]
    const result = await deps.autocompact(messages)
    
    expect(result.length).toBe(1)
    expect(result[0]?.role).toBe('system')
  })

  it('should allow overriding callModel', async () => {
    const deps = testDeps({
      callModel: async function* () {
        yield createMockMessage('assistant', 'custom response')
      }
    })
    
    const results: Message[] = []
    for await (const msg of deps.callModel([], [])) {
      results.push(msg)
    }
    
    expect(results.length).toBe(1)
    expect(results[0]?.content).toBe('custom response')
  })
})

describe('createMockMessage', () => {
  it('should create a user message', () => {
    const msg = createMockMessage('user', 'Hello')
    
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('Hello')
  })

  it('should create an assistant message', () => {
    const msg = createMockMessage('assistant', 'Hi there')
    
    expect(msg.role).toBe('assistant')
    expect(msg.content).toBe('Hi there')
  })

  it('should create a system message', () => {
    const msg = createMockMessage('system', 'Instructions')
    
    expect(msg.role).toBe('system')
    expect(msg.content).toBe('Instructions')
  })
})

describe('createMockToolUse', () => {
  it('should create a tool use message', () => {
    const msg = createMockToolUse('Read', { file_path: '/test.txt' })
    
    expect(msg.role).toBe('assistant')
    expect(Array.isArray(msg.content)).toBe(true)
    
    const block = (msg.content as Array<{ type: string; name: string; input: Record<string, unknown> }>)[0]
    expect(block?.type).toBe('tool_use')
    expect(block?.name).toBe('Read')
    expect(block?.input).toEqual({ file_path: '/test.txt' })
  })
})

describe('createMockToolResult', () => {
  it('should create a tool result message', () => {
    const msg = createMockToolResult('tool-123', 'File content')
    
    expect(msg.role).toBe('user')
    expect(Array.isArray(msg.content)).toBe(true)
    
    const block = (msg.content as Array<{ type: string; tool_use_id: string; content: string }>)[0]
    expect(block?.type).toBe('tool_result')
    expect(block?.tool_use_id).toBe('tool-123')
    expect(block?.content).toBe('File content')
    expect(block?.is_error).toBeFalsy()
  })

  it('should create an error tool result', () => {
    const msg = createMockToolResult('tool-456', 'Error occurred', true)
    
    const block = (msg.content as Array<{ type: string; is_error: boolean }>)[0]
    expect(block?.is_error).toBe(true)
  })
})
