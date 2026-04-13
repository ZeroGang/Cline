import type { AgentId, AgentStatus } from '../types.js'
import type { AgentEvent, AgentMetrics, Task } from '../scheduler/types.js'
import type { AgentContext, AgentDefinition, QueryDeps } from './types.js'
import { agentLoop, createAgentLoopConfig } from './loop.js'

export class AgentInstanceImpl {
  readonly id: AgentId
  private _status: AgentStatus = 'idle'
  private _currentTaskId: string | null = null
  private _metrics: AgentMetrics = {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    toolCalls: 0,
    turns: 0
  }
  private context: AgentContext
  private definition: AgentDefinition
  private deps: QueryDeps
  private currentAbortController: AbortController | null = null
  private disposed = false

  constructor(
    id: AgentId,
    definition: AgentDefinition,
    context: AgentContext,
    deps: QueryDeps
  ) {
    this.id = id
    this.definition = definition
    this.context = context
    this.deps = deps
  }

  get status(): AgentStatus {
    return this._status
  }

  get currentTaskId(): string | null {
    return this._currentTaskId
  }

  /** 看板展示名；未设置时由调用方回退为 id */
  getDisplayName(): string | undefined {
    const d = this.definition.displayName?.trim()
    return d || undefined
  }

  getAvatar(): string | undefined {
    const a = this.definition.avatar?.trim()
    return a || undefined
  }

  async *execute(task: Task): AsyncGenerator<AgentEvent> {
    if (this.disposed) {
      throw new Error('Agent instance has been disposed')
    }

    if (this._status === 'busy') {
      throw new Error('Agent is already executing a task')
    }

    this._status = 'busy'
    this._currentTaskId = task.id
    this.currentAbortController = new AbortController()

    const executionContext = this.createExecutionContext()

    try {
      const config = createAgentLoopConfig(this.definition, this.deps)
      
      for await (const event of agentLoop(task, executionContext, config)) {
        this.updateMetrics(event)
        yield event

        if (event.type === 'completed' || event.type === 'aborted') {
          break
        }
      }

      this._status = 'idle'
    } catch (error) {
      this._status = 'error'
      throw error
    } finally {
      this._currentTaskId = null
      this.currentAbortController = null
    }
  }

  async interrupt(): Promise<void> {
    if (this.currentAbortController) {
      this.currentAbortController.abort()
    }

    this.context.abortController.abort()
  }

  getMetrics(): AgentMetrics {
    return { ...this._metrics }
  }

  async dispose(): Promise<void> {
    if (this._status === 'busy') {
      await this.interrupt()
    }

    this.disposed = true
    this._status = 'idle'
    this._currentTaskId = null
    this.currentAbortController = null
  }

  private createExecutionContext(): AgentContext {
    return {
      ...this.context,
      abortController: this.currentAbortController || this.context.abortController
    }
  }

  private updateMetrics(event: AgentEvent): void {
    if (event.type === 'turn_end' && event.data && typeof event.data === 'object') {
      const data = event.data as { turn?: number }
      if (data.turn) {
        this._metrics.turns = data.turn
      }
    }

    if (event.type === 'tool_start') {
      this._metrics.toolCalls++
    }

    if (event.type === 'model_response' && event.data && typeof event.data === 'object') {
      const data = event.data as { message?: { usage?: { input_tokens?: number; output_tokens?: number } } }
      if (data.message?.usage) {
        this._metrics.inputTokens += data.message.usage.input_tokens || 0
        this._metrics.outputTokens += data.message.usage.output_tokens || 0
        this._metrics.totalTokens = this._metrics.inputTokens + this._metrics.outputTokens
      }
    }
  }
}

export function createAgentInstance(
  id: AgentId,
  definition: AgentDefinition,
  context: AgentContext,
  deps: QueryDeps
): AgentInstanceImpl {
  return new AgentInstanceImpl(id, definition, context, deps)
}
