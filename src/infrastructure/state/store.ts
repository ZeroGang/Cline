import type { DeepImmutable, Subscriber, Selector, Unsubscribe } from './types.js'

export class Store<T extends object> {
  private state: T
  private subscribers: Set<Subscriber<T>> = new Set()

  constructor(initialState: T) {
    this.state = initialState
  }

  getState(): DeepImmutable<T> {
    return this.state as DeepImmutable<T>
  }

  setState(updater: (state: T) => T): void {
    const newState = updater(this.state)
    this.state = newState
    this.notify()
  }

  subscribe(subscriber: Subscriber<T>): Unsubscribe {
    this.subscribers.add(subscriber)
    return () => {
      this.subscribers.delete(subscriber)
    }
  }

  select<R>(selector: Selector<T, R>): R {
    return selector(this.getState())
  }

  private notify(): void {
    const state = this.getState()
    for (const subscriber of this.subscribers) {
      subscriber(state)
    }
  }
}

export function createStore<T extends object>(initialState: T): Store<T> {
  return new Store(initialState)
}
