import type { AgentId, TaskId } from '../types.js'
import { Logger } from '../infrastructure/logging/logger.js'

export interface AgentMessage {
  id: string
  from: AgentId
  to: AgentId | 'broadcast'
  type: 'task' | 'result' | 'error' | 'progress' | 'control'
  taskId?: TaskId
  payload: unknown
  timestamp: number
}

export interface MailboxOptions {
  maxSize?: number
}

const DEFAULT_OPTIONS: MailboxOptions = {
  maxSize: 1000
}

export class AgentMailbox {
  private mailboxes: Map<AgentId, AgentMessage[]> = new Map()
  private maxSize: number
  private logger: Logger

  constructor(options: Partial<MailboxOptions> = {}) {
    this.maxSize = options.maxSize ?? DEFAULT_OPTIONS.maxSize!
    this.logger = new Logger({ source: 'AgentMailbox' })
  }

  register(agentId: AgentId): void {
    if (!this.mailboxes.has(agentId)) {
      this.mailboxes.set(agentId, [])
      this.logger.debug('Agent mailbox registered', { agentId })
    }
  }

  unregister(agentId: AgentId): void {
    this.mailboxes.delete(agentId)
    this.logger.debug('Agent mailbox unregistered', { agentId })
  }

  send(message: AgentMessage): void {
    if (message.to === 'broadcast') {
      this.broadcast(message)
      return
    }

    const mailbox = this.mailboxes.get(message.to)
    if (!mailbox) {
      this.logger.warn('Target mailbox not found', { to: message.to })
      return
    }

    if (mailbox.length >= this.maxSize) {
      this.logger.warn('Mailbox full, dropping oldest message', { agentId: message.to })
      mailbox.shift()
    }

    mailbox.push(message)
    this.logger.debug('Message sent', { 
      from: message.from, 
      to: message.to, 
      type: message.type 
    })
  }

  receive(agentId: AgentId): AgentMessage | null {
    const mailbox = this.mailboxes.get(agentId)
    if (!mailbox || mailbox.length === 0) {
      return null
    }

    return mailbox.shift()!
  }

  receiveAll(agentId: AgentId): AgentMessage[] {
    const mailbox = this.mailboxes.get(agentId)
    if (!mailbox) {
      return []
    }

    const messages = [...mailbox]
    mailbox.length = 0
    return messages
  }

  broadcast(message: AgentMessage): void {
    for (const [agentId, mailbox] of this.mailboxes) {
      if (agentId !== message.from) {
        if (mailbox.length >= this.maxSize) {
          mailbox.shift()
        }
        mailbox.push({ ...message, to: agentId })
      }
    }

    this.logger.debug('Message broadcast', { 
      from: message.from, 
      type: message.type 
    })
  }

  hasMessages(agentId: AgentId): boolean {
    const mailbox = this.mailboxes.get(agentId)
    return mailbox !== undefined && mailbox.length > 0
  }

  getMessageCount(agentId: AgentId): number {
    return this.mailboxes.get(agentId)?.length ?? 0
  }

  clear(agentId: AgentId): void {
    const mailbox = this.mailboxes.get(agentId)
    if (mailbox) {
      mailbox.length = 0
    }
  }

  clearAll(): void {
    for (const mailbox of this.mailboxes.values()) {
      mailbox.length = 0
    }
  }
}

export function createAgentMailbox(options?: Partial<MailboxOptions>): AgentMailbox {
  return new AgentMailbox(options)
}
