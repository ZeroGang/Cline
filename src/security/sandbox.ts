import type { PermissionMode } from '../types.js'
import { Logger } from '../infrastructure/logging/logger.js'

export interface SandboxConfig {
  enabled: boolean
  readOnlyPaths: string[]
  writePaths: string[]
  deniedPaths: string[]
  allowedHosts: string[]
  deniedHosts: string[]
  allowNetwork: boolean
  allowFileSystem: boolean
  allowProcessExecution: boolean
  maxFileSize: number
  maxExecutionTime: number
}

export interface SandboxCheckResult {
  allowed: boolean
  reason: string
  resource?: string
}

const DEFAULT_CONFIG: SandboxConfig = {
  enabled: true,
  readOnlyPaths: [],
  writePaths: [],
  deniedPaths: [
    '/etc/passwd',
    '/etc/shadow',
    '/etc/sudoers',
    '/root',
    '~/.ssh',
    '~/.gnupg'
  ],
  allowedHosts: [],
  deniedHosts: [],
  allowNetwork: true,
  allowFileSystem: true,
  allowProcessExecution: true,
  maxFileSize: 10 * 1024 * 1024,
  maxExecutionTime: 300000
}

export class Sandbox {
  private config: SandboxConfig
  private logger: Logger

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.logger = new Logger('Sandbox')
  }

  canRead(path: string): SandboxCheckResult {
    if (!this.config.enabled) {
      return { allowed: true, reason: 'Sandbox disabled' }
    }

    if (!this.config.allowFileSystem) {
      return { allowed: false, reason: 'File system access disabled', resource: path }
    }

    for (const denied of this.config.deniedPaths) {
      if (this.pathMatches(path, denied)) {
        this.logger.warn('Read access denied', { path, deniedPath: denied })
        return { allowed: false, reason: `Access to ${denied} is denied`, resource: path }
      }
    }

    if (this.config.readOnlyPaths.length > 0) {
      const isAllowed = this.config.readOnlyPaths.some(allowed => 
        this.pathMatches(path, allowed)
      )
      if (!isAllowed) {
        return { allowed: false, reason: 'Path not in read whitelist', resource: path }
      }
    }

    return { allowed: true, reason: 'Read access allowed', resource: path }
  }

  canWrite(path: string): SandboxCheckResult {
    if (!this.config.enabled) {
      return { allowed: true, reason: 'Sandbox disabled' }
    }

    if (!this.config.allowFileSystem) {
      return { allowed: false, reason: 'File system access disabled', resource: path }
    }

    for (const denied of this.config.deniedPaths) {
      if (this.pathMatches(path, denied)) {
        this.logger.warn('Write access denied', { path, deniedPath: denied })
        return { allowed: false, reason: `Write to ${denied} is denied`, resource: path }
      }
    }

    if (this.config.writePaths.length > 0) {
      const isAllowed = this.config.writePaths.some(allowed => 
        this.pathMatches(path, allowed)
      )
      if (!isAllowed) {
        return { allowed: false, reason: 'Path not in write whitelist', resource: path }
      }
    }

    return { allowed: true, reason: 'Write access allowed', resource: path }
  }

  canAccess(host: string): SandboxCheckResult {
    if (!this.config.enabled) {
      return { allowed: true, reason: 'Sandbox disabled' }
    }

    if (!this.config.allowNetwork) {
      return { allowed: false, reason: 'Network access disabled', resource: host }
    }

    for (const denied of this.config.deniedHosts) {
      if (this.hostMatches(host, denied)) {
        this.logger.warn('Network access denied', { host, deniedHost: denied })
        return { allowed: false, reason: `Access to ${denied} is denied`, resource: host }
      }
    }

    if (this.config.allowedHosts.length > 0) {
      const isAllowed = this.config.allowedHosts.some(allowed => 
        this.hostMatches(host, allowed)
      )
      if (!isAllowed) {
        return { allowed: false, reason: 'Host not in whitelist', resource: host }
      }
    }

    return { allowed: true, reason: 'Network access allowed', resource: host }
  }

  canExecute(command: string): SandboxCheckResult {
    if (!this.config.enabled) {
      return { allowed: true, reason: 'Sandbox disabled' }
    }

    if (!this.config.allowProcessExecution) {
      return { allowed: false, reason: 'Process execution disabled', resource: command }
    }

    return { allowed: true, reason: 'Execution allowed', resource: command }
  }

  shouldUseSandbox(permissionMode: PermissionMode): boolean {
    if (!this.config.enabled) {
      return false
    }

    return permissionMode !== 'bypass'
  }

  async executeInSandbox<T>(
    operation: () => Promise<T>,
    options?: { timeout?: number }
  ): Promise<T> {
    const timeout = options?.timeout || this.config.maxExecutionTime

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Sandbox execution timeout')), timeout)
    })

    try {
      const result = await Promise.race([operation(), timeoutPromise])
      return result
    } catch (error) {
      this.logger.error('Sandbox execution failed', {
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  checkFileSize(size: number): SandboxCheckResult {
    if (!this.config.enabled) {
      return { allowed: true, reason: 'Sandbox disabled' }
    }

    if (size > this.config.maxFileSize) {
      return {
        allowed: false,
        reason: `File size ${size} exceeds maximum ${this.config.maxFileSize}`
      }
    }

    return { allowed: true, reason: 'File size within limits' }
  }

  private pathMatches(path: string, pattern: string): boolean {
    const normalizedPath = this.normalizePath(path)
    const normalizedPattern = this.normalizePath(pattern)

    if (normalizedPattern.includes('*')) {
      const regex = new RegExp('^' + normalizedPattern.replace(/\*/g, '.*') + '$')
      return regex.test(normalizedPath)
    }

    return normalizedPath.startsWith(normalizedPattern) || 
           normalizedPath === normalizedPattern
  }

  private hostMatches(host: string, pattern: string): boolean {
    const normalizedHost = host.toLowerCase()
    const normalizedPattern = pattern.toLowerCase()

    if (normalizedPattern.includes('*')) {
      const regex = new RegExp('^' + normalizedPattern.replace(/\*/g, '.*') + '$')
      return regex.test(normalizedHost)
    }

    return normalizedHost === normalizedPattern || 
           normalizedHost.endsWith('.' + normalizedPattern)
  }

  private normalizePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
  }

  getConfig(): SandboxConfig {
    return { ...this.config }
  }

  updateConfig(config: Partial<SandboxConfig>): void {
    this.config = { ...this.config, ...config }
    this.logger.info('Sandbox config updated')
  }
}

export function createSandbox(config?: Partial<SandboxConfig>): Sandbox {
  return new Sandbox(config)
}
