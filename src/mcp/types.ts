export interface MCPServerConfig {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: unknown
}

export interface MCPServer {
  name: string
  tools: MCPTool[]
  resources: unknown[]
}
