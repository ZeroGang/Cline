import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { Logger } from '../infrastructure/logging/logger.js'
import { EventEmitter, type SchedulerEventMap } from '../monitoring/events.js'
import { AgentMonitor } from '../monitoring/monitor.js'
import { MetricsCollector } from '../monitoring/metrics.js'
import { AlertManager } from '../monitoring/alerts.js'

export interface MonitorServerConfig {
  port: number
  host: string
}

const DEFAULT_CONFIG: MonitorServerConfig = {
  port: 3000,
  host: 'localhost'
}

export class MonitorServer {
  private config: MonitorServerConfig
  private logger: Logger
  private httpServer: http.Server
  private wsServer: WebSocketServer
  private clients: Set<WebSocket> = new Set()
  private schedulerEmitter: EventEmitter<SchedulerEventMap>
  private agentMonitor: AgentMonitor
  private metricsCollector: MetricsCollector
  private alertManager: AlertManager

  constructor(
    schedulerEmitter: EventEmitter<SchedulerEventMap>,
    agentMonitor: AgentMonitor,
    metricsCollector: MetricsCollector,
    alertManager: AlertManager,
    config: Partial<MonitorServerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.logger = new Logger({ source: 'MonitorServer' })
    this.schedulerEmitter = schedulerEmitter
    this.agentMonitor = agentMonitor
    this.metricsCollector = metricsCollector
    this.alertManager = alertManager

    this.httpServer = this.createHttpServer()
    this.wsServer = new WebSocketServer({ server: this.httpServer })

    this.setupWebSocket()
    this.setupEventForwarding()
  }

  private createHttpServer(): http.Server {
    return http.createServer((req, res) => {
      if (req.url === '/' || req.url === '/index.html') {
        this.serveHtml(res)
      } else if (req.url === '/api/status') {
        this.serveStatus(res)
      } else if (req.url === '/api/agents') {
        this.serveAgents(res)
      } else if (req.url === '/api/metrics') {
        this.serveMetrics(res)
      } else if (req.url === '/api/alerts') {
        this.serveAlerts(res)
      } else {
        res.writeHead(404)
        res.end('Not Found')
      }
    })
  }

  private serveHtml(res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(this.getDashboardHtml())
  }

