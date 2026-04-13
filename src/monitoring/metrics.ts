import { Logger } from '../infrastructure/logging/logger.js'

export interface MetricValue {
  name: string
  value: number
  timestamp: Date
  labels?: Record<string, string>
}

export interface Counter {
  name: string
  value: number
  labels: Record<string, string>
  inc(delta?: number): void
  reset(): void
}

export interface Gauge {
  name: string
  value: number
  labels: Record<string, string>
  set(value: number): void
  inc(delta?: number): void
  dec(delta?: number): void
}

export interface Histogram {
  name: string
  buckets: number[]
  counts: Map<number, number>
  sum: number
  count: number
  labels: Record<string, string>
  observe(value: number): void
  reset(): void
}

export interface Metrics {
  counters: Map<string, Counter>
  gauges: Map<string, Gauge>
  histograms: Map<string, Histogram>
}

class CounterImpl implements Counter {
  name: string
  value: number = 0
  labels: Record<string, string>

  constructor(name: string, labels: Record<string, string> = {}) {
    this.name = name
    this.labels = labels
  }

  inc(delta: number = 1): void {
    this.value += delta
  }

  reset(): void {
    this.value = 0
  }
}

class GaugeImpl implements Gauge {
  name: string
  value: number = 0
  labels: Record<string, string>

  constructor(name: string, labels: Record<string, string> = {}) {
    this.name = name
    this.labels = labels
  }

  set(value: number): void {
    this.value = value
  }

  inc(delta: number = 1): void {
    this.value += delta
  }

  dec(delta: number = 1): void {
    this.value -= delta
  }
}

class HistogramImpl implements Histogram {
  name: string
  buckets: number[]
  counts: Map<number, number>
  sum: number = 0
  count: number = 0
  labels: Record<string, string>

  constructor(name: string, buckets: number[] = [0.1, 0.5, 1, 5, 10, 30, 60, 120], labels: Record<string, string> = {}) {
    this.name = name
    this.buckets = [...buckets].sort((a, b) => a - b)
    this.labels = labels
    this.counts = new Map()
    for (const bucket of this.buckets) {
      this.counts.set(bucket, 0)
    }
  }

  observe(value: number): void {
    this.sum += value
    this.count++

    for (const bucket of this.buckets) {
      if (value <= bucket) {
        this.counts.set(bucket, (this.counts.get(bucket) || 0) + 1)
      }
    }
  }

  reset(): void {
    this.sum = 0
    this.count = 0
    for (const bucket of this.buckets) {
      this.counts.set(bucket, 0)
    }
  }
}

export class MetricsCollector {
  private logger: Logger
  private counters: Map<string, Counter> = new Map()
  private gauges: Map<string, Gauge> = new Map()
  private histograms: Map<string, Histogram> = new Map()

  constructor() {
    this.logger = new Logger({ source: 'MetricsCollector' })
  }

  createCounter(name: string, labels?: Record<string, string>): Counter {
    const key = this.getMetricKey(name, labels)
    if (!this.counters.has(key)) {
      this.counters.set(key, new CounterImpl(name, labels))
    }
    return this.counters.get(key)!
  }

  createGauge(name: string, labels?: Record<string, string>): Gauge {
    const key = this.getMetricKey(name, labels)
    if (!this.gauges.has(key)) {
      this.gauges.set(key, new GaugeImpl(name, labels))
    }
    return this.gauges.get(key)!
  }

  createHistogram(name: string, buckets?: number[], labels?: Record<string, string>): Histogram {
    const key = this.getMetricKey(name, labels)
    if (!this.histograms.has(key)) {
      this.histograms.set(key, new HistogramImpl(name, buckets, labels))
    }
    return this.histograms.get(key)!
  }

  incCounter(name: string, delta: number = 1, labels?: Record<string, string>): void {
    this.createCounter(name, labels).inc(delta)
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    this.createGauge(name, labels).set(value)
  }

  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    this.createHistogram(name, undefined, labels).observe(value)
  }

  getCounter(name: string, labels?: Record<string, string>): Counter | undefined {
    return this.counters.get(this.getMetricKey(name, labels))
  }

  getGauge(name: string, labels?: Record<string, string>): Gauge | undefined {
    return this.gauges.get(this.getMetricKey(name, labels))
  }

  getHistogram(name: string, labels?: Record<string, string>): Histogram | undefined {
    return this.histograms.get(this.getMetricKey(name, labels))
  }

  getAllMetrics(): Metrics {
    return {
      counters: new Map(this.counters),
      gauges: new Map(this.gauges),
      histograms: new Map(this.histograms)
    }
  }

  exportMetrics(): MetricValue[] {
    const values: MetricValue[] = []
    const timestamp = new Date()

    for (const [_key, counter] of this.counters) {
      values.push({
        name: counter.name,
        value: counter.value,
        timestamp,
        labels: counter.labels
      })
    }

    for (const [_key, gauge] of this.gauges) {
      values.push({
        name: gauge.name,
        value: gauge.value,
        timestamp,
        labels: gauge.labels
      })
    }

    for (const [_key, histogram] of this.histograms) {
      values.push({
        name: `${histogram.name}_sum`,
        value: histogram.sum,
        timestamp,
        labels: histogram.labels
      })
      values.push({
        name: `${histogram.name}_count`,
        value: histogram.count,
        timestamp,
        labels: histogram.labels
      })
    }

    return values
  }

  reset(): void {
    for (const counter of this.counters.values()) {
      counter.reset()
    }
    for (const histogram of this.histograms.values()) {
      histogram.reset()
    }
    this.logger.info('All metrics reset')
  }

  private getMetricKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',')
    return `${name}{${labelStr}}`
  }
}

