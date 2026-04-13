import { Logger } from '../infrastructure/logging/logger.js'
import { Tool, ToolRegistry } from '../tools/index.js'
import { LoadBalancer, type LoadBalancingStrategy } from '../scheduler/loadbalancer.js'
import { MetricsCollector, MetricValue } from '../monitoring/metrics.js'

export interface PluginCommand {
  name: string
  description: string
  execute: (args: string[]) => Promise<void>
}

export interface PluginExporter {
  name: string
  collect(): MetricValue[]
}

export interface Plugin {
  name: string
  version: string
  description?: string
  tools?: Tool[]
  commands?: PluginCommand[]
  strategies?: LoadBalancingStrategy[]
  exporters?: PluginExporter[]
  onLoad?(): Promise<void>
  onUnload?(): Promise<void>
}

export interface PluginManagerConfig {
  maxPlugins: number
  autoRegisterTools: boolean
  autoRegisterStrategies: boolean
  autoRegisterExporters: boolean
}

const DEFAULT_CONFIG: PluginManagerConfig = {
  maxPlugins: 50,
  autoRegisterTools: true,
  autoRegisterStrategies: true,
  autoRegisterExporters: true
}

export class PluginManager {
  private config: PluginManagerConfig
  private logger: Logger
  private plugins: Map<string, Plugin> = new Map()
  private toolRegistry?: ToolRegistry
  private loadBalancer?: LoadBalancer
  private metricsCollector?: MetricsCollector

  constructor(
    config: Partial<PluginManagerConfig> = {},
    dependencies?: {
      toolRegistry?: ToolRegistry
      loadBalancer?: LoadBalancer
      metricsCollector?: MetricsCollector
    }
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.logger = new Logger('PluginManager')
    
    if (dependencies) {
      this.toolRegistry = dependencies.toolRegistry
      this.loadBalancer = dependencies.loadBalancer
      this.metricsCollector = dependencies.metricsCollector
    }
  }

  setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry
  }

  setLoadBalancer(balancer: LoadBalancer): void {
    this.loadBalancer = balancer
  }

  setMetricsCollector(collector: MetricsCollector): void {
    this.metricsCollector = collector
  }

  async load(plugin: Plugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      this.logger.warn('Plugin already loaded', { name: plugin.name })
      return
    }

    if (this.plugins.size >= this.config.maxPlugins) {
      throw new Error(`Maximum plugins (${this.config.maxPlugins}) reached`)
    }

    this.logger.info('Loading plugin', { name: plugin.name, version: plugin.version })

    try {
      if (plugin.onLoad) {
        await plugin.onLoad()
      }

      if (this.config.autoRegisterTools && plugin.tools && this.toolRegistry) {
        for (const tool of plugin.tools) {
          this.toolRegistry.register(tool)
          this.logger.debug('Tool registered', { plugin: plugin.name, tool: tool.name })
        }
      }

      if (this.config.autoRegisterStrategies && plugin.strategies && this.loadBalancer) {
        for (const strategy of plugin.strategies) {
          this.loadBalancer.registerStrategy(strategy)
          this.logger.debug('Strategy registered', { plugin: plugin.name, strategy: strategy.name })
        }
      }

      if (this.config.autoRegisterExporters && plugin.exporters && this.metricsCollector) {
        for (const exporter of plugin.exporters) {
          const metrics = exporter.collect()
          for (const metric of metrics) {
            if (metric.name.includes('_total') || metric.name.includes('_count')) {
              this.metricsCollector.incCounter(metric.name, metric.value, metric.labels)
            } else {
              this.metricsCollector.setGauge(metric.name, metric.value, metric.labels)
            }
          }
          this.logger.debug('Exporter registered', { plugin: plugin.name, exporter: exporter.name })
        }
      }

      this.plugins.set(plugin.name, plugin)
      this.logger.info('Plugin loaded', { name: plugin.name })
    } catch (error) {
      this.logger.error('Failed to load plugin', { name: plugin.name, error })
      throw error
    }
  }

  async unload(name: string): Promise<void> {
    const plugin = this.plugins.get(name)
    if (!plugin) {
      this.logger.warn('Plugin not found', { name })
      return
    }

    this.logger.info('Unloading plugin', { name })

    try {
      if (plugin.onUnload) {
        await plugin.onUnload()
      }

      if (this.config.autoRegisterTools && plugin.tools && this.toolRegistry) {
        for (const tool of plugin.tools) {
          this.toolRegistry.unregister(tool.name)
        }
      }

      if (this.config.autoRegisterStrategies && plugin.strategies && this.loadBalancer) {
        for (const strategy of plugin.strategies) {
          this.loadBalancer.unregisterStrategy(strategy.name)
        }
      }

      this.plugins.delete(name)
      this.logger.info('Plugin unloaded', { name })
    } catch (error) {
      this.logger.error('Failed to unload plugin', { name, error })
      throw error
    }
  }

  async unloadAll(): Promise<void> {
    const names = Array.from(this.plugins.keys())
    await Promise.all(names.map(name => this.unload(name)))
    this.logger.info('All plugins unloaded')
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name)
  }

  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values())
  }

  getPluginNames(): string[] {
    return Array.from(this.plugins.keys())
  }

  hasPlugin(name: string): boolean {
    return this.plugins.has(name)
  }

  getPluginCount(): number {
    return this.plugins.size
  }

  executeCommand(pluginName: string, commandName: string, args: string[]): Promise<void> {
    const plugin = this.plugins.get(pluginName)
    if (!plugin) {
      throw new Error(`Plugin ${pluginName} not found`)
    }

    const command = plugin.commands?.find(c => c.name === commandName)
    if (!command) {
      throw new Error(`Command ${commandName} not found in plugin ${pluginName}`)
    }

    return command.execute(args)
  }

  getCommands(pluginName: string): PluginCommand[] {
    const plugin = this.plugins.get(pluginName)
    return plugin?.commands || []
  }

  getAllCommands(): Map<string, PluginCommand[]> {
    const result = new Map<string, PluginCommand[]>()
    for (const [name, plugin] of this.plugins) {
      if (plugin.commands && plugin.commands.length > 0) {
        result.set(name, plugin.commands)
      }
    }
    return result
  }
}

export function createPluginManager(
  config?: Partial<PluginManagerConfig>,
  dependencies?: {
    toolRegistry?: ToolRegistry
    loadBalancer?: LoadBalancer
    metricsCollector?: MetricsCollector
  }
): PluginManager {
  return new PluginManager(config, dependencies)
}
