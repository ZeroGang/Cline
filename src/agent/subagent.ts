import type { AgentContext, AgentDefinition } from './types.js'
import type { AgentId, TaskId } from '../types.js'
import type { Task, AgentEvent } from '../scheduler/types.js'
import type { ToolRegistry } from '../tools/registry.js'
import type { Store } from '../infrastructure/state/store.js'
import type { AppState } from '../infrastructure/state/index.js'
import type { QueryDeps } from './types.js'
import { AgentInstanceImpl, createAgentInstance } from './instance.js'
import { ToolRegistry as ToolRegistryClass } from '../tools/registry.js'
import { createDefaultPermissionSystem } from '../permissions/system.js'
import { Store as StoreClass } from '../infrastructure/state/store.js'
import { DEFAULT_APP_STATE } from '../infrastructure/state/index.js'
import { Logger } from '../infrastructure/logging/logger.js'

export interface SubagentConfig {
  parentContext: AgentContext
  definition: AgentDefinition
  parentAbortController: AbortController
  tools?: ToolRegistry
  store?: Store<AppState>
}

export interface SubagentExecutionResult {
  taskId: TaskId
  agentId: AgentId
  success: boolean
  result?: unknown
  error?: string
  events: AgentEvent[]
}

export function createChildAbortController(parent: AbortController): AbortController {
  const child = new AbortController()

  if (parent.signal.aborted) {
    child.abort()
    return child
  }

  parent.signal.addEventListener('abort', () => {
    child.abort()
  })

  return child
}

export function createSubagentContext(config: SubagentConfig): AgentContext {
  const { parentContext, definition, parentAbortController, tools, store } = config

  const childAbortController = createChildAbortController(parentAbortController)

  const isolatedStore = store || new StoreClass(DEFAULT_APP_STATE)

  const isolatedTools = tools || new ToolRegistryClass()

  const permissionMode = definition.permissionMode || parentContext.toolPermissionContext.mode

  const subagentId = `subagent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  return {
    messages: [],
    abortController: childAbortController,
    tools: isolatedTools,
    permissionSystem: createDefaultPermissionSystem(permissionMode),
    setAppState: (updater) => isolatedStore.setState(updater),
    readFileState: new Map(),
    contentReplacementState: new Map(),
    toolPermissionContext: {
      mode: permissionMode,
      sessionId: subagentId
    },
    mcpTools: [],
    store: isolatedStore
  }
}

export class SubagentExecutor {
  private definition: AgentDefinition
  private parentContext: AgentContext
  private deps: QueryDeps
  private logger: Logger
  private activeSubagents: Map<TaskId, AgentInstanceImpl> = new Map()
  private results: Map<TaskId, SubagentExecutionResult> = new Map()

  constructor(
    definition: AgentDefinition,
    parentContext: AgentContext,
    deps: QueryDeps
  ) {
    this.definition = definition
    this.parentContext = parentContext
    this.deps = deps
    this.logger = new Logger({ source: 'SubagentExecutor' })
  }

  async executeSync(
    task: Task,
    options?: { timeout?: number }
  ): Promise<SubagentExecutionResult> {
    const taskId = task.id
    const agentId = `subagent-${taskId}` as AgentId

    this.logger.info('Starting synchronous subagent execution', { taskId, agentId })

    const subagentContext = createSubagentContext({
      parentContext: this.parentContext,
      definition: this.definition,
      parentAbortController: this.parentContext.abortController
    })

    const agent = createAgentInstance(
      agentId,
      this.definition,
      subagentContext,
      this.deps
    )

    this.activeSubagents.set(taskId, agent)

    const events: AgentEvent[] = []
    const timeout = options?.timeout || 300000

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Subagent execution timeout')), timeout)
      })

      const executionPromise = (async () => {
        for await (const event of agent.execute(task)) {
          events.push(event)
        }
      })()

      await Promise.race([executionPromise, timeoutPromise])

      const result: SubagentExecutionResult = {
        taskId,
        agentId,
        success: true,
        events
      }

      this.results.set(taskId, result)
      this.logger.info('Synchronous subagent execution completed', { taskId })

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      const result: SubagentExecutionResult = {
        taskId,
        agentId,
        success: false,
        error: errorMessage,
        events
      }

      this.results.set(taskId, result)
      this.logger.error('Synchronous subagent execution failed', { taskId, error: errorMessage })

      return result
    } finally {
      await agent.dispose()
      this.activeSubagents.delete(taskId)
    }
  }

  executeAsync(
    task: Task,
    options?: { timeout?: number }
  ): TaskId {
    const taskId = task.id
    const agentId = `subagent-${taskId}` as AgentId

    this.logger.info('Starting asynchronous subagent execution', { taskId, agentId })

    const subagentContext = createSubagentContext({
      parentContext: this.parentContext,
      definition: this.definition,
      parentAbortController: this.parentContext.abortController
    })

    const agent = createAgentInstance(
      agentId,
      this.definition,
      subagentContext,
      this.deps
    )

    this.activeSubagents.set(taskId, agent)

    const events: AgentEvent[] = []
    const timeout = options?.timeout || 300000

    const execute = async () => {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Subagent execution timeout')), timeout)
        })

        const executionPromise = (async () => {
          for await (const event of agent.execute(task)) {
            events.push(event)
          }
        })()

        await Promise.race([executionPromise, timeoutPromise])

        const result: SubagentExecutionResult = {
          taskId,
          agentId,
          success: true,
          events
        }

        this.results.set(taskId, result)
        this.logger.info('Asynchronous subagent execution completed', { taskId })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        
        const result: SubagentExecutionResult = {
          taskId,
          agentId,
          success: false,
          error: errorMessage,
          events
        }

        this.results.set(taskId, result)
        this.logger.error('Asynchronous subagent execution failed', { taskId, error: errorMessage })
      } finally {
        await agent.dispose()
        this.activeSubagents.delete(taskId)
      }
    }

    execute()

    return taskId
  }

  getResult(taskId: TaskId): SubagentExecutionResult | undefined {
    return this.results.get(taskId)
  }

  hasResult(taskId: TaskId): boolean {
    return this.results.has(taskId)
  }

  isActive(taskId: TaskId): boolean {
    return this.activeSubagents.has(taskId)
  }

  async interrupt(taskId: TaskId): Promise<void> {
    const agent = this.activeSubagents.get(taskId)
    if (agent) {
      await agent.interrupt()
      this.logger.info('Subagent interrupted', { taskId })
    }
  }

  async interruptAll(): Promise<void> {
    const interruptions = Array.from(this.activeSubagents.entries()).map(
      async ([taskId, agent]) => {
        await agent.interrupt()
        this.logger.info('Subagent interrupted', { taskId })
      }
    )

    await Promise.all(interruptions)
  }

  getActiveCount(): number {
    return this.activeSubagents.size
  }

  clearResults(): void {
    this.results.clear()
  }
}

export function createSubagentExecutor(
  definition: AgentDefinition,
  parentContext: AgentContext,
  deps: QueryDeps
): SubagentExecutor {
  return new SubagentExecutor(definition, parentContext, deps)
}
