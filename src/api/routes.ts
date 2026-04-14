import { ApiServer, type ApiRequest } from './server.js'
import type { Task, TaskStatus, TaskPriority } from '../scheduler/types.js'
import type { AgentStatus } from '../monitoring/monitor.js'

export interface TaskApiDependencies {
  createTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Task>
  getTask: (id: string) => Promise<Task | undefined>
  listTasks: (filter?: { status?: TaskStatus; priority?: TaskPriority }) => Promise<Task[]>
  updateTask: (id: string, updates: Partial<Task>) => Promise<Task | undefined>
  deleteTask: (id: string) => Promise<boolean>
  cancelTask: (id: string, reason?: string) => Promise<boolean>
}

/** POST /api/agents JSON 体（字段均可选） */
export interface SpawnAgentRequestBody {
  displayName?: string
  avatar?: string
  personalityPrompt?: string
  /** 绝对或相对路径；须为已存在目录，否则回退服务端默认 `agentProjectRoot` */
  projectRoot?: string
}

export interface AgentApiDependencies {
  getAgentStatus: (agentId: string) => AgentStatus | undefined
  getAllAgentStatuses: () => AgentStatus[]
  /** 新增一名 Agent；池满时返回 `null` */
  spawnAgent?: (input?: SpawnAgentRequestBody) => Promise<AgentStatus | null>
}

export interface SchedulerApiDependencies {
  getSchedulerStatus: () => {
    running: boolean
    totalAgents: number
    activeAgents: number
    idleAgents: number
    queuedTasks: number
    completedTasks: number
    failedTasks: number
  }
  start: () => Promise<void>
  stop: () => Promise<void>
}

export class TaskApi {
  private server: ApiServer
  private deps: TaskApiDependencies

  constructor(server: ApiServer, deps: TaskApiDependencies) {
    this.server = server
    this.deps = deps
    this.registerRoutes()
  }

  private registerRoutes(): void {
    this.server.get('/api/tasks', async (req) => {
      const filter: { status?: TaskStatus; priority?: TaskPriority } = {}
      
      if (req.query.status) {
        filter.status = req.query.status as TaskStatus
      }
      if (req.query.priority) {
        filter.priority = req.query.priority as TaskPriority
      }

      const tasks = await this.deps.listTasks(Object.keys(filter).length > 0 ? filter : undefined)
      return this.server.json({ tasks })
    })

    this.server.get('/api/tasks/:id', async (req) => {
      const id = this.getPathParam(req, 'id')
      if (!id) {
        return this.server.errorResponse(400, 'Missing task id')
      }

      const task = await this.deps.getTask(id)
      if (!task) {
        return this.server.errorResponse(404, 'Task not found')
      }

      return this.server.json({ task })
    })

    this.server.post('/api/tasks', async (req) => {
      if (!req.body || typeof req.body !== 'object') {
        return this.server.errorResponse(400, 'Invalid request body')
      }

      const body = req.body as Record<string, unknown>
      
      if (!body.prompt) {
        return this.server.errorResponse(400, 'Missing prompt')
      }

      const task = await this.deps.createTask({
        prompt: body.prompt as string,
        type: (body.type as string) || 'default',
        priority: (body.priority as TaskPriority) || 'medium',
        status: 'pending',
        dependencies: (body.dependencies as string[]) || [],
        retryCount: 0,
        maxRetries: 3,
        metadata: (body.metadata as Record<string, unknown>) || {}
      })

      return this.server.json({ task }, 201)
    })

    this.server.put('/api/tasks/:id', async (req) => {
      const id = this.getPathParam(req, 'id')
      if (!id) {
        return this.server.errorResponse(400, 'Missing task id')
      }

      if (!req.body || typeof req.body !== 'object') {
        return this.server.errorResponse(400, 'Invalid request body')
      }

      const body = req.body as Record<string, unknown>
      const updates: Partial<Task> = {}

      if (body.priority) updates.priority = body.priority as TaskPriority
      if (body.status) updates.status = body.status as TaskStatus
      if (body.prompt) updates.prompt = body.prompt as string
      if (body.metadata) updates.metadata = body.metadata as Record<string, unknown>

      const task = await this.deps.updateTask(id, updates)
      if (!task) {
        return this.server.errorResponse(404, 'Task not found')
      }

      return this.server.json({ task })
    })

    this.server.delete('/api/tasks/:id', async (req) => {
      const id = this.getPathParam(req, 'id')
      if (!id) {
        return this.server.errorResponse(400, 'Missing task id')
      }

      const deleted = await this.deps.deleteTask(id)
      if (!deleted) {
        return this.server.errorResponse(404, 'Task not found')
      }

      return this.server.json({ success: true })
    })

    this.server.post('/api/tasks/:id/cancel', async (req) => {
      const id = this.getPathParam(req, 'id')
      if (!id) {
        return this.server.errorResponse(400, 'Missing task id')
      }

      const body = req.body as Record<string, unknown> | undefined
      const reason = body?.reason as string | undefined

      const cancelled = await this.deps.cancelTask(id, reason)
      if (!cancelled) {
        return this.server.errorResponse(404, 'Task not found or cannot be cancelled')
      }

      return this.server.json({ success: true })
    })
  }

