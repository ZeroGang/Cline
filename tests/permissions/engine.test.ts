import { describe, it, expect, beforeEach } from 'vitest'
import { RuleEngine, createRuleEngine, DEFAULT_RULES } from '../../src/permissions/engine.js'
import type { PermissionRule } from '../../src/permissions/types.js'

describe('RuleEngine', () => {
  let engine: RuleEngine

  beforeEach(() => {
    engine = createRuleEngine()
  })

  describe('addRule', () => {
    it('should add a rule', () => {
      const rule: PermissionRule = { type: 'allow', tool: 'Read', priority: 100 }
      engine.addRule(rule)
      expect(engine.getRules().length).toBe(1)
    })

    it('should sort rules by priority descending', () => {
      engine.addRule({ type: 'allow', tool: 'Read', priority: 100 })
      engine.addRule({ type: 'deny', tool: 'Write', priority: 200 })
      engine.addRule({ type: 'ask', tool: 'Bash', priority: 150 })

      const rules = engine.getRules()
      expect(rules[0]?.priority).toBe(200)
      expect(rules[1]?.priority).toBe(150)
      expect(rules[2]?.priority).toBe(100)
    })
  })

  describe('addRules', () => {
    it('should add multiple rules', () => {
      engine.addRules([
        { type: 'allow', tool: 'Read', priority: 100 },
        { type: 'deny', tool: 'Write', priority: 200 }
      ])
      expect(engine.getRules().length).toBe(2)
    })
  })

  describe('removeRule', () => {
    it('should remove a rule', () => {
      const rule: PermissionRule = { type: 'allow', tool: 'Read', priority: 100 }
      engine.addRule(rule)
      expect(engine.removeRule(rule)).toBe(true)
      expect(engine.getRules().length).toBe(0)
    })

    it('should return false for non-existent rule', () => {
      expect(engine.removeRule({ type: 'allow', tool: 'Read', priority: 100 })).toBe(false)
    })
  })

  describe('clearRules', () => {
    it('should clear all rules', () => {
      engine.addRules([
        { type: 'allow', tool: 'Read', priority: 100 },
        { type: 'deny', tool: 'Write', priority: 200 }
      ])
      engine.clearRules()
      expect(engine.getRules().length).toBe(0)
    })
  })

  describe('match', () => {
    it('should match rule by tool name', () => {
      engine.addRule({ type: 'allow', tool: 'Read', priority: 100 })
      const result = engine.match('Read')
      expect(result.decision).toBe('allow')
      expect(result.rule?.tool).toBe('Read')
    })

    it('should return ask when no rule matches', () => {
      engine.addRule({ type: 'allow', tool: 'Read', priority: 100 })
      const result = engine.match('Write')
      expect(result.decision).toBe('ask')
      expect(result.reason).toContain('No matching rule')
    })

    it('should match by pattern', () => {
      engine.addRule({ type: 'deny', pattern: '.*Fetch', priority: 100 })
      const result = engine.match('WebFetch')
      expect(result.decision).toBe('deny')
    })

    it('should match by path in input', () => {
      engine.addRule({ type: 'deny', tool: 'Read', path: '/etc/.*', priority: 100 })
      const result = engine.match('Read', { file_path: '/etc/passwd' })
      expect(result.decision).toBe('deny')
    })

    it('should return highest priority match', () => {
      engine.addRules([
        { type: 'allow', tool: 'Read', priority: 100 },
        { type: 'deny', tool: 'Read', priority: 200 }
      ])
      const result = engine.match('Read')
      expect(result.decision).toBe('deny')
      expect(result.rule?.priority).toBe(200)
    })
  })

  describe('checkPermission', () => {
    it('should return decision directly', () => {
      engine.addRule({ type: 'allow', tool: 'Read', priority: 100 })
      expect(engine.checkPermission('Read')).toBe('allow')
    })
  })
})

describe('createRuleEngine', () => {
  it('should create engine with initial rules', () => {
    const engine = createRuleEngine([
      { type: 'allow', tool: 'Read', priority: 100 }
    ])
    expect(engine.getRules().length).toBe(1)
  })

  it('should create empty engine without rules', () => {
    const engine = createRuleEngine()
    expect(engine.getRules().length).toBe(0)
  })
})

describe('DEFAULT_RULES', () => {
  it('should have default rules for builtin tools', () => {
    expect(DEFAULT_RULES.length).toBeGreaterThan(0)
    expect(DEFAULT_RULES.find(r => r.tool === 'Read')?.type).toBe('allow')
    expect(DEFAULT_RULES.find(r => r.tool === 'Write')?.type).toBe('ask')
    expect(DEFAULT_RULES.find(r => r.tool === 'Edit')?.type).toBe('ask')
  })
})
