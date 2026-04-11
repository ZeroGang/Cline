import type { LogLevel } from '../../types.js'

export interface LogEntry {
  level: LogLevel
  message: string
  source: string
  timestamp: number
  data?: Record<string, unknown>
}

export interface LogQuery {
  level?: LogLevel
  source?: string
  startTime?: number
  endTime?: number
  limit?: number
}
