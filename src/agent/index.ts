export type { 
  AgentContext, 
  QueryDeps, 
  AgentInstance, 
  AgentDefinition,
  Message,
  ContentBlock
} from './types.js'
export { productionDeps, testDeps, createMockMessage, createMockToolUse, createMockToolResult } from './deps.js'
export type { TestDepsOptions } from './deps.js'
export { 
  createAgentContext, 
  resetAgentContext, 
  addMessage, 
  getMessages, 
  abort, 
  isAborted 
} from './context.js'
export type { CreateAgentContextOptions } from './context.js'
export { 
  ContextManager, 
  CircuitBreaker, 
  createContextManager,
  DEFAULT_CONTEXT_CONFIG
} from './context-manager.js'
export type { ContextManagerConfig } from './context-manager.js'
