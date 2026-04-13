import type { ApiTask } from './api'

export type BoardColumn = 'backlog' | 'progress' | 'input' | 'done'

export interface BoardTask {
  id: string
  raw: ApiTask
  column: BoardColumn
  title: string
  status: string
  run: string
  project: string
  path: string
  price: string
  agent: string
  assignAgent: string
  subLabel: string
  logLine: string
  created: string
  updated: string
}

const AGENT_LABEL: Record<string, string> = {
  '': '—',
  ama: '阿玛',
  review: '审稿机',
  plan: '策划脑',
}

const STATUS_ZH: Record<string, string> = {
  pending: '待命中',
  waiting: '等待反馈',
  running: '运行中',
  completed: '已交付',
  failed: '失败',
  cancelled: '已取消',
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function statusToColumn(status: string): BoardColumn {
  if (status === 'waiting') return 'input'
  if (status === 'running') return 'progress'
  if (status === 'completed' || status === 'failed' || status === 'cancelled') return 'done'
  return 'backlog'
}

export function taskToBoard(t: ApiTask): BoardTask {
  const md = t.metadata ?? {}
  const assignKey = typeof md.assignAgent === 'string' ? md.assignAgent : ''
  const subLabel = typeof md.subLabel === 'string' ? md.subLabel : ''
  const logFromMd = typeof md.logLine === 'string' ? md.logLine : ''
  const logLine = t.error || logFromMd

  return {
    id: t.id,
    raw: t,
    column: statusToColumn(t.status),
    title: t.prompt?.trim() ? (t.prompt.length > 200 ? `${t.prompt.slice(0, 200)}…` : t.prompt) : '—',
    status: STATUS_ZH[t.status] ?? t.status,
    run: t.status,
    project: typeof md.project === 'string' && md.project ? md.project : '—',
    path: typeof md.path === 'string' && md.path ? md.path : '—',
    price: typeof md.price === 'string' && md.price ? md.price : '—',
    agent: assignKey ? AGENT_LABEL[assignKey] ?? assignKey : '—',
    assignAgent: assignKey,
    subLabel,
    logLine,
    created: fmtTime(t.createdAt),
    updated: fmtTime(t.updatedAt ?? t.completedAt ?? t.startedAt ?? t.createdAt),
  }
}

export function badgeClassesForTask(task: BoardTask): string {
  const col = task.column
  if (col === 'done') return 'badge badge-success'
  if (col === 'progress') return 'badge badge-success'
  if (col === 'input') return 'badge office-badge-warn'
  return 'badge office-badge-soft'
}
