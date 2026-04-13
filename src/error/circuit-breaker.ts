import { Logger } from '../infrastructure/logging/logger.js'

export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerConfig {
  failureThreshold: number
  successThreshold: number
  timeout: number
  resetTimeout: number
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 30000,
  resetTimeout: 60000
}

export class CircuitBreaker {
  private config: CircuitBreakerConfig
  private logger: Logger
  private state: CircuitState = 'closed'
  private failureCount: number = 0
  private successCount: number = 0
  private lastFailureTime: number | null = null
  private lastStateChange: number = Date.now()

  constructor(
    private name: string,
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.logger = new Logger({ source: `CircuitBreaker:${name}` })
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.transitionTo('half-open')
      } else {
        throw new Error(`Circuit breaker '${this.name}' is open`)
      }
    }

    try {
      const result = await this.executeWithTimeout(operation)
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  getState(): CircuitState {
    return this.state
  }

  getStats(): {
    state: CircuitState
    failureCount: number
    successCount: number
    lastFailureTime: number | null
    uptime: number
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      uptime: Date.now() - this.lastStateChange
    }
  }

  reset(): void {
    this.transitionTo('closed')
    this.failureCount = 0
    this.successCount = 0
    this.lastFailureTime = null
    this.logger.info('Circuit breaker reset', { name: this.name })
  }

  forceOpen(): void {
    this.transitionTo('open')
    this.logger.warn('Circuit breaker forced open', { name: this.name })
  }

  private onSuccess(): void {
    this.failureCount = 0

    if (this.state === 'half-open') {
      this.successCount++
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo('closed')
      }
    }
  }

  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
    this.successCount = 0

    if (this.state === 'half-open') {
      this.transitionTo('open')
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.transitionTo('open')
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return true
    return Date.now() - this.lastFailureTime >= this.config.resetTimeout
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state
    this.state = newState
    this.lastStateChange = Date.now()

    if (newState === 'closed') {
      this.failureCount = 0
      this.successCount = 0
    } else if (newState === 'half-open') {
      this.successCount = 0
    }

    this.logger.info('Circuit breaker state changed', {
      name: this.name,
      from: oldState,
      to: newState
    })
  }

  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Operation timeout')), this.config.timeout)
    })

    return Promise.race([operation(), timeoutPromise])
  }
}

export class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map()
  private logger: Logger

  constructor() {
    this.logger = new Logger({ source: 'CircuitBreakerManager' })
  }

  getBreaker(
    name: string,
    config?: Partial<CircuitBreakerConfig>
  ): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const breaker = new CircuitBreaker(name, config)
      this.breakers.set(name, breaker)
      this.logger.info('Circuit breaker created', { name })
    }
    return this.breakers.get(name)!
  }

  getAllStats(): Record<string, ReturnType<CircuitBreaker['getStats']>> {
    const stats: Record<string, ReturnType<CircuitBreaker['getStats']>> = {}
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats()
    }
    return stats
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset()
    }
    this.logger.info('All circuit breakers reset')
  }

  removeBreaker(name: string): boolean {
    return this.breakers.delete(name)
  }

  clearAll(): void {
    this.breakers.clear()
    this.logger.info('All circuit breakers cleared')
  }
}

export const circuitBreakerManager = new CircuitBreakerManager()
