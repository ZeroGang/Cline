import { describe, it, expect, beforeEach } from 'vitest'
import { MetricsCollector, CostTracker, PerformanceTracker } from '../../src/monitoring/metrics.js'

describe('MetricsCollector', () => {
  let collector: MetricsCollector

  beforeEach(() => {
    collector = new MetricsCollector()
  })

  describe('Counter', () => {
    it('should create and increment counter', () => {
      const counter = collector.createCounter('tasks_total')
      
      counter.inc()
      expect(counter.value).toBe(1)
      
      counter.inc(5)
      expect(counter.value).toBe(6)
    })

    it('should reset counter', () => {
      const counter = collector.createCounter('tasks_total')
      counter.inc(10)
      
      counter.reset()
      
      expect(counter.value).toBe(0)
    })

    it('should support labels', () => {
      const counter1 = collector.createCounter('tasks_total', { status: 'success' })
      const counter2 = collector.createCounter('tasks_total', { status: 'failed' })
      
      counter1.inc(5)
      counter2.inc(2)
      
      expect(collector.getCounter('tasks_total', { status: 'success' })?.value).toBe(5)
      expect(collector.getCounter('tasks_total', { status: 'failed' })?.value).toBe(2)
    })
  })

  describe('Gauge', () => {
    it('should create and set gauge', () => {
      const gauge = collector.createGauge('active_agents')
      
      gauge.set(5)
      expect(gauge.value).toBe(5)
      
      gauge.inc()
      expect(gauge.value).toBe(6)
      
      gauge.dec(2)
      expect(gauge.value).toBe(4)
    })
  })

  describe('Histogram', () => {
    it('should create and observe histogram', () => {
      const histogram = collector.createHistogram('task_duration_seconds')
      
      histogram.observe(0.5)
      histogram.observe(1.5)
      histogram.observe(5.0)
      
      expect(histogram.count).toBe(3)
      expect(histogram.sum).toBe(7.0)
    })

    it('should track bucket counts', () => {
      const histogram = collector.createHistogram('task_duration_seconds', [1, 5, 10])
      
      histogram.observe(0.5)
      histogram.observe(2)
      histogram.observe(7)
      
      expect(histogram.counts.get(1)).toBe(1)
      expect(histogram.counts.get(5)).toBe(2)
      expect(histogram.counts.get(10)).toBe(3)
    })
  })

  describe('convenience methods', () => {
    it('should increment counter via method', () => {
      collector.incCounter('tasks_total', 3)
      
      expect(collector.getCounter('tasks_total')?.value).toBe(3)
    })

    it('should set gauge via method', () => {
      collector.setGauge('active_agents', 5)
      
      expect(collector.getGauge('active_agents')?.value).toBe(5)
    })

    it('should observe histogram via method', () => {
      collector.observeHistogram('task_duration_seconds', 2.5)
      
      expect(collector.getHistogram('task_duration_seconds')?.count).toBe(1)
    })
  })

  describe('exportMetrics', () => {
    it('should export all metrics', () => {
      collector.incCounter('tasks_total', 5)
      collector.setGauge('active_agents', 3)
      collector.observeHistogram('task_duration_seconds', 1.5)
      
      const metrics = collector.exportMetrics()
      
      expect(metrics.some(m => m.name === 'tasks_total' && m.value === 5)).toBe(true)
      expect(metrics.some(m => m.name === 'active_agents' && m.value === 3)).toBe(true)
      expect(metrics.some(m => m.name === 'task_duration_seconds_sum')).toBe(true)
      expect(metrics.some(m => m.name === 'task_duration_seconds_count')).toBe(true)
    })
  })

  describe('reset', () => {
    it('should reset all metrics', () => {
      collector.incCounter('tasks_total', 5)
      collector.observeHistogram('task_duration_seconds', 1.5)
      
      collector.reset()
      
      expect(collector.getCounter('tasks_total')?.value).toBe(0)
      expect(collector.getHistogram('task_duration_seconds')?.count).toBe(0)
    })
  })
})

