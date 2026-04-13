import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MonitorServer, createMonitorServer } from '../../src/monitoring/server.js'
import { EventEmitter, createEventEmitter, type SchedulerEventMap, type AgentEventMap } from '../../src/monitoring/events.js'
import { AgentMonitor, createAgentMonitor } from '../../src/monitoring/monitor.js'
import { MetricsCollector } from '../../src/monitoring/metrics.js'
import { AlertManager, createAlertManager } from '../../src/monitoring/alerts.js'
import WebSocket from 'ws'

describe('MonitorServer', () => {
  let server: MonitorServer
  let schedulerEmitter: EventEmitter<SchedulerEventMap>
  let agentMonitor: AgentMonitor
  let metricsCollector: MetricsCollector
  let alertManager: AlertManager
  const testPort = 3999

  beforeEach(async () => {
    schedulerEmitter = createEventEmitter<SchedulerEventMap>()
    agentMonitor = createAgentMonitor(schedulerEmitter)
    metricsCollector = new MetricsCollector()
    alertManager = createAlertManager()

    server = createMonitorServer(
      schedulerEmitter,
      agentMonitor,
      metricsCollector,
      alertManager,
      { port: testPort }
    )

    await server.start()
  })

  afterEach(async () => {
    await server.stop()
  })

  describe('HTTP endpoints', () => {
    it('should serve dashboard HTML', async () => {
      const response = await fetch(`http://localhost:${testPort}/`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/html')
      
      const html = await response.text()
      expect(html).toMatch(/Cline|监控/)
    })

    it('should serve scheduler status', async () => {
      const response = await fetch(`http://localhost:${testPort}/api/status`)
      expect(response.status).toBe(200)
      
      const status = await response.json()
      expect(status).toHaveProperty('running')
      expect(status).toHaveProperty('totalAgents')
      expect(status).toHaveProperty('activeAgents')
    })

    it('should serve agents list', async () => {
      const response = await fetch(`http://localhost:${testPort}/api/agents`)
      expect(response.status).toBe(200)
      
      const agents = await response.json()
      expect(Array.isArray(agents)).toBe(true)
    })

    it('should serve metrics', async () => {
      metricsCollector.incCounter('test_metric', 5)
      
      const response = await fetch(`http://localhost:${testPort}/api/metrics`)
      expect(response.status).toBe(200)
      
      const metrics = await response.json()
      expect(Array.isArray(metrics)).toBe(true)
    })

    it('should serve alerts', async () => {
      const response = await fetch(`http://localhost:${testPort}/api/alerts`)
      expect(response.status).toBe(200)
      
      const alerts = await response.json()
      expect(Array.isArray(alerts)).toBe(true)
    })

    it('should return 404 for unknown path', async () => {
      const response = await fetch(`http://localhost:${testPort}/unknown`)
      expect(response.status).toBe(404)
    })
  })

  describe('WebSocket', () => {
    it('should accept WebSocket connections', async () => {
      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${testPort}`)
        
        ws.on('open', () => {
          ws.close()
          resolve()
        })
        
        ws.on('error', reject)
      })
    })

    it('should send initial state on connection', async () => {
      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${testPort}`)
        
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString())
          expect(message.type).toBe('initial')
          expect(message.data).toHaveProperty('status')
          expect(message.data).toHaveProperty('agents')
          expect(message.data).toHaveProperty('metrics')
          expect(message.data).toHaveProperty('alerts')
          ws.close()
          resolve()
        })
        
        ws.on('error', reject)
      })
    })

    it('should broadcast scheduler events', async () => {
      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${testPort}`)
        
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString())
          if (message.type === 'scheduler:started') {
            expect(message.data).toHaveProperty('timestamp')
            ws.close()
            resolve()
          }
        })
        
        ws.on('open', () => {
          setTimeout(() => {
            schedulerEmitter.emit('scheduler:started', { timestamp: new Date() })
          }, 100)
        })
        
        ws.on('error', reject)
      })
    })

    it('should broadcast task events', async () => {
      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${testPort}`)
        
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString())
          if (message.type === 'task:queued') {
            expect(message.data).toHaveProperty('taskId')
            expect(message.data).toHaveProperty('priority')
            ws.close()
            resolve()
          }
        })
        
        ws.on('open', () => {
          setTimeout(() => {
            schedulerEmitter.emit('task:queued', { 
              taskId: 'task-1', 
              priority: 1, 
              timestamp: new Date() 
            })
          }, 100)
        })
        
        ws.on('error', reject)
      })
    })

    it('should broadcast agent events', async () => {
      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${testPort}`)
        
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString())
          if (message.type === 'agent:created') {
            expect(message.data).toHaveProperty('agentId')
            ws.close()
            resolve()
          }
        })
        
        ws.on('open', () => {
          setTimeout(() => {
            schedulerEmitter.emit('agent:created', { 
              agentId: 'agent-1', 
              timestamp: new Date() 
            })
          }, 100)
        })
        
        ws.on('error', reject)
      })
    })
  })

  describe('lifecycle', () => {
    it('should start and stop server', async () => {
      const newServer = createMonitorServer(
        schedulerEmitter,
        agentMonitor,
        metricsCollector,
        alertManager,
        { port: testPort + 1 }
      )

      await newServer.start()
      
      const response = await fetch(`http://localhost:${testPort + 1}/`)
      expect(response.status).toBe(200)
      
      await newServer.stop()
      
      await expect(fetch(`http://localhost:${testPort + 1}/`)).rejects.toThrow()
    })
  })
})
