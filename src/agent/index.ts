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
export { 
  StreamingToolExecutor, 
  createStreamingExecutor 
} from './streaming-executor.js'
export type { 
  ToolUseBlock, 
  ToolExecutionResult, 
  StreamingExecutorConfig 
} from './streaming-executor.js'
export { 
  agentLoop, 
  shouldTerminate, 
  createSyntheticAbortResult, 
  extractToolUseBlocks,
  createAgentLoopConfig
} from './loop.js'
export type { AgentLoopState, AgentLoopConfig } from './loop.js'
export { AgentInstanceImpl, createAgentInstance } from './instance.js'
export { 
  SubagentExecutor, 
  createSubagentExecutor,
  createChildAbortController,
  createSubagentContext
} from './subagent.js'
export type { 
  SubagentConfig, 
  SubagentExecutionResult 
} from './subagent.js'
