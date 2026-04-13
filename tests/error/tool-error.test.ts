import { describe, it, expect, beforeEach, vi } from 'vitest'
import { 
  createShellError, 
  isShellError, 
  shortErrorStack, 
  classifyError, 
  getAssistantMessageFromError,
  ToolErrorHandler,
  createToolErrorHandler
} from '../../src/error/tool-error.js'

describe('Error Handling', () => {
  describe('createShellError', () => {
    it('should create a shell error with all properties', () => {
      const error = createShellError('Command failed', 'stdout', 'stderr', 1, false)
      
      expect(error.message).toBe('Command failed')
      expect(error.stdout).toBe('stdout')
      expect(error.stderr).toBe('stderr')
      expect(error.code).toBe(1)
      expect(error.interrupted).toBe(false)
      expect(error.name).toBe('ShellError')
    })

    it('should create shell error with defaults', () => {
      const error = createShellError('Command failed')
      
      expect(error.stdout).toBe('')
      expect(error.stderr).toBe('')
      expect(error.code).toBeNull()
      expect(error.interrupted).toBe(false)
    })
  })

  describe('isShellError', () => {
    it('should return true for shell errors', () => {
      const error = createShellError('test')
      
      expect(isShellError(error)).toBe(true)
    })

    it('should return false for regular errors', () => {
      const error = new Error('test')
      
      expect(isShellError(error)).toBe(false)
    })
  })

  describe('shortErrorStack', () => {
    it('should truncate stack trace', () => {
      const error = new Error('test')
      error.stack = `Error: test
    at func1 (file1.js:1:1)
    at func2 (file2.js:2:2)
    at func3 (file3.js:3:3)
    at func4 (file4.js:4:4)
    at func5 (file5.js:5:5)
    at func6 (file6.js:6:6)
    at func7 (file7.js:7:7)`
      
      const shortStack = shortErrorStack(error, 3)
      
      expect(shortStack).toContain('Error: test')
      expect(shortStack).toContain('func1')
      expect(shortStack).toContain('func2')
      expect(shortStack).toContain('func3')
      expect(shortStack).not.toContain('func4')
      expect(shortStack).toContain('4 more frames')
    })

    it('should handle errors without stack', () => {
      const error = new Error('test')
      delete error.stack
      
      const shortStack = shortErrorStack(error)
      
      expect(shortStack).toBe('test')
    })
  })

  describe('classifyError', () => {
    it('should classify rate limit errors', () => {
      const error = new Error('Rate limit exceeded (429)')
      const context = classifyError(error)
      
      expect(context.type).toBe('api')
      expect(context.recoverable).toBe(true)
    })

    it('should classify authentication errors', () => {
      const error = new Error('Unauthorized (401)')
      const context = classifyError(error)
      
      expect(context.type).toBe('api')
      expect(context.recoverable).toBe(false)
    })

    it('should classify network errors', () => {
      const error = new Error('ECONNREFUSED')
      const context = classifyError(error)
      
      expect(context.type).toBe('network')
      expect(context.recoverable).toBe(true)
    })

    it('should classify permission errors', () => {
      const error = new Error('EACCES permission denied')
      const context = classifyError(error)
      
      expect(context.type).toBe('permission')
      expect(context.recoverable).toBe(false)
    })

    it('should classify resource errors', () => {
      const error = new Error('ENOENT not found')
      const context = classifyError(error)
      
      expect(context.type).toBe('resource')
      expect(context.recoverable).toBe(false)
    })

    it('should classify validation errors', () => {
      const error = new Error('Invalid input')
      const context = classifyError(error)
      
      expect(context.type).toBe('validation')
      expect(context.recoverable).toBe(false)
    })

    it('should classify timeout errors', () => {
      const error = new Error('Operation timeout')
      const context = classifyError(error)
      
      expect(context.type).toBe('network')
      expect(context.recoverable).toBe(true)
    })

    it('should classify unknown errors', () => {
      const error = new Error('Something weird happened')
      const context = classifyError(error)
      
      expect(context.type).toBe('unknown')
      expect(context.recoverable).toBe(false)
    })
  })

  describe('getAssistantMessageFromError', () => {
    it('should generate user-friendly message', () => {
      const error = new Error('Rate limit exceeded')
      const message = getAssistantMessageFromError(error)
      
      expect(message).toContain('API rate limit')
      expect(message).toContain('temporary')
    })

    it('should include suggested action', () => {
      const error = new Error('Unauthorized')
      const message = getAssistantMessageFromError(error)
      
      expect(message).toContain('Suggested action')
    })
  })

  describe('ToolErrorHandler', () => {
    let handler: ToolErrorHandler

    beforeEach(() => {
      handler = createToolErrorHandler(3, 100)
    })

    describe('handleToolError', () => {
      it('should create tool error with context', () => {
        const error = new Error('Test error')
        const toolError = handler.handleToolError('Read', { path: '/test' }, error)
        
        expect(toolError.tool).toBe('Read')
        expect(toolError.input).toEqual({ path: '/test' })
        expect(toolError.error).toBe(error)
        expect(toolError.timestamp).toBeInstanceOf(Date)
      })

      it('should determine retryability', () => {
        const recoverableError = new Error('Network timeout')
        const nonRecoverableError = new Error('Permission denied')
        
        const recoverable = handler.handleToolError('Read', {}, recoverableError)
        const nonRecoverable = handler.handleToolError('Read', {}, nonRecoverableError)
        
        expect(recoverable.retryable).toBe(true)
        expect(nonRecoverable.retryable).toBe(false)
      })
    })

    describe('withRetry', () => {
      it('should succeed on first try', async () => {
        const operation = vi.fn().mockResolvedValue('success')
        
        const result = await handler.withRetry(operation, 'Read', {})
        
        expect(result).toBe('success')
        expect(operation).toHaveBeenCalledTimes(1)
      })

      it('should retry on recoverable errors', async () => {
        const operation = vi.fn()
          .mockRejectedValueOnce(new Error('Network timeout'))
          .mockResolvedValue('success')
        
        const result = await handler.withRetry(operation, 'Read', {})
        
        expect(result).toBe('success')
        expect(operation).toHaveBeenCalledTimes(2)
      })

      it('should not retry on non-recoverable errors', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Permission denied'))
        
        await expect(handler.withRetry(operation, 'Read', {})).rejects.toThrow()
        expect(operation).toHaveBeenCalledTimes(1)
      })

      it('should fail after max retries', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Network timeout'))
        
        await expect(handler.withRetry(operation, 'Read', {})).rejects.toThrow()
        expect(operation).toHaveBeenCalledTimes(4) // 1 initial + 3 retries
      })
    })
  })
})
