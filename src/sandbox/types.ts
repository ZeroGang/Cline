export interface SandboxConfig {
  readOnlyPaths: string[]
  writePaths: string[]
  deniedPaths: string[]
  allowedHosts: string[]
  deniedHosts: string[]
  maxExecutionTime: number
  maxMemory: number
}

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  readOnlyPaths: [],
  writePaths: [],
  deniedPaths: [],
  allowedHosts: [],
  deniedHosts: [],
  maxExecutionTime: 30_000,
  maxMemory: 512 * 1024 * 1024,
}
