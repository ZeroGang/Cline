export interface Counter {
  name: string
  help: string
  inc(labels?: Record<string, string>): void
  get(labels?: Record<string, string>): number
}

export interface Gauge {
  name: string
  help: string
  set(value: number, labels?: Record<string, string>): void
  inc(labels?: Record<string, string>): void
  dec(labels?: Record<string, string>): void
  get(labels?: Record<string, string>): number
}

export interface Histogram {
  name: string
  help: string
  observe(value: number, labels?: Record<string, string>): void
  get(labels?: Record<string, string>): { count: number; sum: number; buckets: Map<number, number> }
}

export interface Metrics {
  tasks: {
    submitted: Counter
    completed: Counter
    failed: Counter
    duration: Histogram
  }
  agents: {
    active: Gauge
    idle: Gauge
    totalTokens: Counter
    cost: Counter
  }
  queue: {
    pending: Gauge
    waiting: Gauge
    size: Gauge
  }
}

export interface TelemetryEvent {
  type: string
  timestamp: number
  data: Record<string, unknown>
}
