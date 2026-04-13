export { 
  createShellError,
  isShellError,
  shortErrorStack,
  classifyError,
  getAssistantMessageFromError,
  ToolErrorHandler,
  createToolErrorHandler,
  type ShellError,
  type ErrorContext,
  type ToolError
} from './tool-error.js'

export { 
  CircuitBreaker,
  CircuitBreakerManager,
  circuitBreakerManager,
  type CircuitState,
  type CircuitBreakerConfig
} from './circuit-breaker.js'
