import type { BackendType } from '../types.js'
import type { AgentEvent } from '../scheduler/types.js'

export interface AgentSpawnConfig {
  agentId: string
  backendType?: BackendType
  workingDir?: string
  env?: Record<string, string>
}

export interface AgentMessage {
  type: string
  payload: unknown
}

export interface AgentBackend {
  readonly type: BackendType

  isAvailable(): Promise<boolean>
  spawn(config: AgentSpawnConfig): Promise<unknown>
  sendMessage(agentId: string, message: AgentMessage): Promise<void>
  terminate(agentId: string, reason?: string): Promise<void>
  getOutput(agentId: string): AsyncGenerator<AgentEvent>
  isActive(agentId: string): Promise<boolean>
}

export type { BackendType } from '../types.js'
