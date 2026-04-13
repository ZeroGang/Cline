const JSON_HDR = { 'Content-Type': 'application/json; charset=utf-8' } as const

export interface ApiAgent {
  id: string
  status: 'idle' | 'busy' | 'error' | 'offline'
  currentTask?: string
  lastActivity?: string
  totalQueries: number
  totalTokens: number
  totalCost: number
  errorCount: number
  displayName?: string
  avatar?: string
}

export async function fetchAgents(): Promise<ApiAgent[]> {
  const r = await fetch('/api/agents', { cache: 'no-store' })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const j = (await r.json()) as { agents?: ApiAgent[] }
  return Array.isArray(j.agents) ? j.agents : []
}

export type SpawnAgentPayload = {
  displayName?: string
  avatar?: string
  personalityPrompt?: string
}

/** 在未满员时新增一名 Agent（受服务端 maxAgents 限制） */
export async function spawnAgent(body: SpawnAgentPayload = {}): Promise<ApiAgent> {
  const r = await fetch('/api/agents', {
    method: 'POST',
    headers: JSON_HDR,
    body: JSON.stringify(body),
  })
  const j = (await r.json()) as { agent?: ApiAgent; error?: string }
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
  if (!j.agent) throw new Error('Invalid response')
  return j.agent
}

export interface ApiTask {
  id: string
  type: string
  priority: string
  status: string
  prompt: string
  dependencies: string[]
  retryCount: number
  maxRetries: number
  createdAt: number
  updatedAt?: number
  startedAt?: number
  completedAt?: number
  error?: string
  result?: unknown
  metadata?: Record<string, unknown>
}

export async function fetchTasks(): Promise<ApiTask[]> {
  const r = await fetch('/api/tasks', { cache: 'no-store' })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const j = (await r.json()) as { tasks?: ApiTask[] }
  return Array.isArray(j.tasks) ? j.tasks : []
}

export async function createTask(prompt: string): Promise<ApiTask> {
  const r = await fetch('/api/tasks', {
    method: 'POST',
    headers: JSON_HDR,
    body: JSON.stringify({
      prompt,
      priority: 'medium',
      type: 'default',
    }),
  })
  const j = (await r.json()) as { task?: ApiTask; error?: string }
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
  if (!j.task) throw new Error('Invalid response')
  return j.task
}

export async function updateTask(id: string, body: Record<string, unknown>): Promise<ApiTask> {
  const r = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: JSON_HDR,
    body: JSON.stringify(body),
  })
  const j = (await r.json()) as { task?: ApiTask; error?: string }
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
  if (!j.task) throw new Error('Invalid response')
  return j.task
}

export async function cancelTask(id: string): Promise<void> {
  const r = await fetch(`/api/tasks/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    headers: JSON_HDR,
    body: JSON.stringify({}),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
}
