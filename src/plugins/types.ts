import type { Tool } from '../tools/types.js'
import type { LoadBalanceStrategy } from '../scheduler/types.js'

export interface Plugin {
  name: string
  version: string
  onLoad?: () => Promise<void>
  onUnload?: () => Promise<void>
  tools?: Tool[]
  commands?: Array<{ name: string; description: string; execute: (args: unknown) => Promise<void> }>
  strategies?: LoadBalanceStrategy[]
  exporters?: Array<{ name: string; export: (metrics: unknown) => Promise<void> }>
}
