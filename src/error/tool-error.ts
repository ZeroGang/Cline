import { Logger } from '../infrastructure/logging/logger.js'

export interface ShellError extends Error {
  stdout: string
  stderr: string
  code: number | null
  interrupted: boolean
}

export function createShellError(
  message: string,
  stdout: string = '',
  stderr: string = '',
  code: number | null = null,
  interrupted: boolean = false
): ShellError {
  const error = new Error(message) as ShellError
  error.stdout = stdout
  error.stderr = stderr
  error.code = code
  error.interrupted = interrupted
  error.name = 'ShellError'
  return error
}

export function isShellError(error: unknown): error is ShellError {
  return error instanceof Error && 
         'stdout' in error && 
         'stderr' in error && 
         'code' in error
}

export function shortErrorStack(error: Error, maxFrames: number = 5): string {
  if (!error.stack) {
    return error.message
  }

  const lines = error.stack.split('\n')
  const errorLine = lines[0]
  const stackLines = lines.slice(1).filter(line => line.trim().startsWith('at'))

  const truncatedStack = stackLines.slice(0, maxFrames)
  
  if (stackLines.length > maxFrames) {
    truncatedStack.push(`    ... ${stackLines.length - maxFrames} more frames`)
  }

  return [errorLine, ...truncatedStack].join('\n')
}

export interface ErrorContext {
  type: 'api' | 'network' | 'permission' | 'resource' | 'validation' | 'unknown'
  recoverable: boolean
  userMessage: string
  suggestedAction?: string
}

export function classifyError(error: Error): ErrorContext {
  const message = error.message.toLowerCase()

  if (message.includes('rate limit') || message.includes('429')) {
    return {
      type: 'api',
      recoverable: true,
      userMessage: 'API rate limit reached. Please wait before retrying.',
      suggestedAction: 'Wait and retry'
    }
  }

  if (message.includes('unauthorized') || message.includes('401') || message.includes('invalid api key')) {
    return {
      type: 'api',
      recoverable: false,
      userMessage: 'API authentication failed. Please check your API key.',
      suggestedAction: 'Check API key configuration'
    }
  }

  if (message.includes('network') || message.includes('econnrefused') || message.includes('enotfound')) {
    return {
      type: 'network',
      recoverable: true,
      userMessage: 'Network connection failed. Please check your internet connection.',
      suggestedAction: 'Check network and retry'
    }
  }

  if (message.includes('permission') || message.includes('eacces') || message.includes('eperm')) {
    return {
      type: 'permission',
      recoverable: false,
      userMessage: 'Permission denied. You do not have access to this resource.',
      suggestedAction: 'Check file permissions'
    }
  }

  if (message.includes('enoent') || message.includes('not found')) {
    return {
      type: 'resource',
      recoverable: false,
      userMessage: 'Resource not found.',
      suggestedAction: 'Verify the resource exists'
    }
  }

  if (message.includes('validation') || message.includes('invalid')) {
    return {
      type: 'validation',
      recoverable: false,
      userMessage: 'Invalid input provided.',
      suggestedAction: 'Check input parameters'
    }
  }

  if (message.includes('timeout')) {
    return {
      type: 'network',
      recoverable: true,
      userMessage: 'Operation timed out.',
      suggestedAction: 'Retry with longer timeout'
    }
  }

  return {
    type: 'unknown',
    recoverable: false,
    userMessage: 'An unexpected error occurred.',
    suggestedAction: 'Check error details'
  }
}

export function getAssistantMessageFromError(error: Error): string {
  const context = classifyError(error)
  
  let message = context.userMessage
  
  if (context.suggestedAction) {
    message += ` Suggested action: ${context.suggestedAction}`
  }

  if (context.recoverable) {
    message += ' This error may be temporary.'
  }

  return message
}

export interface ToolError {
  tool: string
  input: Record<string, unknown>
  error: Error
  timestamp: Date
  retryable: boolean
}

export class ToolErrorHandler {
  private logger: Logger
  private maxRetries: number
  private retryDelay: number

  constructor(maxRetries: number = 3, retryDelay: number = 1000) {
    this.logger = new Logger({ source: 'ToolErrorHandler' })
    this.maxRetries = maxRetries
    this.retryDelay = retryDelay
  }

  handleToolError(
    tool: string,
    input: Record<string, unknown>,
    error: Error
  ): ToolError {
    const context = classifyError(error)
    
    const toolError: ToolError = {
      tool,
      input,
      error,
      timestamp: new Date(),
      retryable: context.recoverable
    }

    this.logger.error('Tool execution failed', {
      tool,
      errorType: context.type,
      recoverable: context.recoverable,
      message: error.message
    })

    return toolError
  }

  async withRetry<T>(
    operation: () => Promise<T>,
    tool: string,
    input: Record<string, unknown>
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        const context = classifyError(lastError)
        
        if (!context.recoverable || attempt === this.maxRetries) {
          throw this.handleToolError(tool, input, lastError)
        }

        this.logger.warn('Retrying tool execution', {
          tool,
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          delay: this.retryDelay * Math.pow(2, attempt)
        })

        await new Promise(resolve => 
          setTimeout(resolve, this.retryDelay * Math.pow(2, attempt))
        )
      }
    }

    throw this.handleToolError(tool, input, lastError!)
  }
}

export function createToolErrorHandler(maxRetries?: number, retryDelay?: number): ToolErrorHandler {
  return new ToolErrorHandler(maxRetries, retryDelay)
}