  private serveStatus(res: http.ServerResponse): void {
    const status = this.agentMonitor.getSchedulerStatus()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(status))
  }

  private serveAgents(res: http.ServerResponse): void {
    const agents = this.agentMonitor.getAllAgentStatuses()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(agents))
  }

  private serveMetrics(res: http.ServerResponse): void {
    const metrics = this.metricsCollector.exportMetrics()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(metrics))
  }

  private serveAlerts(res: http.ServerResponse): void {
    const alerts = this.alertManager.getActiveAlerts()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(alerts))
  }

  private setupWebSocket(): void {
    this.wsServer.on('connection', (ws) => {
      this.clients.add(ws)
      this.logger.info('Client connected', { totalClients: this.clients.size })

      this.sendInitialState(ws)

      ws.on('close', () => {
        this.clients.delete(ws)
        this.logger.info('Client disconnected', { totalClients: this.clients.size })
      })

      ws.on('error', (error) => {
        this.logger.error('WebSocket error', { error })
        this.clients.delete(ws)
      })
    })
  }

  private sendInitialState(ws: WebSocket): void {
    const state = {
      type: 'initial',
      data: {
        status: this.agentMonitor.getSchedulerStatus(),
        agents: this.agentMonitor.getAllAgentStatuses(),
        metrics: this.metricsCollector.exportMetrics(),
        alerts: this.alertManager.getActiveAlerts(),
        recentEvents: this.agentMonitor.getRecentEvents(50)
      }
    }
    ws.send(JSON.stringify(state))
  }

  private setupEventForwarding(): void {
    this.schedulerEmitter.on('scheduler:started', (data) => {
      this.broadcast({ type: 'scheduler:started', data })
    })

    this.schedulerEmitter.on('scheduler:stopped', (data) => {
      this.broadcast({ type: 'scheduler:stopped', data })
    })

    this.schedulerEmitter.on('task:queued', (data) => {
      this.broadcast({ type: 'task:queued', data })
    })

    this.schedulerEmitter.on('task:started', (data) => {
      this.broadcast({ type: 'task:started', data })
    })

    this.schedulerEmitter.on('task:completed', (data) => {
      this.broadcast({ type: 'task:completed', data })
    })

    this.schedulerEmitter.on('task:failed', (data) => {
      this.broadcast({ type: 'task:failed', data })
    })

    this.schedulerEmitter.on('agent:created', (data) => {
      this.broadcast({ type: 'agent:created', data })
    })

    this.schedulerEmitter.on('agent:destroyed', (data) => {
      this.broadcast({ type: 'agent:destroyed', data })
    })

    this.schedulerEmitter.on('agent:idle', (data) => {
      this.broadcast({ type: 'agent:idle', data })
    })

    this.schedulerEmitter.on('agent:busy', (data) => {
      this.broadcast({ type: 'agent:busy', data })
    })

    this.schedulerEmitter.on('agent:error', (data) => {
      this.broadcast({ type: 'agent:error', data })
    })
  }

  private broadcast(message: unknown): void {
    const data = JSON.stringify(message)
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    }
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.config.port, this.config.host, () => {
        this.logger.info('Monitor server started', {
          url: `http://${this.config.host}:${this.config.port}`
        })
        resolve()
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this.clients) {
        client.close()
      }
      this.clients.clear()

      this.wsServer.close(() => {
        this.httpServer.close(() => {
          this.logger.info('Monitor server stopped')
          resolve()
        })
      })
    })
  }

  private getDashboardHtml(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CLine Monitor</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #eee; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    h1 { margin-bottom: 20px; color: #00d9ff; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    .card { background: #16213e; border-radius: 8px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.3); }
    .card h2 { margin-bottom: 15px; color: #00d9ff; font-size: 18px; }
    .stat { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #2a2a4a; }
    .stat:last-child { border-bottom: none; }
    .stat-label { color: #888; }
    .stat-value { font-weight: bold; }
    .status-badge { padding: 4px 12px; border-radius: 12px; font-size: 12px; }
    .status-running { background: #00c853; color: #fff; }
    .status-stopped { background: #ff5252; color: #fff; }
    .status-idle { background: #2196f3; color: #fff; }
    .status-busy { background: #ff9800; color: #fff; }
    .status-error { background: #f44336; color: #fff; }
    .agent-list { max-height: 400px; overflow-y: auto; }
    .agent-item { padding: 12px; margin-bottom: 8px; background: #1a1a2e; border-radius: 6px; }
    .agent-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .agent-item-id { font-weight: bold; color: #00d9ff; }
    .agent-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 12px; color: #888; }
    .alert-list { max-height: 300px; overflow-y: auto; }
    .alert-item { padding: 12px; margin-bottom: 8px; background: #1a1a2e; border-radius: 6px; border-left: 4px solid; }
    .alert-warning { border-color: #ff9800; }
    .alert-critical { border-color: #f44336; }
    .alert-info { border-color: #2196f3; }
    .alert-title { font-weight: bold; margin-bottom: 4px; }
    .alert-message { font-size: 14px; color: #888; }
    .event-log { max-height: 300px; overflow-y: auto; font-family: monospace; font-size: 12px; }
    .event-item { padding: 8px; border-bottom: 1px solid #2a2a4a; }
    .event-type { color: #00d9ff; }
    .event-time { color: #666; margin-left: 10px; }
    .connection-status { position: fixed; top: 10px; right: 10px; padding: 8px 16px; border-radius: 4px; }
    .connected { background: #00c853; }
    .disconnected { background: #ff5252; }
  </style>
</head>
<body>
  <div class="connection-status" id="connection-status">Disconnected</div>
  <div class="container">
    <h1>CLine Monitor</h1>
    <div class="grid">
      <div class="card">
        <h2>Scheduler Status</h2>
        <div class="stat">
          <span class="stat-label">Status</span>
          <span class="stat-value"><span class="status-badge" id="scheduler-status">-</span></span>
        </div>
        <div class="stat">
          <span class="stat-label">Total Agents</span>
          <span class="stat-value" id="total-agents">0</span>
        </div>
        <div class="stat">
          <span class="stat-label">Active Agents</span>
          <span class="stat-value" id="active-agents">0</span>
        </div>
        <div class="stat">
          <span class="stat-label">Queued Tasks</span>
          <span class="stat-value" id="queued-tasks">0</span>
        </div>
        <div class="stat">
          <span class="stat-label">Completed Tasks</span>
          <span class="stat-value" id="completed-tasks">0</span>
        </div>
        <div class="stat">
          <span class="stat-label">Failed Tasks</span>
          <span class="stat-value" id="failed-tasks">0</span>
        </div>
      </div>

      <div class="card">
        <h2>Agents</h2>
        <div class="agent-list" id="agent-list"></div>
      </div>

      <div class="card">
        <h2>Active Alerts</h2>
        <div class="alert-list" id="alert-list"></div>
      </div>

      <div class="card">
        <h2>Recent Events</h2>
        <div class="event-log" id="event-log"></div>
      </div>
    </div>
  </div>

  <script>
    let ws;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(protocol + '//' + window.location.host);

      ws.onopen = () => {
        console.log('Connected to monitor server');
        document.getElementById('connection-status').textContent = 'Connected';
        document.getElementById('connection-status').className = 'connection-status connected';
        reconnectAttempts = 0;
      };

      ws.onclose = () => {
        console.log('Disconnected from monitor server');
        document.getElementById('connection-status').textContent = 'Disconnected';
        document.getElementById('connection-status').className = 'connection-status disconnected';

        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          setTimeout(connect, 2000 * reconnectAttempts);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleMessage(message);
      };
    }

    function handleMessage(message) {
      if (message.type === 'initial') {
        updateDashboard(message.data);
      } else {
        updateEvent(message);
      }
    }

    function updateDashboard(data) {
      updateSchedulerStatus(data.status);
      updateAgents(data.agents);
      updateAlerts(data.alerts);
      updateEvents(data.recentEvents);
    }

    function updateSchedulerStatus(status) {
      const statusEl = document.getElementById('scheduler-status');
      statusEl.textContent = status.running ? 'Running' : 'Stopped';
      statusEl.className = 'status-badge ' + (status.running ? 'status-running' : 'status-stopped');

      document.getElementById('total-agents').textContent = status.totalAgents;
      document.getElementById('active-agents').textContent = status.activeAgents;
      document.getElementById('queued-tasks').textContent = status.queuedTasks;
      document.getElementById('completed-tasks').textContent = status.completedTasks;
      document.getElementById('failed-tasks').textContent = status.failedTasks;
    }

    function updateAgents(agents) {
      const container = document.getElementById('agent-list');
      container.innerHTML = agents.map(agent => \`
        <div class="agent-item">
          <div class="agent-item-header">
            <span class="agent-item-id">\${agent.id}</span>
            <span class="status-badge status-\${agent.status}">\${agent.status}</span>
          </div>
          <div class="agent-stats">
            <span>Queries: \${agent.totalQueries}</span>
            <span>Tokens: \${agent.totalTokens}</span>
            <span>Errors: \${agent.errorCount}</span>
          </div>
        </div>
      \`).join('');
    }

    function updateAlerts(alerts) {
      const container = document.getElementById('alert-list');
      if (alerts.length === 0) {
        container.innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">No active alerts</div>';
        return;
      }
      container.innerHTML = alerts.map(alert => \`
        <div class="alert-item alert-\${alert.severity}">
          <div class="alert-title">\${alert.name}</div>
          <div class="alert-message">\${alert.message}</div>
        </div>
      \`).join('');
    }

    function updateEvents(events) {
      const container = document.getElementById('event-log');
      container.innerHTML = events.map(event => \`
        <div class="event-item">
          <span class="event-type">\${event.type}</span>
          <span class="event-time">\${new Date(event.timestamp).toLocaleTimeString()}</span>
        </div>
      \`).join('');
      container.scrollTop = container.scrollHeight;
    }

    function updateEvent(message) {
      const container = document.getElementById('event-log');
      const eventItem = document.createElement('div');
      eventItem.className = 'event-item';
      eventItem.innerHTML = \`
        <span class="event-type">\${message.type}</span>
        <span class="event-time">\${new Date().toLocaleTimeString()}</span>
      \`;
      container.appendChild(eventItem);
      container.scrollTop = container.scrollHeight;

      fetch('/api/status').then(r => r.json()).then(updateSchedulerStatus);
      fetch('/api/agents').then(r => r.json()).then(updateAgents);
      fetch('/api/alerts').then(r => r.json()).then(updateAlerts);
    }

    connect();
  </script>
</body>
</html>`
  }
}

export function createMonitorServer(
  schedulerEmitter: EventEmitter<SchedulerEventMap>,
  agentMonitor: AgentMonitor,
  metricsCollector: MetricsCollector,
  alertManager: AlertManager,
  config?: Partial<MonitorServerConfig>
): MonitorServer {
  return new MonitorServer(schedulerEmitter, agentMonitor, metricsCollector, alertManager, config)
}