export interface CostEntry {
  model: string
  inputTokens: number
  outputTokens: number
  cost: number
  timestamp: Date
}

export interface ModelPricing {
  inputCostPerToken: number
  outputCostPerToken: number
}

const DEFAULT_PRICING: Record<string, ModelPricing> = {
  'claude-3-opus': { inputCostPerToken: 0.000015, outputCostPerToken: 0.000075 },
  'claude-3-sonnet': { inputCostPerToken: 0.000003, outputCostPerToken: 0.000015 },
  'claude-3-haiku': { inputCostPerToken: 0.00000025, outputCostPerToken: 0.00000125 },
  'claude-3-5-sonnet': { inputCostPerToken: 0.000003, outputCostPerToken: 0.000015 }
}

export class CostTracker {
  private logger: Logger
  private entries: CostEntry[] = []
  private pricing: Record<string, ModelPricing>
  private totalCost: number = 0
  private totalInputTokens: number = 0
  private totalOutputTokens: number = 0

  constructor(pricing?: Record<string, ModelPricing>) {
    this.logger = new Logger({ source: 'CostTracker' })
    this.pricing = pricing || DEFAULT_PRICING
  }

  trackUsage(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = this.pricing[model] || { inputCostPerToken: 0, outputCostPerToken: 0 }
    
    const cost = (inputTokens * pricing.inputCostPerToken) + (outputTokens * pricing.outputCostPerToken)
    
    const entry: CostEntry = {
      model,
      inputTokens,
      outputTokens,
      cost,
      timestamp: new Date()
    }

    this.entries.push(entry)
    this.totalCost += cost
    this.totalInputTokens += inputTokens
    this.totalOutputTokens += outputTokens

    this.logger.debug('Usage tracked', { model, inputTokens, outputTokens, cost })

    return cost
  }

  getTotalCost(): number {
    return this.totalCost
  }

  getTotalTokens(): { input: number; output: number } {
    return {
      input: this.totalInputTokens,
      output: this.totalOutputTokens
    }
  }

  getCostByModel(): Record<string, { cost: number; inputTokens: number; outputTokens: number }> {
    const result: Record<string, { cost: number; inputTokens: number; outputTokens: number }> = {}

    for (const entry of this.entries) {
      if (!result[entry.model]) {
        result[entry.model] = { cost: 0, inputTokens: 0, outputTokens: 0 }
      }
      const modelStats = result[entry.model]!
      modelStats.cost += entry.cost
      modelStats.inputTokens += entry.inputTokens
      modelStats.outputTokens += entry.outputTokens
    }

    return result
  }

  getRecentEntries(limit: number = 100): CostEntry[] {
    return this.entries.slice(-limit)
  }

  reset(): void {
    this.entries = []
    this.totalCost = 0
    this.totalInputTokens = 0
    this.totalOutputTokens = 0
    this.logger.info('Cost tracker reset')
  }
}

export interface PerformanceCheckpoint {
  name: string
  startTime: number
  endTime?: number
  duration?: number
  metadata?: Record<string, unknown>
}

export class PerformanceTracker {
  private logger: Logger
  private checkpoints: Map<string, PerformanceCheckpoint> = new Map()
  private completedCheckpoints: PerformanceCheckpoint[] = []

  constructor() {
    this.logger = new Logger({ source: 'PerformanceTracker' })
  }

  startCheckpoint(name: string, metadata?: Record<string, unknown>): void {
    this.checkpoints.set(name, {
      name,
      startTime: Date.now(),
      metadata
    })
  }

  endCheckpoint(name: string): PerformanceCheckpoint | undefined {
    const checkpoint = this.checkpoints.get(name)
    if (!checkpoint) {
      this.logger.warn('Checkpoint not found', { name })
      return undefined
    }

    checkpoint.endTime = Date.now()
    checkpoint.duration = checkpoint.endTime - checkpoint.startTime

    this.checkpoints.delete(name)
    this.completedCheckpoints.push(checkpoint)

    return checkpoint
  }

  getCheckpoint(name: string): PerformanceCheckpoint | undefined {
    return this.checkpoints.get(name) || 
           this.completedCheckpoints.find(c => c.name === name)
  }

  getActiveCheckpoints(): PerformanceCheckpoint[] {
    return Array.from(this.checkpoints.values())
  }

  getCompletedCheckpoints(limit?: number): PerformanceCheckpoint[] {
    const checkpoints = this.completedCheckpoints.slice(-(limit || 100))
    return checkpoints.map(c => ({ ...c }))
  }

  clear(): void {
    this.checkpoints.clear()
    this.completedCheckpoints = []
    this.logger.info('Performance checkpoints cleared')
  }
}

export const metricsCollector = new MetricsCollector()
export const costTracker = new CostTracker()
export const performanceTracker = new PerformanceTracker()
