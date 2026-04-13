import { describe, it, expect, beforeEach, vi } from 'vitest'
import { 
  AlertManager, 
  HighErrorRateRule, 
  CostThresholdRule, 
  AgentStuckRule,
  QueueBacklogRule,
  createAlertManager,
  createDefaultRules,
  type AlertRule,
  type AlertEvaluationResult
} from '../../src/monitoring/alerts.js'
import { MetricsCollector } from '../../src/monitoring/metrics.js'

describe('AlertManager', () => {
  let manager: AlertManager

  beforeEach(() => {
    manager = createAlertManager({ evaluationInterval: 100 })
  })

  afterEach(() => {
    manager.stop()
  })

  describe('rule management', () => {
    it('should register rule', () => {
      const rule: AlertRule = {
        name: 'test-rule',
        description: 'Test rule',
        severity: 'warning',
        enabled: true,
        evaluate: () => ({ shouldFire: false, value: 0, threshold: 1, message: '' })
      }

      manager.registerRule(rule)

      expect(manager.getRule('test-rule')).toBe(rule)
    })

    it('should unregister rule', () => {
      const rule: AlertRule = {
        name: 'test-rule',
        description: 'Test rule',
        severity: 'warning',
        enabled: true,
        evaluate: () => ({ shouldFire: false, value: 0, threshold: 1, message: '' })
      }

      manager.registerRule(rule)
      const result = manager.unregisterRule('test-rule')

      expect(result).toBe(true)
      expect(manager.getRule('test-rule')).toBeUndefined()
    })

    it('should return all rules', () => {
      const rule1: AlertRule = {
        name: 'rule-1',
        description: 'Rule 1',
        severity: 'warning',
        enabled: true,
        evaluate: () => ({ shouldFire: false, value: 0, threshold: 1, message: '' })
      }
      const rule2: AlertRule = {
        name: 'rule-2',
        description: 'Rule 2',
        severity: 'critical',
        enabled: true,
        evaluate: () => ({ shouldFire: false, value: 0, threshold: 1, message: '' })
      }

      manager.registerRule(rule1)
      manager.registerRule(rule2)

      const rules = manager.getAllRules()
      expect(rules.length).toBe(2)
    })
  })

  describe('alert lifecycle', () => {
    it('should fire alert when condition met', async () => {
      const rule: AlertRule = {
        name: 'test-rule',
        description: 'Test rule',
        severity: 'warning',
        enabled: true,
        evaluate: () => ({ 
          shouldFire: true, 
          value: 5, 
          threshold: 3, 
          message: 'Value exceeds threshold' 
        })
      }

      manager.registerRule(rule)
      manager.start()

      await new Promise(resolve => setTimeout(resolve, 150))

      const alerts = manager.getActiveAlerts()
      expect(alerts.length).toBe(1)
      expect(alerts[0].name).toBe('test-rule')
      expect(alerts[0].state).toBe('firing')
    })

    it('should resolve alert when condition clears', async () => {
      let shouldFire = true
      const rule: AlertRule = {
        name: 'test-rule',
        description: 'Test rule',
        severity: 'warning',
        enabled: true,
        evaluate: () => ({ 
          shouldFire, 
          value: shouldFire ? 5 : 0, 
          threshold: 3, 
          message: shouldFire ? 'Value exceeds threshold' : 'OK' 
        })
      }

      manager.registerRule(rule)
      manager.start()

      await new Promise(resolve => setTimeout(resolve, 150))
      expect(manager.getActiveAlerts().length).toBe(1)

      shouldFire = false

      await new Promise(resolve => setTimeout(resolve, 150))
      expect(manager.getActiveAlerts().length).toBe(0)

      const history = manager.getAlertHistory()
      expect(history.some(a => a.state === 'resolved')).toBe(true)
    })

    it('should call onFire callback', async () => {
      const onFire = vi.fn()
      const rule: AlertRule = {
        name: 'test-rule',
        description: 'Test rule',
        severity: 'warning',
        enabled: true,
        evaluate: () => ({ 
          shouldFire: true, 
          value: 5, 
          threshold: 3, 
          message: 'Value exceeds threshold' 
        }),
        onFire
      }

      manager.registerRule(rule)
      manager.start()

      await new Promise(resolve => setTimeout(resolve, 150))

      expect(onFire).toHaveBeenCalled()
    })

    it('should call onResolve callback', async () => {
      let shouldFire = true
      const onResolve = vi.fn()
      const rule: AlertRule = {
        name: 'test-rule',
        description: 'Test rule',
        severity: 'warning',
        enabled: true,
        evaluate: () => ({ 
          shouldFire, 
          value: shouldFire ? 5 : 0, 
          threshold: 3, 
          message: shouldFire ? 'Value exceeds threshold' : 'OK' 
        }),
        onResolve
      }

      manager.registerRule(rule)
      manager.start()

      await new Promise(resolve => setTimeout(resolve, 150))
      shouldFire = false
      await new Promise(resolve => setTimeout(resolve, 150))

      expect(onResolve).toHaveBeenCalled()
    })
  })

  describe('alert queries', () => {
    beforeEach(async () => {
      const rule1: AlertRule = {
        name: 'rule-1',
        description: 'Rule 1',
        severity: 'warning',
        enabled: true,
        evaluate: () => ({ shouldFire: true, value: 5, threshold: 3, message: 'Warning' })
      }
      const rule2: AlertRule = {
        name: 'rule-2',
        description: 'Rule 2',
        severity: 'critical',
        enabled: true,
        evaluate: () => ({ shouldFire: true, value: 10, threshold: 5, message: 'Critical' })
      }

      manager.registerRule(rule1)
      manager.registerRule(rule2)
      manager.start()

      await new Promise(resolve => setTimeout(resolve, 150))
    })

    it('should get alerts by severity', () => {
      const warnings = manager.getAlertsBySeverity('warning')
      const criticals = manager.getAlertsBySeverity('critical')

      expect(warnings.length).toBe(1)
      expect(criticals.length).toBe(1)
    })

    it('should get alert by name', () => {
      const alert = manager.getAlertsByName('rule-1')
      expect(alert).toBeDefined()
      expect(alert?.name).toBe('rule-1')
    })

    it('should clear alert', () => {
      const result = manager.clearAlert('rule-1')
      expect(result).toBe(true)
      expect(manager.getActiveAlerts().length).toBe(1)
    })

    it('should clear all alerts', () => {
      const count = manager.clearAllAlerts()
      expect(count).toBe(2)
      expect(manager.getActiveAlerts().length).toBe(0)
    })
  })

  describe('disabled rules', () => {
    it('should not evaluate disabled rules', async () => {
      const rule: AlertRule = {
        name: 'test-rule',
        description: 'Test rule',
        severity: 'warning',
        enabled: false,
        evaluate: () => ({ 
          shouldFire: true, 
          value: 5, 
          threshold: 3, 
          message: 'Value exceeds threshold' 
        })
      }

      manager.registerRule(rule)
      manager.start()

      await new Promise(resolve => setTimeout(resolve, 150))

      expect(manager.getActiveAlerts().length).toBe(0)
    })
  })
})

