export interface SchedulerEventMap {
  'scheduler:started': { timestamp: Date }
  'scheduler:stopped': { timestamp: Date }
  'task:queued': { taskId: string; priority: number; timestamp: Date }
  'task:started': { taskId: string; agentId: string; timestamp: Date }
  'task:completed': { taskId: string; agentId: string; duration: number; timestamp: Date }
  'task:failed': { taskId: string; agentId: string; error: string; timestamp: Date }
  'task:cancelled': { taskId: string; reason: string; timestamp: Date }
  'agent:created': { agentId: string; timestamp: Date }
  'agent:destroyed': { agentId: string; timestamp: Date }
  'agent:idle': { agentId: string; timestamp: Date }
  'agent:busy': { agentId: string; taskId: string; timestamp: Date }
  'agent:error': { agentId: string; error: string; timestamp: Date }
  'pool:scaled': { size: number; reason: string; timestamp: Date }
  'loadbalance:changed': { strategy: string; timestamp: Date }
  [key: string]: unknown
}

export interface AgentEventMap {
  'query:started': { queryId: string; timestamp: Date }
  'query:completed': { queryId: string; duration: number; tokenUsage: number; timestamp: Date }
  'query:failed': { queryId: string; error: string; timestamp: Date }
  'tool:executed': { toolName: string; duration: number; success: boolean; timestamp: Date }
  'context:compressed': { level: string; tokensBefore: number; tokensAfter: number; timestamp: Date }
  'permission:changed': { mode: string; reason: string; timestamp: Date }
  'abort:requested': { reason: string; timestamp: Date }
  'error:occurred': { type: string; message: string; recoverable: boolean; timestamp: Date }
  [key: string]: unknown
}

export type SchedulerEvent = {
  [K in keyof SchedulerEventMap]: {
    type: K
    data: SchedulerEventMap[K]
  }
}[keyof SchedulerEventMap]

export type AgentEvent = {
  [K in keyof AgentEventMap]: {
    type: K
    data: AgentEventMap[K]
  }
}[keyof AgentEventMap]

export type AllEvents = SchedulerEvent | AgentEvent

export type EventCallback<T> = (data: T) => void | Promise<void>

export interface EventSubscription {
  id: string
  eventType: string
  callback: EventCallback<unknown>
  once: boolean
}

export class EventEmitter<TEventMap extends Record<string, unknown>> {
  private subscriptions: Map<string, EventSubscription[]> = new Map()
  private maxListeners: number = 100

  on<K extends keyof TEventMap>(
    eventType: K,
    callback: EventCallback<TEventMap[K]>
  ): string {
    return this.subscribe(eventType as string, callback as EventCallback<unknown>, false)
  }

  once<K extends keyof TEventMap>(
    eventType: K,
    callback: EventCallback<TEventMap[K]>
  ): string {
    return this.subscribe(eventType as string, callback as EventCallback<unknown>, true)
  }

  off(subscriptionId: string): boolean {
    for (const [eventType, subs] of this.subscriptions) {
      const index = subs.findIndex(s => s.id === subscriptionId)
      if (index !== -1) {
        subs.splice(index, 1)
        if (subs.length === 0) {
          this.subscriptions.delete(eventType)
        }
        return true
      }
    }
    return false
  }

  async emit<K extends keyof TEventMap>(
    eventType: K,
    data: TEventMap[K]
  ): Promise<void> {
    const subs = this.subscriptions.get(eventType as string)
    if (!subs || subs.length === 0) return

    const toRemove: string[] = []

    for (const sub of subs) {
      try {
        await sub.callback(data)
        if (sub.once) {
          toRemove.push(sub.id)
        }
      } catch (error) {
        console.error(`Error in event handler for ${String(eventType)}:`, error)
      }
    }

    for (const id of toRemove) {
      this.off(id)
    }
  }

  private subscribe(
    eventType: string,
    callback: EventCallback<unknown>,
    once: boolean
  ): string {
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, [])
    }

    const subs = this.subscriptions.get(eventType)!
    if (subs.length >= this.maxListeners) {
      console.warn(`Max listeners (${this.maxListeners}) reached for event: ${eventType}`)
    }

    const id = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    subs.push({ id, eventType, callback, once })

    return id
  }

  getListenerCount(eventType?: string): number {
    if (eventType) {
      return this.subscriptions.get(eventType)?.length ?? 0
    }
    return Array.from(this.subscriptions.values()).reduce((sum, subs) => sum + subs.length, 0)
  }

  removeAllListeners(eventType?: string): void {
    if (eventType) {
      this.subscriptions.delete(eventType)
    } else {
      this.subscriptions.clear()
    }
  }

  setMaxListeners(max: number): void {
    this.maxListeners = max
  }
}

export function createEventEmitter<TEventMap extends Record<string, unknown>>(): EventEmitter<TEventMap> {
  return new EventEmitter<TEventMap>()
}
