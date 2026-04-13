export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'

export type ButtonSize = 'sm' | 'md' | 'lg'

export type Size = 'sm' | 'md' | 'lg'

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

export type PermissionMode = 'default' | 'plan' | 'auto' | 'bypass'

export type ThemeMode = 'dark' | 'light'

export type BackendType = 'in-process' | 'tmux' | 'docker'

export interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  timestamp: string
  read: boolean
}

export interface PriorityColorMap {
  critical: string
  high: string
  medium: string
  low: string
}

export interface StatusColorMap {
  pending: string
  running: string
  completed: string
  failed: string
}

export const PRIORITY_COLORS: PriorityColorMap = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#eab308',
  low: '#10b981',
}

export const STATUS_COLORS: StatusColorMap = {
  pending: '#666666',
  running: '#3b82f6',
  completed: '#10b981',
  failed: '#ef4444',
}

export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  ERROR: '#ef4444',
  WARN: '#f59e0b',
  INFO: '#3b82f6',
  DEBUG: '#666666',
}

export interface LogEntry {
  id: string
  timestamp: string
  level: LogLevel
  source: string
  message: string
  metadata?: Record<string, unknown>
}

export interface MetricsData {
  tasksTotal: number
  tasksPending: number
  tasksRunning: number
  tasksCompleted: number
  tasksFailed: number
  agentsTotal: number
  agentsIdle: number
  agentsBusy: number
  tokensUsed: number
  costTotal: number
  queueLength: number
}
