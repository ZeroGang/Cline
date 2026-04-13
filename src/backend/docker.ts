import { spawn } from 'child_process'
import { Logger } from '../infrastructure/logging/logger.js'
import type { AgentBackend, AgentSpawnConfig, AgentMessage } from './types.js'
import type { BackendType, AgentEvent } from '../scheduler/types.js'

export interface DockerContainerConfig {
  image: string
  name?: string
  env?: Record<string, string>
  volumes?: Record<string, string>
  ports?: Record<string, string>
  network?: string
  cpuLimit?: number
  memoryLimit?: string
  workdir?: string
  command?: string[]
  autoRemove?: boolean
}

export interface DockerBackendConfig {
  dockerPath?: string
  defaultImage: string
  network?: string
  resourceLimits?: {
    cpu?: number
    memory?: string
  }
}

const DEFAULT_DOCKER_CONFIG: DockerBackendConfig = {
  dockerPath: 'docker',
  defaultImage: 'node:18-alpine'
}

interface ContainerInfo {
  id: string
  agentId: string
  config: DockerContainerConfig
  active: boolean
}

export class DockerBackend implements AgentBackend {
  readonly type: BackendType = 'docker'
  private config: DockerBackendConfig
  private logger: Logger
  private containers: Map<string, ContainerInfo> = new Map()
  private available: boolean = false

  constructor(config: Partial<DockerBackendConfig> = {}) {
    this.config = { ...DEFAULT_DOCKER_CONFIG, ...config }
    this.logger = new Logger({ source: 'DockerBackend' })
  }

  async isAvailable(): Promise<boolean> {
    if (this.available) {
      return true
    }

    try {
      const result = await this.executeDocker(['--version'])
      this.available = result.exitCode === 0
      return this.available
    } catch {
      return false
    }
  }

  async spawn(config: AgentSpawnConfig): Promise<string> {
    const containerName = `agent-${config.agentId}`
    
    if (this.containers.has(config.agentId)) {
      throw new Error(`Agent ${config.agentId} already exists`)
    }

    const containerConfig: DockerContainerConfig = {
      image: this.config.defaultImage,
      name: containerName,
      env: config.env,
      workdir: config.workingDir,
      network: this.config.network,
      cpuLimit: this.config.resourceLimits?.cpu,
      memoryLimit: this.config.resourceLimits?.memory,
      autoRemove: true
    }

    this.logger.info('Spawning agent in Docker container', { 
      agentId: config.agentId,
      image: containerConfig.image 
    })

    const args = this.buildRunArgs(containerConfig)
    
    const result = await this.executeDocker(args)
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to spawn container: ${result.stderr}`)
    }

    const containerId = result.stdout.trim()

    this.containers.set(config.agentId, {
      id: containerId,
      agentId: config.agentId,
      config: containerConfig,
      active: true
    })

    this.logger.info('Agent spawned in Docker container', { 
      agentId: config.agentId, 
      containerId 
    })

    return containerId
  }

  private buildRunArgs(config: DockerContainerConfig): string[] {
    const args: string[] = ['run', '-d']

    if (config.name) {
      args.push('--name', config.name)
    }

    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        args.push('-e', `${key}=${value}`)
      }
    }

    if (config.volumes) {
      for (const [host, container] of Object.entries(config.volumes)) {
        args.push('-v', `${host}:${container}`)
      }
    }

    if (config.ports) {
      for (const [host, container] of Object.entries(config.ports)) {
        args.push('-p', `${host}:${container}`)
      }
    }

    if (config.network) {
      args.push('--network', config.network)
    }

    if (config.cpuLimit) {
      args.push('--cpus', config.cpuLimit.toString())
    }

    if (config.memoryLimit) {
      args.push('--memory', config.memoryLimit)
    }

    if (config.workdir) {
      args.push('-w', config.workdir)
    }

    if (config.autoRemove) {
      args.push('--rm')
    }

    args.push(config.image)

    if (config.command) {
      args.push(...config.command)
    } else {
      args.push('tail', '-f', '/dev/null')
    }

    return args
  }

  async sendMessage(agentId: string, message: AgentMessage): Promise<void> {
    const container = this.containers.get(agentId)
    if (!container) {
      throw new Error(`Agent ${agentId} not found`)
    }

    this.logger.debug('Sending message to agent', { agentId, type: message.type })

    const messageStr = JSON.stringify(message)
    const result = await this.executeDocker([
      'exec',
      container.id,
      'sh', '-c',
      `echo '${messageStr}' >> /tmp/agent-input`
    ])

    if (result.exitCode !== 0) {
      this.logger.error('Failed to send message', { agentId, error: result.stderr })
      throw new Error(`Failed to send message: ${result.stderr}`)
    }
  }

  async terminate(agentId: string, reason?: string): Promise<void> {
    const container = this.containers.get(agentId)
    if (!container) {
      this.logger.warn('Agent not found', { agentId })
      return
    }

    this.logger.info('Terminating agent', { agentId, reason })

    const result = await this.executeDocker(['stop', container.id])

    if (result.exitCode !== 0) {
      this.logger.error('Failed to stop container', { agentId, error: result.stderr })
    }

    container.active = false
    this.containers.delete(agentId)

    this.logger.info('Agent terminated', { agentId })
  }

  async *getOutput(agentId: string): AsyncGenerator<AgentEvent> {
    const container = this.containers.get(agentId)
    if (!container) {
      throw new Error(`Agent ${agentId} not found`)
    }

    while (container.active) {
      const result = await this.executeDocker([
        'exec',
        container.id,
        'sh', '-c',
        'cat /tmp/agent-output 2>/dev/null || echo ""'
      ])

      if (result.exitCode === 0 && result.stdout.trim()) {
        const lines = result.stdout.trim().split('\n')
        for (const line of lines) {
          if (line.trim()) {
            try {
              const event = JSON.parse(line) as AgentEvent
              yield event
            } catch {
              yield {
                type: 'log',
                agentId,
                timestamp: Date.now(),
                data: { message: line }
              } as AgentEvent
            }
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  async isActive(agentId: string): Promise<boolean> {
    const container = this.containers.get(agentId)
    if (!container) {
      return false
    }

    const result = await this.executeDocker([
      'inspect',
      '--format', '{{.State.Running}}',
      container.id
    ])

    return result.exitCode === 0 && result.stdout.trim() === 'true'
  }

  async exec(
    agentId: string,
    command: string[],
    options?: { cwd?: string }
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const container = this.containers.get(agentId)
    if (!container) {
      throw new Error(`Agent ${agentId} not found`)
    }

    const args = ['exec']
    
    if (options?.cwd) {
      args.push('-w', options.cwd)
    }
    
    args.push(container.id, ...command)

    this.logger.debug('Executing command in container', { agentId, command })

    return this.executeDocker(args)
  }

  getContainerId(agentId: string): string | undefined {
    return this.containers.get(agentId)?.id
  }

  getAgentIds(): string[] {
    return Array.from(this.containers.keys())
  }

  private async executeDocker(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn(this.config.dockerPath!, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''

      proc.on('error', (error) => {
        resolve({ exitCode: 1, stdout: '', stderr: error.message })
      })

      proc.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      proc.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        resolve({ exitCode: code ?? 0, stdout, stderr })
      })
    })
  }
}

export function createDockerBackend(config?: Partial<DockerBackendConfig>): DockerBackend {
  return new DockerBackend(config)
}
