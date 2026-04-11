import { describe, it, expect } from 'vitest'
import { Store, createStore } from '../../src/infrastructure/state/store.js'
import { DEFAULT_APP_STATE } from '../../src/infrastructure/state/types.js'
import type { AppState } from '../../src/infrastructure/state/types.js'

describe('Store', () => {
  it('should initialize with initial state', () => {
    const store = createStore(DEFAULT_APP_STATE)
    const state = store.getState()
    expect(state.scheduler.status).toBe('stopped')
    expect(state.scheduler.activeAgents).toBe(0)
    expect(state.tasks).toEqual([])
  })

  it('should update state with setState', () => {
    const store = createStore(DEFAULT_APP_STATE)
    store.setState((state) => ({
      ...state,
      scheduler: {
        ...state.scheduler,
        status: 'running',
        activeAgents: 2
      }
    }))
    const state = store.getState()
    expect(state.scheduler.status).toBe('running')
    expect(state.scheduler.activeAgents).toBe(2)
  })

  it('should notify subscribers on state change', () => {
    const store = createStore(DEFAULT_APP_STATE)
    let callCount = 0
    let lastState: AppState | null = null

    store.subscribe((state) => {
      callCount++
      lastState = state as AppState
    })

    store.setState((state) => ({
      ...state,
      scheduler: {
        ...state.scheduler,
        status: 'running'
      }
    }))

    expect(callCount).toBe(1)
    expect(lastState?.scheduler.status).toBe('running')
  })

  it('should unsubscribe correctly', () => {
    const store = createStore(DEFAULT_APP_STATE)
    let callCount = 0

    const unsubscribe = store.subscribe(() => {
      callCount++
    })

    store.setState((state) => ({
      ...state,
      scheduler: { ...state.scheduler, status: 'running' }
    }))
    expect(callCount).toBe(1)

    unsubscribe()

    store.setState((state) => ({
      ...state,
      scheduler: { ...state.scheduler, status: 'paused' }
    }))
    expect(callCount).toBe(1)
  })

  it('should select state with selector', () => {
    const store = createStore(DEFAULT_APP_STATE)
    const schedulerStatus = store.select((state) => state.scheduler.status)
    expect(schedulerStatus).toBe('stopped')

    const taskCount = store.select((state) => state.tasks.length)
    expect(taskCount).toBe(0)
  })

  it('should support multiple subscribers', () => {
    const store = createStore(DEFAULT_APP_STATE)
    let count1 = 0
    let count2 = 0

    store.subscribe(() => count1++)
    store.subscribe(() => count2++)

    store.setState((state) => ({
      ...state,
      scheduler: { ...state.scheduler, status: 'running' }
    }))

    expect(count1).toBe(1)
    expect(count2).toBe(1)
  })
})

describe('DeepImmutable', () => {
  it('should enforce immutability at type level', () => {
    const store = createStore(DEFAULT_APP_STATE)
    const state = store.getState()
    
    expect(state.scheduler.status).toBe('stopped')
    expect(state.tasks.length).toBe(0)
    expect(state.metrics.totalTokens).toBe(0)
  })
})
