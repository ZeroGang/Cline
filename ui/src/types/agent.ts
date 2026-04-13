export type AgentStatus = 'idle' | 'busy' | 'error' | 'offline'

export type AgentHealth = 'healthy' | 'degraded' | 'unhealthy'

export interface AgentResourceUsage {
  cpu: number
  memory: number
  memoryUnit: string
  networkIO: {
    inbound: number
    outbound: number
    unit: string
  }
}

export interface AgentInfo {
  agentId: string
  agentName: string
  avatar?: string
  status: AgentStatus
  health: AgentHealth
  resources: AgentResourceUsage
  currentTaskId?: string
  totalTasksCompleted: number
  uptime: number
  lastHeartbeat: string
}

export interface UpdateAgentConfigRequest {
  permissionMode?: string
  maxTurns?: number
  timeout?: number
}
