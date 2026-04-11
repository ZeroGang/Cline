import { describe, it, expect, beforeEach } from 'vitest'
import { 
  StreamingToolExecutor, 
  createStreamingExecutor,
  type ToolUseBlock
} from '../../src/agent/streaming-executor.js'
import { ToolRegistry, createTool } from '../../src/tools/registry.js'
import { z } from 'zod'

describe('StreamingToolExecutor', () => {
  let registry: ToolRegistry
  let executor: StreamingToolExecutor

  beforeEach(() => {
    registry = new ToolRegistry()
    
    registry.register(createTool({
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: z.object({ message: z.string() }),
      execute: async (input) => {
        return {
          output: `Echo: ${input.message}`
        }
      }
    }))

    registry.register(createTool({
      name: 'failing_tool',
      description: 'A tool that fails',
      inputSchema: z.object({}),
      execute: async () => {
        throw new Error('Tool execution failed')
      }
    }))

    registry.register(createTool({
      name: 'slow_tool',
      description: 'A slow tool',
      inputSchema: z.object({}),
      execute: async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return { output: 'slow result' }
      }
    }))

    executor = createStreamingExecutor(registry)
  })

  describe('addTool', () => {
    it('should add tool to pending queue', () => {
      const toolBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'test_tool',
        input: { message: 'hello' }
      }
      
      executor.addTool(toolBlock)
      expect(executor.hasPending()).toBe(true)
    })

    it('should handle unknown tool', async () => {
      const toolBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-unknown',
        name: 'unknown_tool',
        input: {}
      }
      
      executor.addTool(toolBlock)
      const results = await executor.waitForCompletion()
      
      expect(results).toHaveLength(1)
      expect(results[0]?.result.error).toBe(true)
      expect(results[0]?.result.metadata?.errorMessage).toContain('Unknown tool')
    })

    it('should not add duplicate tools', () => {
      const toolBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'test_tool',
        input: { message: 'hello' }
      }
      
      executor.addTool(toolBlock)
      executor.addTool(toolBlock)
      
      expect(executor.hasPending()).toBe(true)
    })
  })

  describe('waitForCompletion', () => {
    it('should execute tool and return result', async () => {
      const toolBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'test_tool',
        input: { message: 'hello' }
      }
      
      executor.addTool(toolBlock)
      const results = await executor.waitForCompletion()
      
      expect(results).toHaveLength(1)
      expect(results[0]?.toolUseId).toBe('tool-1')
      expect(results[0]?.toolName).toBe('test_tool')
      expect(results[0]?.result.output).toBe('Echo: hello')
      expect(results[0]?.result.error).toBeFalsy()
    })

    it('should handle tool execution errors', async () => {
      const toolBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-fail',
        name: 'failing_tool',
        input: {}
      }
      
      executor.addTool(toolBlock)
      const results = await executor.waitForCompletion()
      
      expect(results).toHaveLength(1)
      expect(results[0]?.result.error).toBe(true)
      expect(results[0]?.result.metadata?.errorMessage).toBe('Tool execution failed')
    })

    it('should execute multiple tools concurrently', async () => {
      const toolBlock1: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'test_tool',
        input: { message: 'first' }
      }
      
      const toolBlock2: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-2',
        name: 'test_tool',
        input: { message: 'second' }
      }
      
      executor.addTool(toolBlock1)
      executor.addTool(toolBlock2)
      
      const results = await executor.waitForCompletion()
      
      expect(results).toHaveLength(2)
      expect(results.map(r => r.toolUseId)).toContain('tool-1')
      expect(results.map(r => r.toolUseId)).toContain('tool-2')
    })
  })

  describe('getCompletedResults', () => {
    it('should return empty array initially', () => {
      expect(executor.getCompletedResults()).toEqual([])
    })

    it('should return completed results after execution', async () => {
      const toolBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'test_tool',
        input: { message: 'test' }
      }
      
      executor.addTool(toolBlock)
      await executor.waitForCompletion()
      
      const results = executor.getCompletedResults()
      expect(results).toHaveLength(1)
    })
  })

  describe('createToolResultMessages', () => {
    it('should create tool result messages', async () => {
      const toolBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'test_tool',
        input: { message: 'test' }
      }
      
      executor.addTool(toolBlock)
      await executor.waitForCompletion()
      
      const messages = executor.createToolResultMessages()
      
      expect(messages).toHaveLength(1)
      expect(messages[0]?.role).toBe('user')
      
      const content = messages[0]?.content
      if (Array.isArray(content)) {
        expect(content[0]?.type).toBe('tool_result')
        expect(content[0]?.tool_use_id).toBe('tool-1')
        expect(content[0]?.content).toBe('Echo: test')
        expect(content[0]?.is_error).toBeFalsy()
      }
    })

    it('should create error messages for failed tools', async () => {
      const toolBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-fail',
        name: 'failing_tool',
        input: {}
      }
      
      executor.addTool(toolBlock)
      await executor.waitForCompletion()
      
      const messages = executor.createToolResultMessages()
      const content = messages[0]?.content
      
      if (Array.isArray(content)) {
        expect(content[0]?.is_error).toBe(true)
        expect(content[0]?.content).toContain('Error:')
      }
    })
  })

  describe('clear', () => {
    it('should clear pending and completed tools', async () => {
      const toolBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'test_tool',
        input: { message: 'test' }
      }
      
      executor.addTool(toolBlock)
      await executor.waitForCompletion()
      
      executor.clear()
      
      expect(executor.hasPending()).toBe(false)
      expect(executor.getCompletedResults()).toEqual([])
    })
  })

  describe('hasPending', () => {
    it('should return false initially', () => {
      expect(executor.hasPending()).toBe(false)
    })

    it('should return true when tools are pending', () => {
      const toolBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'slow_tool',
        input: {}
      }
      
      executor.addTool(toolBlock)
      expect(executor.hasPending()).toBe(true)
    })

    it('should return false after completion', async () => {
      const toolBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'test_tool',
        input: { message: 'test' }
      }
      
      executor.addTool(toolBlock)
      await executor.waitForCompletion()
      
      expect(executor.hasPending()).toBe(false)
    })
  })
})

describe('createStreamingExecutor', () => {
  it('should create executor with default config', () => {
    const registry = new ToolRegistry()
    const executor = createStreamingExecutor(registry)
    
    expect(executor).toBeInstanceOf(StreamingToolExecutor)
  })

  it('should create executor with custom config', () => {
    const registry = new ToolRegistry()
    const executor = createStreamingExecutor(registry, {
      concurrency: 5,
      timeout: 60000
    })
    
    expect(executor).toBeInstanceOf(StreamingToolExecutor)
  })
})
