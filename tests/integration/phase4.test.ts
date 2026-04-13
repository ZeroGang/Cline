import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventEmitter, createEventEmitter, type SchedulerEventMap, type AgentEventMap } from '../../src/monitoring/events.js'
import { AgentMonitor, createAgentMonitor } from '../../src/monitoring/monitor.js'
import { MetricsCollector, CostTracker, PerformanceTracker } from '../../src/monitoring/metrics.js'
import { AlertManager, createAlertManager, createDefaultRules, type AlertRule } from '../../src/monitoring/alerts.js'
import { MonitorServer, createMonitorServer } from '../../src/monitoring/server.js'
import WebSocket from 'ws'

describe('Phase 4 Integration Tests', () => {
  describe('Event Bus Integration', () => {
    let schedulerEmitter: EventEmitter<SchedulerEventMap>
    let agentEmitter: EventEmitter<AgentEventMap>
    let monitor: AgentMonitor

    beforeEach(() => {
      schedulerEmitter = createEventEmitter<SchedulerEventMap>()
      agentEmitter = createEventEmitter<AgentEventMap>()
      monitor = createAgentMonitor(schedulerEmitter)
    })

    it('should track complete task lifecycle through events', async () => {
      await schedulerEmitter.emit('scheduler:started', { timestamp: new Date() })
      await schedulerEmitter.emit('agent:created', { agentId: 'agent-1', timestamp: new Date() })
      
      monitor.registerAgent('agent-1', agentEmitter)
      
      await schedulerEmitter.emit('task:queued', { 
        taskId: 'task-1', 
        priority: 1, 
        timestamp: new Date() 
      })
      
      await schedulerEmitter.emit('task:started', { 
        taskId: 'task-1', 
        agentId: 'agent-1', 
        timestamp: new Date() 
      })
      
      await agentEmitter.emit('query:started', { 
        queryId: 'query-1', 
        timestamp: new Date() 
      })
      
      await agentEmitter.emit('tool:executed', { 
        toolName: 'Read', 
        duration: 100, 
        success: true, 
        timestamp: new Date() 
      })
      
      await agentEmitter.emit('query:completed', { 
        queryId: 'query-1', 
        duration: 500, 
        tokenUsage: 100, 
        timestamp: new Date() 
      })
      
      await schedulerEmitter.emit('task:completed', { 
        taskId: 'task-1', 
        agentId: 'agent-1', 
        duration: 1000, 
        timestamp: new Date() 
      })

      const status = monitor.getSchedulerStatus()
      expect(status.running).toBe(true)
      expect(status.completedTasks).toBe(1)
      expect(status.totalAgents).toBe(1)

      const agentStatus = monitor.getAgentStatus('agent-1')
      expect(agentStatus?.totalQueries).toBe(2)
      expect(agentStatus?.totalTokens).toBe(100)

      const events = monitor.getRecentEvents()
      expect(events.some(e => e.type === 'task:queued')).toBe(true)
      expect(events.some(e => e.type === 'task:started')).toBe(true)
      expect(events.some(e => e.type === 'task:completed')).toBe(true)
    })

    it('should track multiple agents and tasks', async () => {
      await schedulerEmitter.emit('scheduler:started', { timestamp: new Date() })
      
      for (let i = 1; i <= 3; i++) {
        await schedulerEmitter.emit('agent:created', { 
          agentId: `agent-${i}`, 
          timestamp: new Date() 
        })
      }

      for (let i = 1; i <= 5; i++) {
        await schedulerEmitter.emit('task:queued', { 
          taskId: `task-${i}`, 
          priority: i, 
          timestamp: new Date() 
        })
      }

      const status = monitor.getSchedulerStatus()
      expect(status.totalAgents).toBe(3)
      expect(status.queuedTasks).toBe(5)
    })

    it('should handle agent errors', async () => {
      await schedulerEmitter.emit('agent:created', { 
        agentId: 'agent-1', 
        timestamp: new Date() 
      })
      
      await schedulerEmitter.emit('agent:error', { 
        agentId: 'agent-1', 
        error: 'Test error', 
        timestamp: new Date() 
      })

      const agentStatus = monitor.getAgentStatus('agent-1')
      expect(agentStatus?.status).toBe('error')
      expect(agentStatus?.errorCount).toBe(1)
    })
  })

  describe('Metrics and Cost Tracking Integration', () => {
    let metricsCollector: MetricsCollector
    let costTracker: CostTracker

    beforeEach(() => {
      metricsCollector = new MetricsCollector()
      costTracker = new CostTracker({
        'claude-3-sonnet': { inputCostPerToken: 0.000003, outputCostPerToken: 0.000015 }
      })
    })

    it('should track task metrics and costs together', () => {
      metricsCollector.incCounter('tasks_total', 10)
      metricsCollector.incCounter('tasks_completed', 8)
      metricsCollector.incCounter('tasks_failed', 2)
      
      costTracker.trackUsage('claude-3-sonnet', 10000, 5000)
      costTracker.trackUsage('claude-3-sonnet', 8000, 4000)

      const metrics = metricsCollector.exportMetrics()
      expect(metrics.find(m => m.name === 'tasks_total')?.value).toBe(10)
      expect(metrics.find(m => m.name === 'tasks_completed')?.value).toBe(8)
      expect(metrics.find(m => m.name === 'tasks_failed')?.value).toBe(2)

      const totalCost = costTracker.getTotalCost()
      expect(totalCost).toBeGreaterThan(0)

      const tokens = costTracker.getTotalTokens()
      expect(tokens.input).toBe(18000)
      expect(tokens.output).toBe(9000)
    })

    it('should track performance checkpoints', async () => {
      const perfTracker = new PerformanceTracker()

      perfTracker.startCheckpoint('task-1', { agentId: 'agent-1' })
      await new Promise(resolve => setTimeout(resolve, 50))
      perfTracker.endCheckpoint('task-1')

      perfTracker.startCheckpoint('task-2', { agentId: 'agent-2' })
      await new Promise(resolve => setTimeout(resolve, 30))
      perfTracker.endCheckpoint('task-2')

      const completed = perfTracker.getCompletedCheckpoints()
      expect(completed.length).toBe(2)
      expect(completed[0].duration).toBeGreaterThan(40)
      expect(completed[1].duration).toBeGreaterThan(20)
    })
  })

  describe('Alert System Integration', () => {
    let schedulerEmitter: EventEmitter<SchedulerEventMap>
    let monitor: AgentMonitor
    let metricsCollector: MetricsCollector
    let alertManager: AlertManager

    beforeEach(() => {
      schedulerEmitter = createEventEmitter<SchedulerEventMap>()
      monitor = createAgentMonitor(schedulerEmitter)
      metricsCollector = new MetricsCollector()
      alertManager = createAlertManager({ evaluationInterval: 50 })
    })

    afterEach(() => {
      alertManager.stop()
    })

    it('should trigger high error rate alert', async () => {
      const rule: AlertRule = {
        name: 'high_error_rate',
        description: 'High error rate',
        severity: 'warning',
        enabled: true,
        evaluate: () => {
          const total = metricsCollector.getCounter('tasks_total')?.value || 0
          const failed = metricsCollector.getCounter('tasks_failed')?.value || 0
          const rate = total > 0 ? failed / total : 0
          return {
            shouldFire: rate >= 0.2,
            value: rate,
            threshold: 0.2,
            message: `Error rate ${(rate * 100).toFixed(1)}%`
          }
        }
      }

      alertManager.registerRule(rule)
      alertManager.start()

      metricsCollector.incCounter('tasks_total', 10)
      metricsCollector.incCounter('tasks_failed', 3)

      await new Promise(resolve => setTimeout(resolve, 100))

      const alerts = alertManager.getActiveAlerts()
      expect(alerts.length).toBe(1)
      expect(alerts[0].name).toBe('high_error_rate')
    })

    it('should trigger cost threshold alert', async () => {
      const costTracker = new CostTracker()
      costTracker.trackUsage('claude-3-sonnet', 100000, 50000)

      const rule: AlertRule = {
        name: 'cost_threshold',
        description: 'Cost threshold exceeded',
        severity: 'warning',
        enabled: true,
        evaluate: () => {
          const cost = costTracker.getTotalCost()
          return {
            shouldFire: cost >= 1,
            value: cost,
            threshold: 1,
            message: `Total cost $${cost.toFixed(2)}`
          }
        }
      }

      alertManager.registerRule(rule)
      alertManager.start()

      await new Promise(resolve => setTimeout(resolve, 100))

      const alerts = alertManager.getActiveAlerts()
      expect(alerts.length).toBe(1)
      expect(alerts[0].name).toBe('cost_threshold')
    })

    it('should trigger agent stuck alert', async () => {
      await schedulerEmitter.emit('agent:created', { 
        agentId: 'agent-1', 
        timestamp: new Date() 
      })
      
      await schedulerEmitter.emit('agent:busy', { 
        agentId: 'agent-1', 
        taskId: 'task-1', 
        timestamp: new Date(Date.now() - 2000000)
      })

      const rule: AlertRule = {
        name: 'agent_stuck',
        description: 'Agent stuck',
        severity: 'critical',
        enabled: true,
        evaluate: () => {
          const statuses = monitor.getAllAgentStatuses()
          const stuck = statuses.filter(s => 
            s.status === 'busy' && 
            Date.now() - s.lastActivity.getTime() > 1800000
          )
          return {
            shouldFire: stuck.length > 0,
            value: stuck.length,
            threshold: 0,
            message: `${stuck.length} agent(s) stuck`
          }
        }
      }

      alertManager.registerRule(rule)
      alertManager.start()

      await new Promise(resolve => setTimeout(resolve, 100))

      const alerts = alertManager.getActiveAlerts()
      expect(alerts.length).toBe(1)
      expect(alerts[0].name).toBe('agent_stuck')
    })
  })

  describe('Monitor Server Integration', () => {
    let schedulerEmitter: EventEmitter<SchedulerEventMap>
    let monitor: AgentMonitor
    let metricsCollector: MetricsCollector
    let alertManager: AlertManager
    let server: MonitorServer
    const testPort = 3998

    beforeEach(async () => {
      schedulerEmitter = createEventEmitter<SchedulerEventMap>()
      monitor = createAgentMonitor(schedulerEmitter)
      metricsCollector = new MetricsCollector()
      alertManager = createAlertManager()

      server = createMonitorServer(
        schedulerEmitter,
        monitor,
        metricsCollector,
        alertManager,
        { port: testPort }
      )

      await server.start()
    })

    afterEach(async () => {
      await server.stop()
    })

    it('should provide complete monitoring data via HTTP', async () => {
      await schedulerEmitter.emit('scheduler:started', { timestamp: new Date() })
      await schedulerEmitter.emit('agent:created', { agentId: 'agent-1', timestamp: new Date() })
      metricsCollector.incCounter('tasks_total', 5)

      const statusRes = await fetch(`http://localhost:${testPort}/api/status`)
      const status = await statusRes.json()
      expect(status.running).toBe(true)

      const agentsRes = await fetch(`http://localhost:${testPort}/api/agents`)
      const agents = await agentsRes.json()
      expect(agents.length).toBe(1)

      const metricsRes = await fetch(`http://localhost:${testPort}/api/metrics`)
      const metrics = await metricsRes.json()
      expect(metrics.some((m: any) => m.name === 'tasks_total')).toBe(true)
    })

    it('should broadcast events to WebSocket clients', async () => {
      return new Promise<void>(async (resolve) => {
        const ws = new WebSocket(`ws://localhost:${testPort}`)
        let receivedInitial = false

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString())
          
          if (message.type === 'initial') {
            receivedInitial = true
            setTimeout(() => {
              schedulerEmitter.emit('task:queued', { 
                taskId: 'task-1', 
                priority: 1, 
                timestamp: new Date() 
              })
            }, 50)
          } else if (message.type === 'task:queued') {
            expect(message.data.taskId).toBe('task-1')
            ws.close()
            resolve()
          }
        })
      })
    })

    it('should handle multiple WebSocket clients', async () => {
      const clientPromises = []
      
      for (let i = 0; i < 3; i++) {
        clientPromises.push(
          new Promise<boolean>((resolve) => {
            const ws = new WebSocket(`ws://localhost:${testPort}`)
            ws.on('message', (data) => {
              const message = JSON.parse(data.toString())
              if (message.type === 'initial') {
                ws.close()
                resolve(true)
              }
            })
          })
        )
      }

      const received = await Promise.all(clientPromises)
      expect(received.every(r => r)).toBe(true)
    }, 10000)
  })

  describe('Full Monitoring Pipeline', () => {
    let schedulerEmitter: EventEmitter<SchedulerEventMap>
    let agentEmitter: EventEmitter<AgentEventMap>
    let monitor: AgentMonitor
    let metricsCollector: MetricsCollector
    let costTracker: CostTracker
    let alertManager: AlertManager
    let server: MonitorServer
    const testPort = 3997

    beforeEach(async () => {
      schedulerEmitter = createEventEmitter<SchedulerEventMap>()
      agentEmitter = createEventEmitter<AgentEventMap>()
      monitor = createAgentMonitor(schedulerEmitter)
      metricsCollector = new MetricsCollector()
      costTracker = new CostTracker({
        'claude-3-sonnet': { inputCostPerToken: 0.000003, outputCostPerToken: 0.000015 }
      })
      alertManager = createAlertManager({ evaluationInterval: 50 })

      server = createMonitorServer(
        schedulerEmitter,
        monitor,
        metricsCollector,
        alertManager,
        { port: testPort }
      )

      await server.start()
    })

    afterEach(async () => {
      alertManager.stop()
      await server.stop()
    })

    it('should integrate all monitoring components', async () => {
      alertManager.registerRule({
        name: 'high_error_rate',
        description: 'High error rate',
        severity: 'warning',
        enabled: true,
        evaluate: () => {
          const total = metricsCollector.getCounter('tasks_total')?.value || 0
          const failed = metricsCollector.getCounter('tasks_failed')?.value || 0
          const rate = total > 0 ? failed / total : 0
          return {
            shouldFire: rate >= 0.3,
            value: rate,
            threshold: 0.3,
            message: `Error rate ${(rate * 100).toFixed(1)}%`
          }
        }
      })
      alertManager.start()

      await schedulerEmitter.emit('scheduler:started', { timestamp: new Date() })
      await schedulerEmitter.emit('agent:created', { agentId: 'agent-1', timestamp: new Date() })
      monitor.registerAgent('agent-1', agentEmitter)

      for (let i = 1; i <= 10; i++) {
        await schedulerEmitter.emit('task:queued', { 
          taskId: `task-${i}`, 
          priority: i, 
          timestamp: new Date() 
        })
        metricsCollector.incCounter('tasks_total')
      }

      for (let i = 1; i <= 7; i++) {
        await schedulerEmitter.emit('task:started', { 
          taskId: `task-${i}`, 
          agentId: 'agent-1', 
          timestamp: new Date() 
        })
        
        await agentEmitter.emit('query:completed', { 
          queryId: `query-${i}`, 
          duration: 500, 
          tokenUsage: 1000, 
          timestamp: new Date() 
        })
        costTracker.trackUsage('claude-3-sonnet', 800, 200)
        
        await schedulerEmitter.emit('task:completed', { 
          taskId: `task-${i}`, 
          agentId: 'agent-1', 
          duration: 1000, 
          timestamp: new Date() 
        })
        metricsCollector.incCounter('tasks_completed')
      }

      for (let i = 8; i <= 10; i++) {
        await schedulerEmitter.emit('task:started', { 
          taskId: `task-${i}`, 
          agentId: 'agent-1', 
          timestamp: new Date() 
        })
        
        await schedulerEmitter.emit('task:failed', { 
          taskId: `task-${i}`, 
          agentId: 'agent-1', 
          error: 'Test error', 
          timestamp: new Date() 
        })
        metricsCollector.incCounter('tasks_failed')
      }

      const schedulerStatus = monitor.getSchedulerStatus()
      expect(schedulerStatus.running).toBe(true)
      expect(schedulerStatus.completedTasks).toBe(7)
      expect(schedulerStatus.failedTasks).toBe(3)

      const agentStatus = monitor.getAgentStatus('agent-1')
      expect(agentStatus?.totalQueries).toBe(14)
      expect(agentStatus?.totalTokens).toBe(7000)

      const totalCost = costTracker.getTotalCost()
      expect(totalCost).toBeGreaterThan(0)

      await new Promise(resolve => setTimeout(resolve, 100))

      const alerts = alertManager.getActiveAlerts()
      expect(alerts.length).toBe(1)
      expect(alerts[0].name).toBe('high_error_rate')

      const ws = new WebSocket(`ws://localhost:${testPort}`)
      await new Promise<void>((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString())
          if (message.type === 'initial') {
            expect(message.data.status.running).toBe(true)
            expect(message.data.agents.length).toBe(1)
            expect(message.data.alerts.length).toBe(1)
            ws.close()
            resolve()
          }
        })
      })
    })
  })
})
