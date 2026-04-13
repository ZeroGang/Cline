import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { Logger } from '../infrastructure/logging/logger.js'
import { EventEmitter, type SchedulerEventMap } from '../monitoring/events.js'
import { AgentMonitor } from '../monitoring/monitor.js'
import { MetricsCollector } from '../monitoring/metrics.js'
import { AlertManager } from '../monitoring/alerts.js'
import { MONITOR_DASHBOARD_CSS } from './dashboard-styles.js'

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
  <title>Cline 监控</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css">
  <style>${MONITOR_DASHBOARD_CSS}</style>
</head>
<body data-theme="dark" data-layout="solo">
  <main class="main main--wide" id="main">
    <header class="monitor-top">
      <div>
        <h1 class="monitor-title">Cline 监控</h1>
        <p class="monitor-sub">实时调度器、Agent 与告警。样式与桌面「搞着玩/Cline」控制台一致（Zinc 灰 + 翠绿强调）。</p>
      </div>
      <div class="conn-pill disconnected" id="connection-status" role="status" aria-live="polite">
        <span class="dot" aria-hidden="true"></span>
        <span id="connection-status-text">已断开</span>
      </div>
    </header>

    <div class="mon-grid">
      <section class="card" aria-labelledby="sched-h">
        <h2 class="sec-title" id="sched-h"><i class="ph ph-gauge"></i> 调度器状态</h2>
        <div class="stat-rows">
          <div class="stat">
            <span class="stat-label">运行状态</span>
            <span class="stat-value"><span class="badge" id="scheduler-status">—</span></span>
          </div>
          <div class="stat">
            <span class="stat-label">Agent 总数</span>
            <span class="stat-value" id="total-agents">0</span>
          </div>
          <div class="stat">
            <span class="stat-label">活跃 Agent</span>
            <span class="stat-value" id="active-agents">0</span>
          </div>
          <div class="stat">
            <span class="stat-label">队列任务</span>
            <span class="stat-value" id="queued-tasks">0</span>
          </div>
          <div class="stat">
            <span class="stat-label">已完成</span>
            <span class="stat-value" id="completed-tasks">0</span>
          </div>
          <div class="stat">
            <span class="stat-label">失败</span>
            <span class="stat-value" id="failed-tasks">0</span>
          </div>
        </div>
      </section>

      <section class="card" aria-labelledby="agents-h">
        <h2 class="sec-title" id="agents-h"><i class="ph ph-users-three"></i> Agents</h2>
        <div class="agent-list" id="agent-list"></div>
      </section>

      <section class="card" aria-labelledby="alerts-h">
        <h2 class="sec-title" id="alerts-h"><i class="ph ph-warning-circle"></i> 活跃告警</h2>
        <div class="alert-list" id="alert-list"></div>
      </section>

      <section class="card" aria-labelledby="events-h">
        <h2 class="sec-title" id="events-h"><i class="ph ph-list-bullets"></i> 最近事件</h2>
        <div class="event-log" id="event-log"></div>
      </section>
    </div>
  </main>

  <script>
    let ws;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    function setConnState(connected) {
      const el = document.getElementById('connection-status');
      const txt = document.getElementById('connection-status-text');
      el.className = 'conn-pill ' + (connected ? 'connected' : 'disconnected');
      txt.textContent = connected ? '已连接' : '已断开';
    }

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(protocol + '//' + window.location.host);

      ws.onopen = () => {
        console.log('Connected to monitor server');
        setConnState(true);
        reconnectAttempts = 0;
      };

      ws.onclose = () => {
        console.log('Disconnected from monitor server');
        setConnState(false);

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
      statusEl.textContent = status.running ? '运行中' : '已停止';
      statusEl.className = 'badge ' + (status.running ? 'status-running' : 'status-stopped');

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
            <span class="badge status-\${agent.status}">\${agent.status}</span>
          </div>
          <div class="agent-stats">
            <span>查询 \${agent.totalQueries}</span>
            <span>Token \${agent.totalTokens}</span>
            <span>错误 \${agent.errorCount}</span>
          </div>
        </div>
      \`).join('');
    }

    function updateAlerts(alerts) {
      const container = document.getElementById('alert-list');
      if (alerts.length === 0) {
        container.innerHTML = '<div class="empty-hint">当前无活跃告警</div>';
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
