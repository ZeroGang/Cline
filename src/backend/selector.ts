import type { AgentBackend } from './types.js'
import type { BackendType } from '../types.js'
import { InProcessBackend, createInProcessBackend } from './inprocess.js'
import { TmuxBackend, createTmuxBackend } from './tmux.js'
import { Logger } from '../infrastructure/logging/logger.js'

export interface BackendSelectorConfig {
  preferredBackend?: BackendType
  fallbackToInProcess?: boolean
}

export class BackendSelector {
  private backends: Map<BackendType, AgentBackend> = new Map()
  private preferredBackend: BackendType
  private fallbackToInProcess: boolean
  private logger: Logger

  constructor(config: BackendSelectorConfig = {}) {
    this.preferredBackend = config.preferredBackend || 'tmux'
    this.fallbackToInProcess = config.fallbackToInProcess ?? true
    this.logger = new Logger('BackendSelector')

    this.registerBackend(createInProcessBackend())
    this.registerBackend(createTmuxBackend())
  }

  registerBackend(backend: AgentBackend): void {
    this.backends.set(backend.type, backend)
    this.logger.debug('Backend registered', { type: backend.type })
  }

  async select(): Promise<AgentBackend> {
    const preferred = this.backends.get(this.preferredBackend)

    if (preferred && await preferred.isAvailable()) {
      this.logger.info('Selected preferred backend', { type: this.preferredBackend })
      return preferred
    }

    this.logger.warn('Preferred backend not available', { type: this.preferredBackend })

    if (this.fallbackToInProcess) {
      const inProcess = this.backends.get('inprocess')
      if (inProcess && await inProcess.isAvailable()) {
        this.logger.info('Falling back to inprocess backend')
        return inProcess
      }
    }

    for (const [type, backend] of this.backends) {
      if (type !== this.preferredBackend && type !== 'inprocess') {
        if (await backend.isAvailable()) {
          this.logger.info('Selected available backend', { type })
          return backend
        }
      }
    }

    throw new Error('No available backend found')
  }

  async getAvailableBackends(): Promise<BackendType[]> {
    const available: BackendType[] = []

    for (const [type, backend] of this.backends) {
      if (await backend.isAvailable()) {
        available.push(type)
      }
    }

    return available
  }

  getBackend(type: BackendType): AgentBackend | undefined {
    return this.backends.get(type)
  }

  setPreferredBackend(type: BackendType): void {
    this.preferredBackend = type
    this.logger.info('Preferred backend updated', { type })
  }
}

export function createBackendSelector(config?: BackendSelectorConfig): BackendSelector {
  return new BackendSelector(config)
}
