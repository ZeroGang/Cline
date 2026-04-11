import type { LogLevel } from '../../types.js'
import type { LogEntry, LogQuery } from './types.js'

export interface LoggerOptions {
  source: string
  logStore?: LogStore
}

export class Logger {
  private source: string
  private logStore?: LogStore

  constructor(options: LoggerOptions) {
    this.source = options.source
    this.logStore = options.logStore
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data)
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data)
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data)
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data)
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      message,
      source: this.source,
      timestamp: Date.now(),
      data
    }

    if (this.logStore) {
      this.logStore.add(entry)
    }

    this.output(entry)
  }

  private output(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString()
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.source}]`
    const output = entry.data 
      ? `${prefix} ${entry.message} ${JSON.stringify(entry.data)}`
      : `${prefix} ${entry.message}`

    switch (entry.level) {
      case 'error':
        console.error(output)
        break
      case 'warn':
        console.warn(output)
        break
      default:
        console.log(output)
    }
  }
}

export class LogStore {
  private entries: LogEntry[] = []
  private maxSize: number

  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize
  }

  add(entry: LogEntry): void {
    this.entries.push(entry)
    if (this.entries.length > this.maxSize) {
      this.entries.shift()
    }
  }

  getAll(): LogEntry[] {
    return [...this.entries]
  }

  query(query: LogQuery): LogEntry[] {
    let results = this.entries

    if (query.level) {
      results = results.filter(e => e.level === query.level)
    }

    if (query.source) {
      results = results.filter(e => e.source === query.source)
    }

    if (query.startTime !== undefined) {
      results = results.filter(e => e.timestamp >= query.startTime!)
    }

    if (query.endTime !== undefined) {
      results = results.filter(e => e.timestamp <= query.endTime!)
    }

    if (query.limit !== undefined && query.limit > 0) {
      results = results.slice(-query.limit)
    }

    return results
  }

  clear(): void {
    this.entries = []
  }

  size(): number {
    return this.entries.length
  }
}

export class LogAggregator {
  private logStore: LogStore

  constructor(logStore: LogStore) {
    this.logStore = logStore
  }

  getByLevel(level: LogLevel): LogEntry[] {
    return this.logStore.query({ level })
  }

  getBySource(source: string): LogEntry[] {
    return this.logStore.query({ source })
  }

  getByTimeRange(startTime: number, endTime: number): LogEntry[] {
    return this.logStore.query({ startTime, endTime })
  }

  getRecent(limit: number): LogEntry[] {
    return this.logStore.query({ limit })
  }

  countByLevel(): Record<LogLevel, number> {
    const counts: Record<LogLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0
    }

    for (const entry of this.logStore.getAll()) {
      counts[entry.level]++
    }

    return counts
  }

  countBySource(): Record<string, number> {
    const counts: Record<string, number> = {}

    for (const entry of this.logStore.getAll()) {
      counts[entry.source] = (counts[entry.source] || 0) + 1
    }

    return counts
  }
}

export function createLogger(source: string, logStore?: LogStore): Logger {
  return new Logger({ source, logStore })
}
