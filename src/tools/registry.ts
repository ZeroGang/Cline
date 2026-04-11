import type { Tool, ToolResult } from './types.js'
import type { ZodSchema } from 'zod'

export class ToolRegistry {
  private tools: Map<string, Tool<unknown, ToolResult>> = new Map()

  register<Input, Output extends ToolResult>(tool: Tool<Input, Output>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`)
    }
    this.tools.set(tool.name, tool as Tool<unknown, ToolResult>)
  }

  get(name: string): Tool<unknown, ToolResult> | undefined {
    return this.tools.get(name)
  }

  getAll(): Tool<unknown, ToolResult>[] {
    return Array.from(this.tools.values())
  }

  filter(predicate: (tool: Tool<unknown, ToolResult>) => boolean): Tool<unknown, ToolResult>[] {
    return this.getAll().filter(predicate)
  }

  getEnabled(): Tool<unknown, ToolResult>[] {
    return this.filter(tool => tool.isEnabled())
  }

  getReadOnly(): Tool<unknown, ToolResult>[] {
    return this.filter(tool => tool.isReadOnly())
  }

  getDestructive(): Tool<unknown, ToolResult>[] {
    return this.filter(tool => tool.isDestructive())
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  remove(name: string): boolean {
    return this.tools.delete(name)
  }

  clear(): void {
    this.tools.clear()
  }

  size(): number {
    return this.tools.size
  }
}

export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry()
}

export function createTool<Input, Output extends ToolResult = ToolResult>(config: {
  name: string
  description: string
  inputSchema: ZodSchema<Input>
  isEnabled?: () => boolean
  isConcurrencySafe?: (input: Input) => boolean
  isReadOnly?: () => boolean
  isDestructive?: () => boolean
  checkPermissions?: (input: Input) => 'allow' | 'deny' | 'ask'
  execute: (input: Input) => Promise<Output>
}): Tool<Input, Output> {
  return {
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    isEnabled: config.isEnabled ?? (() => true),
    isConcurrencySafe: config.isConcurrencySafe ?? (() => false),
    isReadOnly: config.isReadOnly ?? (() => false),
    isDestructive: config.isDestructive ?? (() => false),
    checkPermissions: config.checkPermissions ?? (() => 'ask'),
    execute: config.execute
  }
}
