import type { AgentBackend, AgentSpawnConfig, AgentMessage } from './types.js'
import type { BackendType, AgentId } from '../types.js'
import type { AgentEvent } from '../scheduler/types.js'
import { Logger } from '../infrastructure/logging/logger.js'

export class InProcessBackend implements AgentBackend {
  readonly type: BackendType = 'in-process'
  private agents: Map<AgentId, { active: boolean; output: AgentEvent[] }> = new Map()
  private logger: Logger

  constructor() {
    this.logger = new Logger({ source: 'InProcessBackend' })
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async spawn(config: AgentSpawnConfig): Promise<void> {
    const agentId = config.agentId

    if (this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} already exists`)
    }

    this.agents.set(agentId, {
      active: true,
      output: []
    })

    this.logger.info('Agent spawned in process', { agentId })
  }

  async sendMessage(agentId: string, message: AgentMessage): Promise<void> {
    const agent = this.agents.get(agentId)

    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    if (!agent.active) {
      throw new Error(`Agent ${agentId} is not active`)
    }

    this.logger.debug('Message sent to agent', { agentId, messageType: message.type })

    agent.output.push({
      type: 'message_received',
      agentId,
      timestamp: Date.now(),
      data: message
    })
  }

  async terminate(agentId: string, reason?: string): Promise<void> {
    const agent = this.agents.get(agentId)

    if (!agent) {
      this.logger.warn('Attempted to terminate unknown agent', { agentId })
      return
    }

    agent.active = false

    this.logger.info('Agent terminated', { agentId, reason })
  }

  async *getOutput(agentId: string): AsyncGenerator<AgentEvent> {
    const agent = this.agents.get(agentId)

    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    let lastIndex = 0

    while (agent.active) {
      const newEvents = agent.output.slice(lastIndex)
      lastIndex = agent.output.length

      for (const event of newEvents) {
        yield event
      }

      await new Promise(resolve => setTimeout(resolve, 100))
    }

    const remainingEvents = agent.output.slice(lastIndex)
    for (const event of remainingEvents) {
      yield event
    }
  }

  async isActive(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId)
    return agent?.active ?? false
  }

  getAgentCount(): number {
    return this.agents.size
  }

  getActiveAgentCount(): number {
    let count = 0
    for (const agent of this.agents.values()) {
      if (agent.active) count++
    }
    return count
  }
}

export function createInProcessBackend(): InProcessBackend {
  return new InProcessBackend()
}
