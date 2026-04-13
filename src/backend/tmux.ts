import type { AgentBackend, AgentSpawnConfig, AgentMessage } from './types.js'
import type { BackendType, AgentId } from '../types.js'
import type { AgentEvent } from '../scheduler/types.js'
import { Logger } from '../infrastructure/logging/logger.js'

export class TmuxBackend implements AgentBackend {
  readonly type: BackendType = 'tmux'
  private sessions: Map<AgentId, { 
    active: boolean
    sessionName: string
    output: string[]
  }> = new Map()
  private logger: Logger
  private available: boolean = false

  constructor() {
    this.logger = new Logger({ source: 'TmuxBackend' })
    this.checkAvailability()
  }

  private async checkAvailability(): Promise<void> {
    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      await execAsync('tmux -V')
      this.available = true
      this.logger.info('Tmux is available')
    } catch (error) {
      this.available = false
      this.logger.warn('Tmux is not available', { 
        error: error instanceof Error ? error.message : String(error) 
      })
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.available
  }

  async spawn(config: AgentSpawnConfig): Promise<void> {
    if (!this.available) {
      throw new Error('Tmux is not available on this system')
    }

    const agentId = config.agentId
    const sessionName = `cline-${agentId}`

    if (this.sessions.has(agentId)) {
      throw new Error(`Agent ${agentId} already exists`)
    }

    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      await execAsync(`tmux new-session -d -s ${sessionName}`)

      this.sessions.set(agentId, {
        active: true,
        sessionName,
        output: []
      })

      this.logger.info('Tmux session created', { agentId, sessionName })
    } catch (error) {
      throw new Error(`Failed to create tmux session: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async sendMessage(agentId: string, message: AgentMessage): Promise<void> {
    const session = this.sessions.get(agentId)

    if (!session) {
      throw new Error(`Agent ${agentId} not found`)
    }

    if (!session.active) {
      throw new Error(`Agent ${agentId} is not active`)
    }

    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      const messageStr = JSON.stringify(message)
      await execAsync(`tmux send-keys -t ${session.sessionName} '${messageStr}' Enter`)

      this.logger.debug('Message sent to tmux session', { 
        agentId, 
        sessionName: session.sessionName,
        messageType: message.type 
      })
    } catch (error) {
      throw new Error(`Failed to send message to tmux session: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async terminate(agentId: string, reason?: string): Promise<void> {
    const session = this.sessions.get(agentId)

    if (!session) {
      this.logger.warn('Attempted to terminate unknown agent', { agentId })
      return
    }

    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      await execAsync(`tmux kill-session -t ${session.sessionName}`)

      session.active = false

      this.logger.info('Tmux session terminated', { agentId, sessionName: session.sessionName, reason })
    } catch (error) {
      this.logger.error('Failed to kill tmux session', {
        agentId,
        sessionName: session.sessionName,
        error: error instanceof Error ? error.message : String(error)
      })
      session.active = false
    }
  }

  async *getOutput(agentId: string): AsyncGenerator<AgentEvent> {
    const session = this.sessions.get(agentId)

    if (!session) {
      throw new Error(`Agent ${agentId} not found`)
    }

    while (session.active) {
      try {
        const { exec } = await import('child_process')
        const { promisify } = await import('util')
        const execAsync = promisify(exec)

        const { stdout } = await execAsync(`tmux capture-pane -t ${session.sessionName} -p`)

        const event: AgentEvent = {
          type: 'output',
          agentId,
          timestamp: Date.now(),
          data: { output: stdout }
        }

        yield event

        await new Promise(resolve => setTimeout(resolve, 500))
      } catch (error) {
        this.logger.error('Failed to capture tmux output', {
          agentId,
          error: error instanceof Error ? error.message : String(error)
        })
        break
      }
    }
  }

  async isActive(agentId: string): Promise<boolean> {
    const session = this.sessions.get(agentId)
    return session?.active ?? false
  }

  getSessionCount(): number {
    return this.sessions.size
  }

  getActiveSessionCount(): number {
    let count = 0
    for (const session of this.sessions.values()) {
      if (session.active) count++
    }
    return count
  }
}

export function createTmuxBackend(): TmuxBackend {
  return new TmuxBackend()
}
