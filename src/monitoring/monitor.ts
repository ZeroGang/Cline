import { EventEmitter, createEventEmitter, type SchedulerEventMap, type AgentEventMap, type AllEvents } from './events.js'
import { Logger } from '../infrastructure/logging/logger.js'

export interface AgentStatus {
  id: string
  status: 'idle' | 'busy' | 'error' | 'offline'
  currentTask?: string
  lastActivity: Date
  totalQueries: number
  totalTokens: number
  totalCost: number
  errorCount: number
}

export interface SchedulerStatus {
  running: boolean
  totalAgents: number
  activeAgents: number
  idleAgents: number
  queuedTasks: number
  completedTasks: number
  failedTasks: number
}

export interface RecentEvent {
  type: string
  data: unknown
  timestamp: Date
}

export interface AgentMonitorConfig {
  maxRecentEvents: number
  statusUpdateInterval: number
}

const DEFAULT_CONFIG: AgentMonitorConfig = {
  maxRecentEvents: 100,
  statusUpdateInterval: 5000
}

export class AgentMonitor {
  private config: AgentMonitorConfig
  private logger: Logger
  private schedulerEmitter: EventEmitter<SchedulerEventMap>
  private agentEmitters: Map<string, EventEmitter<AgentEventMap>> = new Map()
  private agentStatuses: Map<string, AgentStatus> = new Map()
  private recentEvents: RecentEvent[] = []
  private schedulerStatus: SchedulerStatus = {
    running: false,
    totalAgents: 0,
    activeAgents: 0,
    idleAgents: 0,
    queuedTasks: 0,
    completedTasks: 0,
    failedTasks: 0
  }

  constructor(
    schedulerEmitter: EventEmitter<SchedulerEventMap>,
    config: Partial<AgentMonitorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.logger = new Logger('AgentMonitor')
    this.schedulerEmitter = schedulerEmitter
    this.setupSchedulerListeners()
  }

  private setupSchedulerListeners(): void {
    this.schedulerEmitter.on('scheduler:started', (data) => {
      this.schedulerStatus.running = true
      this.addRecentEvent('scheduler:started', data)
    })

    this.schedulerEmitter.on('scheduler:stopped', (data) => {
      this.schedulerStatus.running = false
      this.addRecentEvent('scheduler:stopped', data)
    })

    this.schedulerEmitter.on('task:queued', (data) => {
      this.schedulerStatus.queuedTasks++
      this.addRecentEvent('task:queued', data)
    })

    this.schedulerEmitter.on('task:started', (data) => {
      this.schedulerStatus.queuedTasks--
      const status = this.agentStatuses.get(data.agentId)
      if (status) {
        status.status = 'busy'
        status.currentTask = data.taskId
        status.lastActivity = data.timestamp
      }
      this.updateAgentCounts()
      this.addRecentEvent('task:started', data)
    })

    this.schedulerEmitter.on('task:completed', (data) => {
      this.schedulerStatus.completedTasks++
      const status = this.agentStatuses.get(data.agentId)
      if (status) {
        status.status = 'idle'
        status.currentTask = undefined
        status.lastActivity = data.timestamp
        status.totalQueries++
      }
      this.updateAgentCounts()
      this.addRecentEvent('task:completed', data)
    })

    this.schedulerEmitter.on('task:failed', (data) => {
      this.schedulerStatus.failedTasks++
      const status = this.agentStatuses.get(data.agentId)
      if (status) {
        status.status = 'error'
        status.currentTask = undefined
        status.lastActivity = data.timestamp
        status.errorCount++
      }
      this.updateAgentCounts()
      this.addRecentEvent('task:failed', data)
    })

    this.schedulerEmitter.on('task:cancelled', (data) => {
      this.schedulerStatus.queuedTasks--
      this.addRecentEvent('task:cancelled', data)
    })

    this.schedulerEmitter.on('agent:created', (data) => {
      this.agentStatuses.set(data.agentId, {
        id: data.agentId,
        status: 'idle',
        lastActivity: data.timestamp,
        totalQueries: 0,
        totalTokens: 0,
        totalCost: 0,
        errorCount: 0
      })
      this.schedulerStatus.totalAgents++
      this.updateAgentCounts()
      this.addRecentEvent('agent:created', data)
    })

    this.schedulerEmitter.on('agent:destroyed', (data) => {
      this.agentStatuses.delete(data.agentId)
      this.agentEmitters.delete(data.agentId)
      this.schedulerStatus.totalAgents--
      this.updateAgentCounts()
      this.addRecentEvent('agent:destroyed', data)
    })

    this.schedulerEmitter.on('agent:idle', (data) => {
      const status = this.agentStatuses.get(data.agentId)
      if (status) {
        status.status = 'idle'
        status.lastActivity = data.timestamp
      }
      this.updateAgentCounts()
      this.addRecentEvent('agent:idle', data)
    })

    this.schedulerEmitter.on('agent:busy', (data) => {
      const status = this.agentStatuses.get(data.agentId)
      if (status) {
        status.status = 'busy'
        status.currentTask = data.taskId
        status.lastActivity = data.timestamp
      }
      this.updateAgentCounts()
      this.addRecentEvent('agent:busy', data)
    })

    this.schedulerEmitter.on('agent:error', (data) => {
      const status = this.agentStatuses.get(data.agentId)
      if (status) {
        status.status = 'error'
        status.lastActivity = data.timestamp
        status.errorCount++
      }
      this.addRecentEvent('agent:error', data)
    })

    this.schedulerEmitter.on('pool:scaled', (data) => {
      this.addRecentEvent('pool:scaled', data)
    })

    this.schedulerEmitter.on('loadbalance:changed', (data) => {
      this.addRecentEvent('loadbalance:changed', data)
    })
  }