  private getPathParam(req: ApiRequest, name: string): string | undefined {
    const parts = req.path.split('/').filter(Boolean)
    const routeParts = '/api/tasks/:id'.split('/').filter(Boolean)
    
    const index = routeParts.findIndex(p => p === `:${name}`)
    if (index === -1 || index >= parts.length) {
      return undefined
    }
    
    return parts[index]
  }
}

export class AgentApi {
  private server: ApiServer
  private deps: AgentApiDependencies

  constructor(server: ApiServer, deps: AgentApiDependencies) {
    this.server = server
    this.deps = deps
    this.registerRoutes()
  }

  private registerRoutes(): void {
    this.server.get('/api/agents', async () => {
      const agents = this.deps.getAllAgentStatuses()
      return this.server.json({ agents })
    })

    this.server.post('/api/agents', async (req) => {
      if (!this.deps.spawnAgent) {
        return this.server.errorResponse(501, 'Agent spawn not configured')
      }
      let input: SpawnAgentRequestBody | undefined
      if (req.body && typeof req.body === 'object') {
        const b = req.body as Record<string, unknown>
        const displayName =
          typeof b.displayName === 'string' ? b.displayName.trim().slice(0, 128) : undefined
        const avatar = typeof b.avatar === 'string' ? b.avatar.trim().slice(0, 2048) : undefined
        const personalityPrompt =
          typeof b.personalityPrompt === 'string' ? b.personalityPrompt.trim().slice(0, 32000) : undefined
        const projectRoot =
          typeof b.projectRoot === 'string' ? b.projectRoot.trim().slice(0, 2048) : undefined
        if (displayName || avatar || personalityPrompt || projectRoot) {
          input = {}
          if (displayName) input.displayName = displayName
          if (avatar) input.avatar = avatar
          if (personalityPrompt) input.personalityPrompt = personalityPrompt
          if (projectRoot) input.projectRoot = projectRoot
        }
      }
      const agent = await this.deps.spawnAgent(input)
      if (!agent) {
        return this.server.errorResponse(400, 'Cannot spawn agent: pool at max capacity')
      }
      return this.server.json({ agent }, 201)
    })

    this.server.get('/api/agents/:id', async (req) => {
      const id = req.path.split('/').filter(Boolean)[2]
      if (!id) {
        return this.server.errorResponse(400, 'Missing agent id')
      }

      const agent = this.deps.getAgentStatus(id)
      if (!agent) {
        return this.server.errorResponse(404, 'Agent not found')
      }

      return this.server.json({ agent })
    })
  }
}

export class SchedulerApi {
  private server: ApiServer
  private deps: SchedulerApiDependencies

  constructor(server: ApiServer, deps: SchedulerApiDependencies) {
    this.server = server
    this.deps = deps
    this.registerRoutes()
  }

  private registerRoutes(): void {
    this.server.get('/api/scheduler/status', async () => {
      const status = this.deps.getSchedulerStatus()
      return this.server.json({ status })
    })

    this.server.post('/api/scheduler/start', async () => {
      await this.deps.start()
      return this.server.json({ success: true })
    })

    this.server.post('/api/scheduler/stop', async () => {
      await this.deps.stop()
      return this.server.json({ success: true })
    })
  }
}

export function setupApiRoutes(
  server: ApiServer,
  deps: {
    task: TaskApiDependencies
    agent: AgentApiDependencies
    scheduler: SchedulerApiDependencies
  }
): void {
  new TaskApi(server, deps.task)
  new AgentApi(server, deps.agent)
  new SchedulerApi(server, deps.scheduler)

  server.get('/api/openapi.json', async () => {
    return server.json(server.getOpenApiSpec())
  })

  server.get('/api/health', async () => {
    return server.json({ status: 'ok', timestamp: new Date().toISOString() })
  })
}
