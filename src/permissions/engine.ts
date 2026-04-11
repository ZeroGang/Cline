import type { PermissionRule, PermissionCheckResult } from './types.js'
import type { PermissionDecision } from '../types.js'

export class RuleEngine {
  private rules: PermissionRule[] = []

  addRule(rule: PermissionRule): void {
    this.rules.push(rule)
    this.rules.sort((a, b) => b.priority - a.priority)
  }

  addRules(rules: PermissionRule[]): void {
    rules.forEach(rule => this.addRule(rule))
  }

  removeRule(rule: PermissionRule): boolean {
    const index = this.rules.indexOf(rule)
    if (index !== -1) {
      this.rules.splice(index, 1)
      return true
    }
    return false
  }

  clearRules(): void {
    this.rules = []
  }

  getRules(): PermissionRule[] {
    return [...this.rules]
  }

  match(toolName: string, input?: Record<string, unknown>): PermissionCheckResult {
    for (const rule of this.rules) {
      if (this.matchesRule(rule, toolName, input)) {
        return {
          decision: rule.type,
          rule,
          reason: `Matched rule with priority ${rule.priority}`
        }
      }
    }

    return {
      decision: 'ask',
      reason: 'No matching rule found'
    }
  }

  private matchesRule(rule: PermissionRule, toolName: string, input?: Record<string, unknown>): boolean {
    if (rule.tool && rule.tool !== toolName) {
      return false
    }

    if (rule.pattern) {
      const regex = new RegExp(rule.pattern)
      if (!regex.test(toolName)) {
        return false
      }
    }

    if (rule.path && input) {
      const pathInput = input.file_path || input.path || input.url
      if (typeof pathInput === 'string') {
        const pathRegex = new RegExp(rule.path)
        if (!pathRegex.test(pathInput)) {
          return false
        }
      } else {
        return false
      }
    }

    return true
  }

  checkPermission(toolName: string, input?: Record<string, unknown>): PermissionDecision {
    const result = this.match(toolName, input)
    return result.decision
  }
}

export function createRuleEngine(rules?: PermissionRule[]): RuleEngine {
  const engine = new RuleEngine()
  if (rules) {
    engine.addRules(rules)
  }
  return engine
}

export const DEFAULT_RULES: PermissionRule[] = [
  { type: 'allow', tool: 'Read', priority: 100 },
  { type: 'allow', tool: 'Glob', priority: 100 },
  { type: 'allow', tool: 'Grep', priority: 100 },
  { type: 'ask', tool: 'Write', priority: 100 },
  { type: 'ask', tool: 'Edit', priority: 100 },
  { type: 'ask', tool: 'WebFetch', priority: 100 },
  { type: 'ask', tool: 'WebSearch', priority: 100 },
  { type: 'allow', tool: 'AskUserQuestion', priority: 100 },
]
