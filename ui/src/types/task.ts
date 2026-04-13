export type TaskPriority = 'critical' | 'high' | 'medium' | 'low'

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface TaskActions {
  canStart: boolean
  canPause: boolean
  canCancel: boolean
  canViewLogs: boolean
}

export interface TaskAgentInfo {
  agentId: string
  agentName: string
  avatar?: string
}

export interface TaskMetadata {
  createdAt: string
  updatedAt: string
  estimatedTime?: number
  actualTime?: number
  retryCount: number
}

export interface TaskCard {
  id: string
  title: string
  description: string
  priority: TaskPriority
  status: TaskStatus
  agentInfo: TaskAgentInfo
  metadata: TaskMetadata
  tags: string[]
  progress?: number
  actions: TaskActions
}

export interface CreateTaskRequest {
  title: string
  description: string
  priority: TaskPriority
  tags?: string[]
  estimatedTime?: number
}

export interface UpdateTaskRequest {
  title?: string
  description?: string
  priority?: TaskPriority
  status?: TaskStatus
  tags?: string[]
  progress?: number
}