  registerAgent(agentId: string, emitter: EventEmitter<AgentEventMap>): void {
    this.agentEmitters.set(agentId, emitter)
    this.setupAgentListeners(agentId, emitter)
  }

  private setupAgentListeners(agentId: string, emitter: EventEmitter<AgentEventMap>): void {
    emitter.on('query:completed', (data) => {
      const status = this.agentStatuses.get(agentId)
      if (status) {
        status.totalQueries++
        status.totalTokens += data.tokenUsage
      }
      this.addRecentEvent('query:completed', { agentId, ...data })
    })

    emitter.on('query:failed', (data) => {
      const status = this.agentStatuses.get(agentId)
      if (status) {
        status.errorCount++
      }
      this.addRecentEvent('query:failed', { agentId, ...data })
    })

    emitter.on('error:occurred', (data) => {
      this.addRecentEvent('error:occurred', { agentId, ...data })
    })

    emitter.on('context:compressed', (data) => {
      this.addRecentEvent('context:compressed', { agentId, ...data })
    })

    emitter.on('tool:executed', (data) => {
      this.addRecentEvent('tool:executed', { agentId, ...data })
    })
  }

  private addRecentEvent(type: string, data: unknown): void {
    this.recentEvents.push({
      type,
      data,
      timestamp: new Date()
    })

    while (this.recentEvents.length > this.config.maxRecentEvents) {
      this.recentEvents.shift()
    }
  }

  private updateAgentCounts(): void {
    let active = 0
    let idle = 0

    for (const status of this.agentStatuses.values()) {
      if (status.status === 'busy') active++
      else if (status.status === 'idle') idle++
    }

    this.schedulerStatus.activeAgents = active
    this.schedulerStatus.idleAgents = idle
  }

  getAgentStatus(agentId: string): AgentStatus | undefined {
    return this.agentStatuses.get(agentId)
  }

  getAllAgentStatuses(): AgentStatus[] {
    return Array.from(this.agentStatuses.values())
  }

  getSchedulerStatus(): SchedulerStatus {
    return { ...this.schedulerStatus }
  }

  getRecentEvents(limit?: number): RecentEvent[] {
    const events = this.recentEvents.slice(-limit)
    return events.map(e => ({ ...e }))
  }

  getRecentEventsByType(type: string, limit?: number): RecentEvent[] {
    const filtered = this.recentEvents.filter(e => e.type === type)
    return filtered.slice(-limit).map(e => ({ ...e }))
  }

  clearRecentEvents(): void {
    this.recentEvents = []
    this.logger.info('Recent events cleared')
  }

  getConfig(): AgentMonitorConfig {
    return { ...this.config }
  }

  updateConfig(config: Partial<AgentMonitorConfig>): void {
    this.config = { ...this.config, ...config }
    this.logger.info('AgentMonitor config updated')
  }
}

export function createAgentMonitor(
  schedulerEmitter: EventEmitter<SchedulerEventMap>,
  config?: Partial<AgentMonitorConfig>
): AgentMonitor {
  return new AgentMonitor(schedulerEmitter, config)
}
