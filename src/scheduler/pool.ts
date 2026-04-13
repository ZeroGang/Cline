import type { AgentId } from '../types.js'
import type { AgentDefinition, QueryDeps } from '../agent/types.js'
import { AgentInstanceImpl, createAgentInstance } from '../agent/instance.js'
import { createAgentContext } from '../agent/context.js'
import { ToolRegistry } from '../tools/registry.js'
import { PermissionSystem } from '../permissions/system.js'
import { Store } from '../infrastructure/state/store.js'
import { DEFAULT_APP_STATE } from '../infrastructure/state/index.js'
import { Logger } from '../infrastructure/logging/logger.js'

export interface AgentPoolConfig {
  minAgents: number
  maxAgents: number
  agentDefinition: AgentDefinition
}

interface PooledAgent {
  instance: AgentInstanceImpl
  inUse: boolean
  lastUsed: number
}

export class AgentPool {
  private pool: Map<AgentId, PooledAgent> = new Map()
  private config: AgentPoolConfig
  private deps: QueryDeps
  private logger: Logger
  private store: Store<typeof DEFAULT_APP_STATE>
  private shrinkTimer: NodeJS.Timeout | null = null
  private initialized = false

  constructor(config: AgentPoolConfig, deps: QueryDeps) {
    this.config = config
    this.deps = deps
    this.logger = new Logger('AgentPool')
    this.store = new Store(DEFAULT_APP_STATE)
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('AgentPool already initialized')
      return
    }

    this.logger.info('Initializing AgentPool', {
      minAgents: this.config.minAgents,
      maxAgents: this.config.maxAgents
    })

    for (let i = 0; i < this.config.minAgents; i++) {
      await this.createAgent()
    }

    this.startShrinkTimer()
    this.initialized = true

    this.logger.info('AgentPool initialized', {
      agentCount: this.pool.size
    })
  }

  async acquire(): Promise<AgentInstanceImpl | null> {
    if (!this.initialized) {
      await this.initialize()
    }

    let availableAgent: PooledAgent | undefined

    for (const [id, agent] of this.pool) {
      if (!agent.inUse && agent.instance.status === 'idle') {
        availableAgent = agent
        break
      }
    }

    if (!availableAgent && this.pool.size < this.config.maxAgents) {
      const agentId = await this.createAgent()
      availableAgent = this.pool.get(agentId)
    }

    if (!availableAgent) {
      this.logger.warn('No available agents in pool')
      return null
    }

    availableAgent.inUse = true
    availableAgent.lastUsed = Date.now()

    this.logger.info('Agent acquired', {
      agentId: availableAgent.instance.id,
      poolSize: this.pool.size,
      inUse: this.getInUseCount()
    })

    return availableAgent.instance
  }

  async release(agentId: AgentId): Promise<void> {
    const agent = this.pool.get(agentId)

    if (!agent) {
      this.logger.warn('Attempted to release unknown agent', { agentId })
      return
    }

    agent.inUse = false
    agent.lastUsed = Date.now()

    this.logger.info('Agent released', {
      agentId,
      poolSize: this.pool.size,
      inUse: this.getInUseCount()
    })

    if (this.pool.size > this.config.minAgents) {
      await this.tryShrink()
    }
  }

  async terminate(agentId: AgentId, reason?: string): Promise<void> {
    const agent = this.pool.get(agentId)

    if (!agent) {
      this.logger.warn('Attempted to terminate unknown agent', { agentId })
      return
    }

    await agent.instance.dispose()
    this.pool.delete(agentId)

    this.logger.info('Agent terminated', {
      agentId,
      reason,
      poolSize: this.pool.size
    })
  }

  async shutdown(): Promise<void> {
    if (this.shrinkTimer) {
      clearInterval(this.shrinkTimer)
      this.shrinkTimer = null
    }

    const terminationPromises: Promise<void>[] = []

    for (const [agentId, agent] of this.pool) {
      terminationPromises.push(
        agent.instance.dispose().then(() => {
          this.logger.info('Agent disposed during shutdown', { agentId })
        })
      )
    }

    await Promise.all(terminationPromises)
    this.pool.clear()
    this.initialized = false

    this.logger.info('AgentPool shutdown complete')
  }

  getPoolSize(): number {
    return this.pool.size
  }

  getAvailableCount(): number {
    let count = 0
    for (const agent of this.pool.values()) {
      if (!agent.inUse && agent.instance.status === 'idle') {
        count++
      }
    }
    return count
  }

  getInUseCount(): number {
    let count = 0
    for (const agent of this.pool.values()) {
      if (agent.inUse) {
        count++
      }
    }
    return count
  }

  getAgent(agentId: AgentId): AgentInstanceImpl | undefined {
    return this.pool.get(agentId)?.instance
  }

  getAllAgents(): AgentInstanceImpl[] {
    return Array.from(this.pool.values()).map(a => a.instance)
  }

  private async createAgent(): Promise<AgentId> {
    const agentId = `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const tools = new ToolRegistry()
    const permissionSystem = new PermissionSystem({
      mode: this.config.agentDefinition.permissionMode
    })

    const context = createAgentContext({
      tools,
      permissionSystem,
      store: this.store,
      sessionId: agentId
    })

    const instance = createAgentInstance(
      agentId,
      this.config.agentDefinition,
      context,
      this.deps
    )

    this.pool.set(agentId, {
      instance,
      inUse: false,
      lastUsed: Date.now()
    })

    this.logger.debug('Agent created', { agentId, poolSize: this.pool.size })

    return agentId
  }

  private startShrinkTimer(): void {
    this.shrinkTimer = setInterval(() => {
      this.tryShrink()
    }, 60000)
  }

  private async tryShrink(): Promise<void> {
    if (this.pool.size <= this.config.minAgents) {
      return
    }

    const now = Date.now()
    const shrinkThreshold = 300000 // 5 minutes

    const agentsToTerminate: AgentId[] = []

    for (const [agentId, agent] of this.pool) {
      if (
        !agent.inUse &&
        agent.instance.status === 'idle' &&
        now - agent.lastUsed > shrinkThreshold &&
        this.pool.size - agentsToTerminate.length > this.config.minAgents
      ) {
        agentsToTerminate.push(agentId)
      }
    }

    for (const agentId of agentsToTerminate) {
      await this.terminate(agentId, 'Idle timeout')
    }

    if (agentsToTerminate.length > 0) {
      this.logger.info('Pool shrunk', {
        terminatedCount: agentsToTerminate.length,
        newSize: this.pool.size
      })
    }
  }
}

export function createAgentPool(config: AgentPoolConfig, deps: QueryDeps): AgentPool {
  return new AgentPool(config, deps)
}