describe('CostTracker', () => {
  let tracker: CostTracker

  beforeEach(() => {
    tracker = new CostTracker({
      'test-model': { inputCostPerToken: 0.001, outputCostPerToken: 0.002 }
    })
  })

  it('should track usage', () => {
    const cost = tracker.trackUsage('test-model', 100, 50)
    
    expect(cost).toBe(0.2) // 100 * 0.001 + 50 * 0.002
    expect(tracker.getTotalCost()).toBe(0.2)
  })

  it('should track total tokens', () => {
    tracker.trackUsage('test-model', 100, 50)
    
    const tokens = tracker.getTotalTokens()
    expect(tokens.input).toBe(100)
    expect(tokens.output).toBe(50)
  })

  it('should track cost by model', () => {
    tracker.trackUsage('test-model', 100, 50)
    tracker.trackUsage('test-model', 50, 25)
    
    const costByModel = tracker.getCostByModel()
    
    expect(costByModel['test-model'].cost).toBeCloseTo(0.3)
    expect(costByModel['test-model'].inputTokens).toBe(150)
    expect(costByModel['test-model'].outputTokens).toBe(75)
  })

  it('should return recent entries', () => {
    tracker.trackUsage('test-model', 100, 50)
    tracker.trackUsage('test-model', 50, 25)
    
    const entries = tracker.getRecentEntries(1)
    
    expect(entries.length).toBe(1)
    expect(entries[0].inputTokens).toBe(50)
  })

  it('should reset', () => {
    tracker.trackUsage('test-model', 100, 50)
    
    tracker.reset()
    
    expect(tracker.getTotalCost()).toBe(0)
    expect(tracker.getTotalTokens().input).toBe(0)
  })
})

describe('PerformanceTracker', () => {
  let perfTracker: PerformanceTracker

  beforeEach(() => {
    perfTracker = new PerformanceTracker()
  })

  it('should track checkpoint', () => {
    perfTracker.startCheckpoint('task-1')
    
    const active = perfTracker.getActiveCheckpoints()
    expect(active.length).toBe(1)
    expect(active[0].name).toBe('task-1')
  })

  it('should end checkpoint', async () => {
    perfTracker.startCheckpoint('task-1')
    
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const checkpoint = perfTracker.endCheckpoint('task-1')
    
    expect(checkpoint).toBeDefined()
    expect(checkpoint?.duration).toBeGreaterThan(0)
    expect(perfTracker.getActiveCheckpoints().length).toBe(0)
  })

  it('should return undefined for non-existent checkpoint', () => {
    const checkpoint = perfTracker.endCheckpoint('non-existent')
    expect(checkpoint).toBeUndefined()
  })

  it('should get completed checkpoints', async () => {
    perfTracker.startCheckpoint('task-1')
    await new Promise(resolve => setTimeout(resolve, 5))
    perfTracker.endCheckpoint('task-1')
    
    perfTracker.startCheckpoint('task-2')
    await new Promise(resolve => setTimeout(resolve, 5))
    perfTracker.endCheckpoint('task-2')
    
    const completed = perfTracker.getCompletedCheckpoints()
    
    expect(completed.length).toBe(2)
  })

  it('should limit completed checkpoints', async () => {
    for (let i = 0; i < 10; i++) {
      perfTracker.startCheckpoint(`task-${i}`)
      perfTracker.endCheckpoint(`task-${i}`)
    }
    
    const completed = perfTracker.getCompletedCheckpoints(5)
    
    expect(completed.length).toBe(5)
  })

  it('should store metadata', () => {
    perfTracker.startCheckpoint('task-1', { agentId: 'agent-1', taskId: 'task-1' })
    
    const checkpoint = perfTracker.getCheckpoint('task-1')
    
    expect(checkpoint?.metadata).toEqual({ agentId: 'agent-1', taskId: 'task-1' })
  })

  it('should clear all checkpoints', async () => {
    perfTracker.startCheckpoint('task-1')
    perfTracker.endCheckpoint('task-1')
    
    perfTracker.clear()
    
    expect(perfTracker.getActiveCheckpoints().length).toBe(0)
    expect(perfTracker.getCompletedCheckpoints().length).toBe(0)
  })
})
