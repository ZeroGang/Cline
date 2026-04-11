import { describe, it, expect, beforeEach } from 'vitest'
import { Logger, LogStore, LogAggregator, createLogger } from '../../src/infrastructure/logging/logger.js'
import type { LogEntry } from '../../src/infrastructure/logging/types.js'

describe('Logger', () => {
  let logStore: LogStore
  let logger: Logger

  beforeEach(() => {
    logStore = new LogStore()
    logger = createLogger('test', logStore)
  })

  it('should log debug messages', () => {
    logger.debug('debug message')
    const entries = logStore.getAll()
    expect(entries.length).toBe(1)
    expect(entries[0]?.level).toBe('debug')
    expect(entries[0]?.message).toBe('debug message')
    expect(entries[0]?.source).toBe('test')
  })

  it('should log info messages', () => {
    logger.info('info message')
    const entries = logStore.getAll()
    expect(entries.length).toBe(1)
    expect(entries[0]?.level).toBe('info')
  })

  it('should log warn messages', () => {
    logger.warn('warn message')
    const entries = logStore.getAll()
    expect(entries.length).toBe(1)
    expect(entries[0]?.level).toBe('warn')
  })

  it('should log error messages', () => {
    logger.error('error message')
    const entries = logStore.getAll()
    expect(entries.length).toBe(1)
    expect(entries[0]?.level).toBe('error')
  })

  it('should log with additional data', () => {
    logger.info('message with data', { key: 'value', count: 42 })
    const entries = logStore.getAll()
    expect(entries[0]?.data).toEqual({ key: 'value', count: 42 })
  })

  it('should work without LogStore', () => {
    const loggerWithoutStore = createLogger('no-store')
    expect(() => loggerWithoutStore.info('test')).not.toThrow()
  })
})

describe('LogStore', () => {
  let logStore: LogStore

  beforeEach(() => {
    logStore = new LogStore(5)
  })

  it('should add entries', () => {
    logStore.add({ level: 'info', message: 'test', source: 'test', timestamp: 1 })
    expect(logStore.size()).toBe(1)
  })

  it('should limit max size', () => {
    for (let i = 0; i < 10; i++) {
      logStore.add({ level: 'info', message: `msg${i}`, source: 'test', timestamp: i })
    }
    expect(logStore.size()).toBe(5)
    const entries = logStore.getAll()
    expect(entries[0]?.message).toBe('msg5')
    expect(entries[4]?.message).toBe('msg9')
  })

  it('should query by level', () => {
    logStore.add({ level: 'info', message: 'info1', source: 'test', timestamp: 1 })
    logStore.add({ level: 'error', message: 'error1', source: 'test', timestamp: 2 })
    logStore.add({ level: 'info', message: 'info2', source: 'test', timestamp: 3 })

    const infoEntries = logStore.query({ level: 'info' })
    expect(infoEntries.length).toBe(2)
  })

  it('should query by source', () => {
    logStore.add({ level: 'info', message: 'msg1', source: 'source1', timestamp: 1 })
    logStore.add({ level: 'info', message: 'msg2', source: 'source2', timestamp: 2 })

    const entries = logStore.query({ source: 'source1' })
    expect(entries.length).toBe(1)
    expect(entries[0]?.source).toBe('source1')
  })

  it('should query by time range', () => {
    logStore.add({ level: 'info', message: 'msg1', source: 'test', timestamp: 100 })
    logStore.add({ level: 'info', message: 'msg2', source: 'test', timestamp: 200 })
    logStore.add({ level: 'info', message: 'msg3', source: 'test', timestamp: 300 })

    const entries = logStore.query({ startTime: 150, endTime: 250 })
    expect(entries.length).toBe(1)
    expect(entries[0]?.timestamp).toBe(200)
  })

  it('should limit results', () => {
    for (let i = 0; i < 5; i++) {
      logStore.add({ level: 'info', message: `msg${i}`, source: 'test', timestamp: i })
    }
    const entries = logStore.query({ limit: 2 })
    expect(entries.length).toBe(2)
  })

  it('should clear all entries', () => {
    logStore.add({ level: 'info', message: 'test', source: 'test', timestamp: 1 })
    logStore.clear()
    expect(logStore.size()).toBe(0)
  })
})

describe('LogAggregator', () => {
  let logStore: LogStore
  let aggregator: LogAggregator

  beforeEach(() => {
    logStore = new LogStore()
    aggregator = new LogAggregator(logStore)
  })

  it('should get entries by level', () => {
    logStore.add({ level: 'info', message: 'info1', source: 'test', timestamp: 1 })
    logStore.add({ level: 'error', message: 'error1', source: 'test', timestamp: 2 })

    const infoEntries = aggregator.getByLevel('info')
    expect(infoEntries.length).toBe(1)
  })

  it('should get entries by source', () => {
    logStore.add({ level: 'info', message: 'msg1', source: 'source1', timestamp: 1 })
    logStore.add({ level: 'info', message: 'msg2', source: 'source2', timestamp: 2 })

    const entries = aggregator.getBySource('source1')
    expect(entries.length).toBe(1)
  })

  it('should get entries by time range', () => {
    logStore.add({ level: 'info', message: 'msg1', source: 'test', timestamp: 100 })
    logStore.add({ level: 'info', message: 'msg2', source: 'test', timestamp: 200 })

    const entries = aggregator.getByTimeRange(50, 150)
    expect(entries.length).toBe(1)
  })

  it('should get recent entries', () => {
    for (let i = 0; i < 5; i++) {
      logStore.add({ level: 'info', message: `msg${i}`, source: 'test', timestamp: i })
    }
    const entries = aggregator.getRecent(3)
    expect(entries.length).toBe(3)
  })

  it('should count by level', () => {
    logStore.add({ level: 'info', message: 'msg1', source: 'test', timestamp: 1 })
    logStore.add({ level: 'info', message: 'msg2', source: 'test', timestamp: 2 })
    logStore.add({ level: 'error', message: 'msg3', source: 'test', timestamp: 3 })

    const counts = aggregator.countByLevel()
    expect(counts.info).toBe(2)
    expect(counts.error).toBe(1)
    expect(counts.debug).toBe(0)
    expect(counts.warn).toBe(0)
  })

  it('should count by source', () => {
    logStore.add({ level: 'info', message: 'msg1', source: 'source1', timestamp: 1 })
    logStore.add({ level: 'info', message: 'msg2', source: 'source1', timestamp: 2 })
    logStore.add({ level: 'info', message: 'msg3', source: 'source2', timestamp: 3 })

    const counts = aggregator.countBySource()
    expect(counts['source1']).toBe(2)
    expect(counts['source2']).toBe(1)
  })
})
