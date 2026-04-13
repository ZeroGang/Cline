import type { Tool, ToolResult } from '../tools/index.js'
import { Logger } from '../infrastructure/logging/logger.js'

export type HookPoint = 
  | 'PreToolUse'
  | 'PostToolUse'
  | 'OnError'
  | 'OnAbort'
  | 'PreQuery'
  | 'PostQuery'
  | 'OnContextCompress'
  | 'OnPlanCreate'
  | 'OnPlanApprove'

export interface HookContext {
  hookPoint: HookPoint
  timestamp: Date
  agentId?: string
  taskId?: string
  tool?: string
  input?: Record<string, unknown>
  output?: ToolResult
  error?: Error
  metadata?: Record<string, unknown>
}

export type HookResult = 
  | { action: 'continue' }
  | { action: 'skip'; reason?: string }
  | { action: 'modify'; input?: Record<string, unknown>; metadata?: Record<string, unknown> }
  | { action: 'abort'; reason: string }

export type HookHandler = (context: HookContext) => HookResult | Promise<HookResult>

export interface Hook {
  id: string
  name: string
  hookPoint: HookPoint
  handler: HookHandler
  priority: number
  enabled: boolean
  timeout?: number
}

export interface HookConfig {
  enabled: boolean
  maxHooks: number
  defaultTimeout: number
  continueOnError: boolean
}

const DEFAULT_CONFIG: HookConfig = {
  enabled: true,
  maxHooks: 100,
  defaultTimeout: 5000,
  continueOnError: true
}

export class HookSystem {
  private config: HookConfig
  private logger: Logger
  private hooks: Map<HookPoint, Hook[]> = new Map()

  constructor(config: Partial<HookConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.logger = new Logger('HookSystem')
  }

