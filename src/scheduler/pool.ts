import type { AgentId } from '../types.js'
import { AgentInstanceImpl } from '../agent/instance.js'
import type { AgentPoolConfig } from './types.js'
import type { QueryDeps, AgentDefinition } from '../agent/types.js'
import { Logger } from '../infrastructure/logging/logger.js'

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
  private shrinkTimer: NodeJS.Timeout | null = null
  private initialized = false
  private agentDefinition: AgentDefinition

  constructor(config: AgentPoolConfig, deps: QueryDeps, agentDefinition?: AgentDefinition) {
    this.config = config
    this.deps = deps
    this.logger = new Logger({ source: 'AgentPool' })
    this.agentDefinition = agentDefinition || {
      agentType: 'default',
      permissionMode: 'default',
      isolation: 'shared',
      background: false
    }
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

    for (const [, agent] of this.pool) {
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
    this.logger.info('Shutting down AgentPool')

    if (this.shrinkTimer) {
      clearInterval(this.shrinkTimer)
      this.shrinkTimer = null
    }

    for (const [agentId, agent] of this.pool) {
      await agent.instance.dispose()
      this.logger.debug('Agent disposed during shutdown', { agentId })
    }

    this.pool.clear()
    this.initialized = false

    this.logger.info('AgentPool shutdown complete')
  }

  getPoolSize(): number {
    return this.pool.size
  }

  getInUseCount(): number {
    let count = 0
    for (const agent of this.pool.values()) {
      if (agent.inUse) count++
    }
    return count
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

  getAgent(agentId: AgentId): AgentInstanceImpl | undefined {
    return this.pool.get(agentId)?.instance
  }

  getAllAgents(): AgentInstanceImpl[] {
    return Array.from(this.pool.values()).map(a => a.instance)
  }

  /**
   * 在未达 `maxAgents` 时新增一名空闲 Agent（与 acquire 时按需扩容逻辑一致）。
   * @returns 新 Agent id；池已满则返回 `null`
   */
  async spawnExtraAgent(
    profile?: Partial<Pick<AgentDefinition, 'displayName' | 'avatar' | 'systemPrompt'>>
  ): Promise<AgentId | null> {
    if (!this.initialized) {
      await this.initialize()
    }
    if (this.pool.size >= this.config.maxAgents) {
      this.logger.warn('spawnExtraAgent: pool at max capacity', {
        size: this.pool.size,
        maxAgents: this.config.maxAgents,
      })
      return null
    }
    return this.createAgent(profile)
  }

  private async createAgent(
    profile?: Partial<Pick<AgentDefinition, 'displayName' | 'avatar' | 'systemPrompt'>>
  ): Promise<AgentId> {
    const agentId = `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` as AgentId

    const definition: AgentDefinition = profile
      ? { ...this.agentDefinition, ...profile }
      : this.agentDefinition

    const instance = new AgentInstanceImpl(
      agentId,
      definition,
      {} as any,
      this.deps
    )

    this.pool.set(agentId, {
      instance,
      inUse: false,
      lastUsed: Date.now()
    })

    this.logger.debug('Agent created', {
      agentId,
      poolSize: this.pool.size
    })

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
    const idleThreshold = 300000

    for (const [agentId, agent] of this.pool) {
      if (
        !agent.inUse &&
        now - agent.lastUsed > idleThreshold &&
        this.pool.size > this.config.minAgents
      ) {
        await this.terminate(agentId, 'idle_timeout')
      }
    }
  }
}

export function createAgentPool(config: AgentPoolConfig, deps: QueryDeps, agentDefinition?: AgentDefinition): AgentPool {
  return new AgentPool(config, deps, agentDefinition)
}