describe('Alert Rules', () => {
  let metricsCollector: MetricsCollector

  beforeEach(() => {
    metricsCollector = new MetricsCollector()
  })

  describe('HighErrorRateRule', () => {
    it('should fire when error rate exceeds threshold', () => {
      metricsCollector.incCounter('tasks_total', 100)
      metricsCollector.incCounter('tasks_failed', 15)

      const rule = new HighErrorRateRule(metricsCollector, 0.1)
      const result = rule.evaluate()

      expect(result.shouldFire).toBe(true)
      expect(result.value).toBeCloseTo(0.15)
    })

    it('should not fire when error rate is below threshold', () => {
      metricsCollector.incCounter('tasks_total', 100)
      metricsCollector.incCounter('tasks_failed', 5)

      const rule = new HighErrorRateRule(metricsCollector, 0.1)
      const result = rule.evaluate()

      expect(result.shouldFire).toBe(false)
    })

    it('should handle zero tasks', () => {
      const rule = new HighErrorRateRule(metricsCollector, 0.1)
      const result = rule.evaluate()

      expect(result.shouldFire).toBe(false)
      expect(result.value).toBe(0)
    })
  })

  describe('CostThresholdRule', () => {
    it('should fire when cost exceeds threshold', () => {
      const rule = new CostThresholdRule(() => 15, 10)
      const result = rule.evaluate()

      expect(result.shouldFire).toBe(true)
      expect(result.value).toBe(15)
    })

    it('should not fire when cost is below threshold', () => {
      const rule = new CostThresholdRule(() => 5, 10)
      const result = rule.evaluate()

      expect(result.shouldFire).toBe(false)
    })
  })

  describe('AgentStuckRule', () => {
    it('should fire when agent is stuck', () => {
      const getAgentStatuses = () => [
        { id: 'agent-1', status: 'busy', lastActivity: new Date(Date.now() - 2000000) },
        { id: 'agent-2', status: 'idle', lastActivity: new Date() }
      ]

      const rule = new AgentStuckRule(getAgentStatuses, 1800000)
      const result = rule.evaluate()

      expect(result.shouldFire).toBe(true)
      expect(result.value).toBe(1)
    })

    it('should not fire when no agents are stuck', () => {
      const getAgentStatuses = () => [
        { id: 'agent-1', status: 'busy', lastActivity: new Date() },
        { id: 'agent-2', status: 'idle', lastActivity: new Date() }
      ]

      const rule = new AgentStuckRule(getAgentStatuses, 1800000)
      const result = rule.evaluate()

      expect(result.shouldFire).toBe(false)
    })
  })

  describe('QueueBacklogRule', () => {
    it('should fire when queue backlog exceeds threshold', () => {
      const rule = new QueueBacklogRule(() => 150, 100)
      const result = rule.evaluate()

      expect(result.shouldFire).toBe(true)
      expect(result.value).toBe(150)
    })

    it('should not fire when queue backlog is below threshold', () => {
      const rule = new QueueBacklogRule(() => 50, 100)
      const result = rule.evaluate()

      expect(result.shouldFire).toBe(false)
    })
  })

  describe('createDefaultRules', () => {
    it('should create all default rules', () => {
      const rules = createDefaultRules(
        metricsCollector,
        () => 0,
        () => [],
        () => 0
      )

      expect(rules.length).toBe(4)
      expect(rules.map(r => r.name)).toContain('high_error_rate')
      expect(rules.map(r => r.name)).toContain('cost_threshold')
      expect(rules.map(r => r.name)).toContain('agent_stuck')
      expect(rules.map(r => r.name)).toContain('queue_backlog')
    })
  })
})

import { afterEach } from 'vitest'