  registerHook(
    hookPoint: HookPoint,
    name: string,
    handler: HookHandler,
    options?: { priority?: number; enabled?: boolean; timeout?: number }
  ): string {
    const totalHooks = Array.from(this.hooks.values()).flat().length
    if (totalHooks >= this.config.maxHooks) {
      throw new Error(`Maximum hooks limit (${this.config.maxHooks}) reached`)
    }

    const id = `hook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const hook: Hook = {
      id,
      name,
      hookPoint,
      handler,
      priority: options?.priority ?? 50,
      enabled: options?.enabled ?? true,
      timeout: options?.timeout ?? this.config.defaultTimeout
    }

    if (!this.hooks.has(hookPoint)) {
      this.hooks.set(hookPoint, [])
    }

    this.hooks.get(hookPoint)!.push(hook)
    this.hooks.get(hookPoint)!.sort((a, b) => a.priority - b.priority)

    this.logger.info('Hook registered', { id, name, hookPoint, priority: hook.priority })

    return id
  }

  unregisterHook(hookId: string): boolean {
    for (const [point, hooks] of this.hooks.entries()) {
      const index = hooks.findIndex(h => h.id === hookId)
      if (index !== -1) {
        hooks.splice(index, 1)
        this.logger.info('Hook unregistered', { id: hookId, hookPoint: point })
        return true
      }
    }
    return false
  }

  enableHook(hookId: string): boolean {
    const hook = this.findHook(hookId)
    if (hook) {
      hook.enabled = true
      this.logger.info('Hook enabled', { id: hookId })
      return true
    }
    return false
  }

  disableHook(hookId: string): boolean {
    const hook = this.findHook(hookId)
    if (hook) {
      hook.enabled = false
      this.logger.info('Hook disabled', { id: hookId })
      return true
    }
    return false
  }

  async executeHooks(hookPoint: HookPoint, context: Omit<HookContext, 'hookPoint' | 'timestamp'>): Promise<HookResult> {
    if (!this.config.enabled) {
      return { action: 'continue' }
    }

    const hooks = this.hooks.get(hookPoint)?.filter(h => h.enabled) ?? []
    
    if (hooks.length === 0) {
      return { action: 'continue' }
    }

    const fullContext: HookContext = {
      ...context,
      hookPoint,
      timestamp: new Date()
    }

    let currentContext = { ...fullContext }

    for (const hook of hooks) {
      try {
        const result = await this.executeWithTimeout(
          hook.handler(currentContext),
          hook.timeout
        )

        this.logger.debug('Hook executed', { 
          hookId: hook.id, 
          hookPoint, 
          action: result.action 
        })

        switch (result.action) {
          case 'continue':
            break

          case 'skip':
            return result

          case 'modify':
            if (result.input) {
              currentContext.input = result.input
            }
            if (result.metadata) {
              currentContext.metadata = { ...currentContext.metadata, ...result.metadata }
            }
            break

          case 'abort':
            return result
        }
      } catch (error) {
        this.logger.error('Hook execution failed', {
          hookId: hook.id,
          hookPoint,
          error: error instanceof Error ? error.message : String(error)
        })

        if (!this.config.continueOnError) {
          return { action: 'abort', reason: `Hook ${hook.id} failed` }
        }
      }
    }

    if (currentContext.input !== fullContext.input || currentContext.metadata !== fullContext.metadata) {
      return { 
        action: 'modify', 
        input: currentContext.input, 
        metadata: currentContext.metadata 
      }
    }

    return { action: 'continue' }
  }

  getHooks(hookPoint?: HookPoint): Hook[] {
    if (hookPoint) {
      return this.hooks.get(hookPoint) ?? []
    }
    return Array.from(this.hooks.values()).flat()
  }

  getHook(hookId: string): Hook | undefined {
    return this.findHook(hookId)
  }

  clearHooks(hookPoint?: HookPoint): void {
    if (hookPoint) {
      this.hooks.delete(hookPoint)
      this.logger.info('Hooks cleared', { hookPoint })
    } else {
      this.hooks.clear()
      this.logger.info('All hooks cleared')
    }
  }

  getConfig(): HookConfig {
    return { ...this.config }
  }

  updateConfig(config: Partial<HookConfig>): void {
    this.config = { ...this.config, ...config }
    this.logger.info('HookSystem config updated')
  }

  private findHook(hookId: string): Hook | undefined {
    for (const hooks of this.hooks.values()) {
      const hook = hooks.find(h => h.id === hookId)
      if (hook) return hook
    }
    return undefined
  }

  private async executeWithTimeout<T>(promise: Promise<T>, timeout?: number): Promise<T> {
    if (!timeout) {
      return promise
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Hook execution timeout')), timeout)
    })

    return Promise.race([promise, timeoutPromise])
  }
}

export function createHookSystem(config?: Partial<HookConfig>): HookSystem {
  return new HookSystem(config)
}

export const commonHooks = {
  logging: (logger: Logger): { hookPoint: HookPoint; name: string; handler: HookHandler } => ({
    hookPoint: 'PreToolUse',
    name: 'logging-hook',
    handler: async (context) => {
      logger.info('Tool execution', { tool: context.tool, input: context.input })
      return { action: 'continue' }
    }
  }),

  validation: (validator: (input: Record<string, unknown>) => boolean): { hookPoint: HookPoint; name: string; handler: HookHandler } => ({
    hookPoint: 'PreToolUse',
    name: 'validation-hook',
    handler: async (context) => {
      if (context.input && !validator(context.input)) {
        return { action: 'abort', reason: 'Input validation failed' }
      }
      return { action: 'continue' }
    }
  }),

  errorReporting: (reporter: (error: Error, context: HookContext) => void): { hookPoint: HookPoint; name: string; handler: HookHandler } => ({
    hookPoint: 'OnError',
    name: 'error-reporting-hook',
    handler: async (context) => {
      if (context.error) {
        reporter(context.error, context)
      }
      return { action: 'continue' }
    }
  }),

  inputTransformation: (transformer: (input: Record<string, unknown>) => Record<string, unknown>): { hookPoint: HookPoint; name: string; handler: HookHandler } => ({
    hookPoint: 'PreToolUse',
    name: 'input-transformation-hook',
    handler: async (context) => {
      if (context.input) {
        return { action: 'modify', input: transformer(context.input) }
      }
      return { action: 'continue' }
    }
  })
}
