import { Logger } from '../infrastructure/logging/logger.js'
import { MetricsCollector } from './metrics.js'

export type AlertSeverity = 'info' | 'warning' | 'critical'

export type AlertState = 'pending' | 'firing' | 'resolved'

export interface Alert {
  id: string
  name: string
  severity: AlertSeverity
  state: AlertState
  message: string
  labels: Record<string, string>
  value: number
  threshold: number
  startedAt: Date
  resolvedAt?: Date
  lastEvaluatedAt: Date
}

export interface AlertRule {
  name: string
  description: string
  severity: AlertSeverity
  enabled: boolean
  evaluate(): AlertEvaluationResult
  onFire?(alert: Alert): void | Promise<void>
  onResolve?(alert: Alert): void | Promise<void>
}

export interface AlertEvaluationResult {
  shouldFire: boolean
  value: number
  threshold: number
  message: string
  labels?: Record<string, string>
}

export interface AlertManagerConfig {
  evaluationInterval: number
  maxAlerts: number
  retentionPeriod: number
}

const DEFAULT_CONFIG: AlertManagerConfig = {
  evaluationInterval: 30000,
  maxAlerts: 1000,
  retentionPeriod: 3600000
}

export class AlertManager {
  private config: AlertManagerConfig
  private logger: Logger
  private rules: Map<string, AlertRule> = new Map()
  private activeAlerts: Map<string, Alert> = new Map()
  private alertHistory: Alert[] = []
  private evaluationTimer?: ReturnType<typeof setInterval>
  private alertIdCounter: number = 0

  constructor(config: Partial<AlertManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.logger = new Logger({ source: 'AlertManager' })
  }

  registerRule(rule: AlertRule): void {
    this.rules.set(rule.name, rule)
    this.logger.info('Alert rule registered', { name: rule.name, severity: rule.severity })
  }

  unregisterRule(name: string): boolean {
    const result = this.rules.delete(name)
    if (result) {
      this.logger.info('Alert rule unregistered', { name })
    }
    return result
  }

  getRule(name: string): AlertRule | undefined {
    return this.rules.get(name)
  }

  getAllRules(): AlertRule[] {
    return Array.from(this.rules.values())
  }

  start(): void {
    if (this.evaluationTimer) {
      this.logger.warn('Alert manager already running')
      return
    }

    this.evaluationTimer = setInterval(() => {
      this.evaluateRules()
    }, this.config.evaluationInterval)

    this.logger.info('Alert manager started', { 
      interval: this.config.evaluationInterval,
      rules: this.rules.size 
    })
  }

  stop(): void {
    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer)
      this.evaluationTimer = undefined
      this.logger.info('Alert manager stopped')
    }
  }

  private async evaluateRules(): Promise<void> {
    const now = new Date()

    for (const [name, rule] of this.rules) {
      if (!rule.enabled) continue

      try {
        const result = rule.evaluate()
        const existingAlert = this.activeAlerts.get(name)

        if (result.shouldFire && !existingAlert) {
          const alert = this.createAlert(name, rule, result, now)
          this.activeAlerts.set(name, alert)
          this.addToHistory(alert)

          this.logger.warn('Alert fired', { 
            name, 
            severity: rule.severity, 
            value: result.value, 
            threshold: result.threshold 
          })

          if (rule.onFire) {
            await rule.onFire(alert)
          }
        } else if (!result.shouldFire && existingAlert) {
          existingAlert.state = 'resolved'
          existingAlert.resolvedAt = now
          existingAlert.lastEvaluatedAt = now

          this.activeAlerts.delete(name)
          this.addToHistory(existingAlert)

          this.logger.info('Alert resolved', { name })

          if (rule.onResolve) {
            await rule.onResolve(existingAlert)
          }
        } else if (existingAlert) {
          existingAlert.lastEvaluatedAt = now
          existingAlert.value = result.value
        }
      } catch (error) {
        this.logger.error('Error evaluating rule', { name, error })
      }
    }

    this.cleanupHistory()
  }

  private createAlert(
    name: string, 
    rule: AlertRule, 
    result: AlertEvaluationResult, 
    now: Date
  ): Alert {
    return {
      id: `alert-${++this.alertIdCounter}`,
      name,
      severity: rule.severity,
      state: 'firing',
      message: result.message,
      labels: result.labels || {},
      value: result.value,
      threshold: result.threshold,
      startedAt: now,
      lastEvaluatedAt: now
    }
  }

  private addToHistory(alert: Alert): void {
    this.alertHistory.push({ ...alert })
    
    while (this.alertHistory.length > this.config.maxAlerts) {
      this.alertHistory.shift()
    }
  }

  private cleanupHistory(): void {
    const cutoff = Date.now() - this.config.retentionPeriod
    this.alertHistory = this.alertHistory.filter(
      a => a.startedAt.getTime() > cutoff
    )
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values())
  }

  getAlertHistory(limit?: number): Alert[] {
    const history = this.alertHistory.slice(-(limit || 100))
    return history.map(a => ({ ...a }))
  }

  getAlertsBySeverity(severity: AlertSeverity): Alert[] {
    return this.getActiveAlerts().filter(a => a.severity === severity)
  }

  getAlertsByName(name: string): Alert | undefined {
    return this.activeAlerts.get(name)
  }

  clearAlert(name: string): boolean {
    const alert = this.activeAlerts.get(name)
    if (alert) {
      alert.state = 'resolved'
      alert.resolvedAt = new Date()
      this.activeAlerts.delete(name)
      this.addToHistory(alert)
      this.logger.info('Alert cleared manually', { name })
      return true
    }
    return false
  }

  clearAllAlerts(): number {
    const count = this.activeAlerts.size
    const now = new Date()
    
    for (const alert of this.activeAlerts.values()) {
      alert.state = 'resolved'
      alert.resolvedAt = now
      this.addToHistory(alert)
    }
    
    this.activeAlerts.clear()
    this.logger.info('All alerts cleared', { count })
    return count
  }

  getConfig(): AlertManagerConfig {
    return { ...this.config }
  }

  updateConfig(config: Partial<AlertManagerConfig>): void {
    this.config = { ...this.config, ...config }
    this.logger.info('Alert manager config updated')
  }
}

