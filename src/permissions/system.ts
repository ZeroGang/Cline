import type { PermissionMode, PermissionDecision } from '../types.js'
import type { PermissionRule, PermissionCheckResult, PermissionModeConfig } from './types.js'
import { RuleEngine, DEFAULT_RULES } from './engine.js'
import { PERMISSION_MODE_CONFIGS } from './types.js'

export interface PermissionSystemConfig {
  mode: PermissionMode
  rules?: PermissionRule[]
  sessionCacheEnabled?: boolean
}

export class PermissionSystem {
  private mode: PermissionMode
  private modeConfig: PermissionModeConfig
  private ruleEngine: RuleEngine
  private sessionCache: Map<string, PermissionDecision>
  private sessionCacheEnabled: boolean

  constructor(config: PermissionSystemConfig) {
    this.mode = config.mode
    this.modeConfig = PERMISSION_MODE_CONFIGS[config.mode]
    this.ruleEngine = new RuleEngine()
    this.sessionCache = new Map()
    this.sessionCacheEnabled = config.sessionCacheEnabled ?? true

    if (config.rules) {
      this.ruleEngine.addRules(config.rules)
    } else {
      this.ruleEngine.addRules(DEFAULT_RULES)
    }
  }

  getMode(): PermissionMode {
    return this.mode
  }

  setMode(mode: PermissionMode): void {
    this.mode = mode
    this.modeConfig = PERMISSION_MODE_CONFIGS[mode]
    this.sessionCache.clear()
  }

  getModeConfig(): PermissionModeConfig {
    return this.modeConfig
  }

  addRule(rule: PermissionRule): void {
    this.ruleEngine.addRule(rule)
  }

  addRules(rules: PermissionRule[]): void {
    this.ruleEngine.addRules(rules)
  }

  clearRules(): void {
    this.ruleEngine.clearRules()
  }

  checkPermissions(
    toolName: string,
    input?: Record<string, unknown>,
    toolPermissionHint?: PermissionDecision
  ): PermissionCheckResult {
    const cacheKey = this.getCacheKey(toolName, input)
    
    if (this.sessionCacheEnabled && this.sessionCache.has(cacheKey)) {
      return {
        decision: this.sessionCache.get(cacheKey)!,
        reason: 'Retrieved from session cache'
      }
    }

    const result = this.performPermissionCheck(toolName, input, toolPermissionHint)

    if (this.sessionCacheEnabled && result.decision !== 'ask') {
      this.sessionCache.set(cacheKey, result.decision)
    }

    return result
  }

  private performPermissionCheck(
    toolName: string,
    input?: Record<string, unknown>,
    toolPermissionHint?: PermissionDecision
  ): PermissionCheckResult {
    if (this.modeConfig.deniedTools.includes(toolName)) {
      return {
        decision: 'deny',
        reason: `Tool ${toolName} is denied in ${this.mode} mode`
      }
    }

    if (this.modeConfig.allowedTools.includes(toolName)) {
      return {
        decision: 'allow',
        reason: `Tool ${toolName} is allowed in ${this.mode} mode`
      }
    }

    const ruleResult = this.ruleEngine.match(toolName, input)
    if (ruleResult.decision !== 'ask') {
      return ruleResult
    }

    if (toolPermissionHint) {
      if (this.modeConfig.requireConfirmation.includes(toolName)) {
        return {
          decision: 'ask',
          reason: `Tool ${toolName} requires confirmation in ${this.mode} mode`
        }
      }
      return {
        decision: toolPermissionHint,
        reason: 'Based on tool permission hint'
      }
    }

    if (this.modeConfig.requireConfirmation.includes(toolName)) {
      return {
        decision: 'ask',
        reason: `Tool ${toolName} requires confirmation in ${this.mode} mode`
      }
    }

    return {
      decision: 'ask',
      reason: 'No explicit permission found, asking user'
    }
  }

  private getCacheKey(toolName: string, input?: Record<string, unknown>): string {
    if (!input) {
      return toolName
    }
    try {
      return `${toolName}:${JSON.stringify(input)}`
    } catch {
      return toolName
    }
  }

  clearSessionCache(): void {
    this.sessionCache.clear()
  }

  grantPermission(toolName: string, input?: Record<string, unknown>): void {
    const cacheKey = this.getCacheKey(toolName, input)
    this.sessionCache.set(cacheKey, 'allow')
  }

  denyPermission(toolName: string, input?: Record<string, unknown>): void {
    const cacheKey = this.getCacheKey(toolName, input)
    this.sessionCache.set(cacheKey, 'deny')
  }
}

export function createPermissionSystem(config: PermissionSystemConfig): PermissionSystem {
  return new PermissionSystem(config)
}

export function createDefaultPermissionSystem(mode: PermissionMode = 'default'): PermissionSystem {
  return new PermissionSystem({ mode })
}
