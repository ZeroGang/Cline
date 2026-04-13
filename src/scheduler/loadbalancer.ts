import type { Task, LoadBalanceStrategy } from './types.js'
import type { AgentId } from '../types.js'

interface AgentInfo {
  id: AgentId
  status: string
  taskCount: number
  lastAssigned?: number
}

export class RoundRobinStrategy implements LoadBalanceStrategy {
  name = 'round-robin'
  private currentIndex = 0

  select(tasks: Task[], agents: AgentInfo[]): Task | null {
    if (tasks.length === 0) {
      return null
    }

    if (agents.length === 0) {
      return null
    }

    const availableAgents = agents.filter(a => a.status === 'idle')
    if (availableAgents.length === 0) {
      return null
    }

    this.currentIndex = (this.currentIndex + 1) % availableAgents.length

    return tasks[0]
  }

  selectAgent(agents: AgentInfo[]): AgentId | null {
    if (agents.length === 0) {
      return null
    }

    const availableAgents = agents.filter(a => a.status === 'idle')
    if (availableAgents.length === 0) {
      return null
    }

    this.currentIndex = (this.currentIndex + 1) % availableAgents.length
    return availableAgents[this.currentIndex].id
  }

  reset(): void {
    this.currentIndex = 0
  }
}

export class LeastLoadedStrategy implements LoadBalanceStrategy {
  name = 'least-loaded'

  select(tasks: Task[], agents: AgentInfo[]): Task | null {
    if (tasks.length === 0) {
      return null
    }

    if (agents.length === 0) {
      return null
    }

    const availableAgents = agents.filter(a => a.status === 'idle')
    if (availableAgents.length === 0) {
      return null
    }

    return tasks[0]
  }

  selectAgent(agents: AgentInfo[]): AgentId | null {
    if (agents.length === 0) {
      return null
    }

    const availableAgents = agents.filter(a => a.status === 'idle')
    if (availableAgents.length === 0) {
      return null
    }

    availableAgents.sort((a, b) => a.taskCount - b.taskCount)

    return availableAgents[0].id
  }
}

export class PriorityBasedStrategy implements LoadBalanceStrategy {
  name = 'priority-based'

  select(tasks: Task[], agents: AgentInfo[]): Task | null {
    if (tasks.length === 0) {
      return null
    }

    if (agents.length === 0) {
      return null
    }

    const availableAgents = agents.filter(a => a.status === 'idle')
    if (availableAgents.length === 0) {
      return null
    }

    const priorityOrder: Record<string, number> = {
      high: 3,
      normal: 2,
      low: 1
    }

    const sortedTasks = [...tasks].sort((a, b) => {
      return priorityOrder[b.priority] - priorityOrder[a.priority]
    })

    return sortedTasks[0]
  }

  selectAgent(agents: AgentInfo[]): AgentId | null {
    if (agents.length === 0) {
      return null
    }

    const availableAgents = agents.filter(a => a.status === 'idle')
    if (availableAgents.length === 0) {
      return null
    }

    return availableAgents[0].id
  }
}

export interface LoadBalancerConfig {
  strategy: 'round-robin' | 'least-loaded' | 'priority-based'
}

const DEFAULT_CONFIG: LoadBalancerConfig = {
  strategy: 'least-loaded'
}

export class LoadBalancer {
  private strategy: LoadBalanceStrategy & { selectAgent?: (agents: AgentInfo[]) => AgentId | null }
  private config: LoadBalancerConfig

  constructor(config: Partial<LoadBalancerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.strategy = this.createStrategy(this.config.strategy)
  }

  private createStrategy(name: string): LoadBalanceStrategy & { selectAgent?: (agents: AgentInfo[]) => AgentId | null } {
    switch (name) {
      case 'round-robin':
        return new RoundRobinStrategy()
      case 'least-loaded':
        return new LeastLoadedStrategy()
      case 'priority-based':
        return new PriorityBasedStrategy()
      default:
        return new LeastLoadedStrategy()
    }
  }

  selectTask(tasks: Task[], agents: AgentInfo[]): Task | null {
    return this.strategy.select(tasks, agents)
  }

  selectAgent(agents: AgentInfo[]): AgentId | null {
    if (this.strategy.selectAgent) {
      return this.strategy.selectAgent(agents)
    }

    if (agents.length === 0) {
      return null
    }

    const availableAgents = agents.filter(a => a.status === 'idle')
    if (availableAgents.length === 0) {
      return null
    }

    return availableAgents[0].id
  }

  assign(tasks: Task[], agents: AgentInfo[]): { task: Task; agent: AgentId } | null {
    const task = this.selectTask(tasks, agents)
    if (!task) {
      return null
    }

    const agent = this.selectAgent(agents)
    if (!agent) {
      return null
    }

    return { task, agent }
  }

  setStrategy(name: 'round-robin' | 'least-loaded' | 'priority-based'): void {
    this.strategy = this.createStrategy(name)
    this.config.strategy = name
  }

  getStrategyName(): string {
    return this.strategy.name
  }
}

export function createLoadBalancer(config?: Partial<LoadBalancerConfig>): LoadBalancer {
  return new LoadBalancer(config)
}