export class HighErrorRateRule implements AlertRule {
  name = 'high_error_rate'
  description = 'Alerts when error rate exceeds threshold'
  severity: AlertSeverity = 'warning'
  enabled = true

  private metricsCollector: MetricsCollector
  private threshold: number
  private windowMs: number

  constructor(
    metricsCollector: MetricsCollector,
    threshold: number = 0.1,
    windowMs: number = 60000
  ) {
    this.metricsCollector = metricsCollector
    this.threshold = threshold
    this.windowMs = windowMs
  }

  getWindowMs(): number {
    return this.windowMs
  }

  evaluate(): AlertEvaluationResult {
    const totalCounter = this.metricsCollector.getCounter('tasks_total')
    const failedCounter = this.metricsCollector.getCounter('tasks_failed')

    const total = totalCounter?.value || 0
    const failed = failedCounter?.value || 0

    const errorRate = total > 0 ? failed / total : 0

    return {
      shouldFire: errorRate >= this.threshold,
      value: errorRate,
      threshold: this.threshold,
      message: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${(this.threshold * 100).toFixed(2)}%`,
      labels: { type: 'error_rate' }
    }
  }
}

export class CostThresholdRule implements AlertRule {
  name = 'cost_threshold'
  description = 'Alerts when total cost exceeds threshold'
  severity: AlertSeverity = 'warning'
  enabled = true

  private getTotalCost: () => number
  private threshold: number

  constructor(
    getTotalCost: () => number,
    threshold: number = 10
  ) {
    this.getTotalCost = getTotalCost
    this.threshold = threshold
  }

  evaluate(): AlertEvaluationResult {
    const cost = this.getTotalCost()

    return {
      shouldFire: cost >= this.threshold,
      value: cost,
      threshold: this.threshold,
      message: `Total cost $${cost.toFixed(2)} exceeds threshold $${this.threshold.toFixed(2)}`,
      labels: { type: 'cost' }
    }
  }
}

export class AgentStuckRule implements AlertRule {
  name = 'agent_stuck'
  description = 'Alerts when an agent has been busy for too long'
  severity: AlertSeverity = 'critical'
  enabled = true

  private getAgentStatuses: () => Array<{ id: string; status: string; lastActivity: Date }>
  private timeoutMs: number

  constructor(
    getAgentStatuses: () => Array<{ id: string; status: string; lastActivity: Date }>,
    timeoutMs: number = 1800000
  ) {
    this.getAgentStatuses = getAgentStatuses
    this.timeoutMs = timeoutMs
  }

  evaluate(): AlertEvaluationResult {
    const now = Date.now()
    const stuckAgents = this.getAgentStatuses()
      .filter(a => a.status === 'busy')
      .filter(a => now - a.lastActivity.getTime() > this.timeoutMs)

    const stuckCount = stuckAgents.length

    return {
      shouldFire: stuckCount > 0,
      value: stuckCount,
      threshold: 0,
      message: stuckCount > 0 
        ? `${stuckCount} agent(s) stuck for more than ${this.timeoutMs / 60000} minutes`
        : 'No stuck agents',
      labels: { type: 'agent_stuck', agents: stuckAgents.map(a => a.id).join(',') }
    }
  }
}

export class QueueBacklogRule implements AlertRule {
  name = 'queue_backlog'
  description = 'Alerts when task queue backlog exceeds threshold'
  severity: AlertSeverity = 'warning'
  enabled = true

  private getQueueSize: () => number
  private threshold: number

  constructor(
    getQueueSize: () => number,
    threshold: number = 100
  ) {
    this.getQueueSize = getQueueSize
    this.threshold = threshold
  }

  evaluate(): AlertEvaluationResult {
    const queueSize = this.getQueueSize()

    return {
      shouldFire: queueSize >= this.threshold,
      value: queueSize,
      threshold: this.threshold,
      message: `Queue backlog ${queueSize} exceeds threshold ${this.threshold}`,
      labels: { type: 'queue_backlog' }
    }
  }
}

export function createAlertManager(config?: Partial<AlertManagerConfig>): AlertManager {
  return new AlertManager(config)
}

export function createDefaultRules(
  metricsCollector: MetricsCollector,
  getTotalCost: () => number,
  getAgentStatuses: () => Array<{ id: string; status: string; lastActivity: Date }>,
  getQueueSize: () => number
): AlertRule[] {
  return [
    new HighErrorRateRule(metricsCollector),
    new CostThresholdRule(getTotalCost),
    new AgentStuckRule(getAgentStatuses),
    new QueueBacklogRule(getQueueSize)
  ]
}
