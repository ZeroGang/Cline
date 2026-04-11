import type { ToolRegistry } from '../tools/registry.js'
import type { ToolResult } from '../tools/types.js'
import type { Message, ContentBlock } from './types.js'

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolExecutionResult {
  toolUseId: string
  toolName: string
  result: ToolResult
  duration: number
}

export interface StreamingExecutorConfig {
  concurrency: number
  timeout: number
}

const DEFAULT_EXECUTOR_CONFIG: StreamingExecutorConfig = {
  concurrency: 1,
  timeout: 300000
}

export class StreamingToolExecutor {
  private registry: ToolRegistry
  private pending: Map<string, Promise<ToolExecutionResult>> = new Map()
  private completed: ToolExecutionResult[] = []
  private config: StreamingExecutorConfig
  private hasAddedTools: boolean = false

  constructor(registry: ToolRegistry, config: Partial<StreamingExecutorConfig> = {}) {
    this.registry = registry
    this.config = { ...DEFAULT_EXECUTOR_CONFIG, ...config }
  }

  addTool(toolBlock: ToolUseBlock): void {
    if (this.pending.has(toolBlock.id)) {
      return
    }

    this.hasAddedTools = true

    const tool = this.registry.get(toolBlock.name)
    if (!tool) {
      this.completed.push({
        toolUseId: toolBlock.id,
        toolName: toolBlock.name,
        result: {
          output: '',
          error: true,
          metadata: { errorMessage: `Unknown tool: ${toolBlock.name}` }
        },
        duration: 0
      })
      return
    }

    const startTime = Date.now()
    const promise = Promise.resolve().then(async () => {
      try {
        const validatedInput = tool.inputSchema.parse(toolBlock.input)
        const result = await Promise.race([
          tool.execute(validatedInput),
          this.createTimeoutPromise()
        ])
        
        const executionResult: ToolExecutionResult = {
          toolUseId: toolBlock.id,
          toolName: toolBlock.name,
          result,
          duration: Date.now() - startTime
        }
        
        this.completed.push(executionResult)
        return executionResult
      } catch (error) {
        const executionResult: ToolExecutionResult = {
          toolUseId: toolBlock.id,
          toolName: toolBlock.name,
          result: {
            output: '',
            error: true,
            metadata: { 
              errorMessage: error instanceof Error ? error.message : String(error)
            }
          },
          duration: Date.now() - startTime
        }
        
        this.completed.push(executionResult)
        return executionResult
      }
    })

    this.pending.set(toolBlock.id, promise)
  }

  private createTimeoutPromise(): Promise<ToolResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Tool execution timeout after ${this.config.timeout}ms`))
      }, this.config.timeout)
    })
  }

  async waitForCompletion(): Promise<ToolExecutionResult[]> {
    const pendingPromises = Array.from(this.pending.values())
    await Promise.all(pendingPromises)
    return this.completed
  }

  getCompletedResults(): ToolExecutionResult[] {
    return [...this.completed]
  }

  hasPending(): boolean {
    return this.hasAddedTools && this.completed.length === 0
  }

  hasCompleted(): boolean {
    return this.completed.length > 0
  }

  createToolResultMessages(): Message[] {
    const messages: Message[] = []
    
    for (const result of this.completed) {
      const isError = result.result.error === true
      const content: ContentBlock = {
        type: 'tool_result',
        tool_use_id: result.toolUseId,
        content: isError
          ? `Error: ${result.result.metadata?.errorMessage || 'Unknown error'}`
          : (typeof result.result.output === 'string' 
              ? result.result.output 
              : JSON.stringify(result.result.output, null, 2)),
        is_error: isError
      }
      
      messages.push({
        role: 'user',
        content: [content]
      })
    }
    
    return messages
  }

  clear(): void {
    this.pending.clear()
    this.completed = []
    this.hasAddedTools = false
  }
}

export function createStreamingExecutor(
  registry: ToolRegistry,
  config?: Partial<StreamingExecutorConfig>
): StreamingToolExecutor {
  return new StreamingToolExecutor(registry, config)
}
