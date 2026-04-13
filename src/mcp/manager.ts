import { Logger } from '../infrastructure/logging/logger.js'
import { Tool, ToolRegistry } from '../tools/index.js'

export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface MCPServer {
  name: string
  tools: MCPTool[]
  resources?: Record<string, unknown>[]
  connect(): Promise<void>
  disconnect(): Promise<void>
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>
  isConnected(): boolean
}

export interface MCPServerConfig {
  name: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  timeout?: number
}

export interface MCPManagerConfig {
  maxConnections: number
  connectionTimeout: number
  retryAttempts: number
  retryDelay: number
}

const DEFAULT_CONFIG: MCPManagerConfig = {
  maxConnections: 10,
  connectionTimeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000
}

export class MCPConnectionError extends Error {
  constructor(
    public serverName: string,
    public reason: string
  ) {
    super(`MCP connection failed for ${serverName}: ${reason}`)
    this.name = 'MCPConnectionError'
  }
}

export class MCPManager {
  private config: MCPManagerConfig
  private logger: Logger
  private servers: Map<string, MCPServer> = new Map()
  private connectionStatus: Map<string, 'disconnected' | 'connecting' | 'connected' | 'error'> = new Map()
  private pendingConnections: Map<string, Promise<void>> = new Map()

  constructor(config: Partial<MCPManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.logger = new Logger('MCPManager')
  }

  async connect(name: string, server: MCPServer): Promise<void> {
    if (this.servers.has(name)) {
      this.logger.warn('Server already registered', { name })
      return
    }

    if (this.servers.size >= this.config.maxConnections) {
      throw new MCPConnectionError(name, 'Maximum connections reached')
    }

    const existingPending = this.pendingConnections.get(name)
    if (existingPending) {
      return existingPending
    }

    const connectionPromise = this.doConnect(name, server)
    this.pendingConnections.set(name, connectionPromise)

    try {
      await connectionPromise
    } finally {
      this.pendingConnections.delete(name)
    }
  }

  private async doConnect(name: string, server: MCPServer): Promise<void> {
    this.connectionStatus.set(name, 'connecting')
    this.logger.info('Connecting to MCP server', { name })

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        await this.executeWithTimeout(
          server.connect(),
          this.config.connectionTimeout
        )

        this.servers.set(name, server)
        this.connectionStatus.set(name, 'connected')
        this.logger.info('MCP server connected', { name, tools: server.tools.length })
        return
      } catch (error) {
        lastError = error as Error
        this.logger.warn('Connection attempt failed', { 
          name, 
          attempt, 
          error: lastError.message 
        })

        if (attempt < this.config.retryAttempts) {
          await this.delay(this.config.retryDelay * attempt)
        }
      }
    }

    this.connectionStatus.set(name, 'error')
    throw new MCPConnectionError(name, lastError?.message || 'Unknown error')
  }

  async disconnect(name: string): Promise<void> {
    const server = this.servers.get(name)
    if (!server) {
      this.logger.warn('Server not found', { name })
      return
    }

    try {
      await server.disconnect()
      this.servers.delete(name)
      this.connectionStatus.set(name, 'disconnected')
      this.logger.info('MCP server disconnected', { name })
    } catch (error) {
      this.logger.error('Error disconnecting server', { name, error })
      this.servers.delete(name)
      this.connectionStatus.set(name, 'error')
    }
  }

  async disconnectAll(): Promise<void> {
    const names = Array.from(this.servers.keys())
    await Promise.all(names.map(name => this.disconnect(name)))
    this.logger.info('All MCP servers disconnected')
  }

  getServer(name: string): MCPServer | undefined {
    return this.servers.get(name)
  }

  getAllServers(): MCPServer[] {
    return Array.from(this.servers.values())
  }

  getConnectionStatus(name: string): string | undefined {
    return this.connectionStatus.get(name)
  }

  getAllConnectionStatuses(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [name, status] of this.connectionStatus) {
      result[name] = status
    }
    return result
  }

  async callTool(
    serverName: string, 
    toolName: string, 
    args: Record<string, unknown>
  ): Promise<unknown> {
    const server = this.servers.get(serverName)
    if (!server) {
      throw new Error(`Server ${serverName} not found`)
    }

    if (!server.isConnected()) {
      throw new Error(`Server ${serverName} is not connected`)
    }

    return server.callTool(toolName, args)
  }

  private executeWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Connection timeout'))
      }, timeout)

      promise
        .then(result => {
          clearTimeout(timer)
          resolve(result)
        })
        .catch(error => {
          clearTimeout(timer)
          reject(error)
        })
    })
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export function loadMCPTools(
  server: MCPServer,
  registry: ToolRegistry
): void {
  for (const mcpTool of server.tools) {
    const tool: Tool = {
      name: `mcp_${server.name}_${mcpTool.name}`,
      description: mcpTool.description,
      inputSchema: mcpTool.inputSchema,
      execute: async (args: Record<string, unknown>) => {
        return server.callTool(mcpTool.name, args)
      }
    }

    registry.register(tool)
  }
}

export async function waitForMcpServers(
  manager: MCPManager,
  serverNames: string[],
  timeout: number = 60000
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const allConnected = serverNames.every(name => {
      const status = manager.getConnectionStatus(name)
      return status === 'connected'
    })

    if (allConnected) {
      return
    }

    await new Promise(resolve => setTimeout(resolve, 100))
  }

  const notConnected = serverNames.filter(name => {
    const status = manager.getConnectionStatus(name)
    return status !== 'connected'
  })

  throw new Error(`Timeout waiting for MCP servers: ${notConnected.join(', ')}`)
}

export function createMCPManager(config?: Partial<MCPManagerConfig>): MCPManager {
  return new MCPManager(config)
}
