import { describe, it, expect, beforeEach } from 'vitest'
import { ToolRegistry } from '../../src/tools/registry.js'
import { 
  createReadTool, 
  createGlobTool, 
  createGrepTool, 
  createWebFetchTool, 
  createWebSearchTool, 
  createAskUserQuestionTool,
  registerBuiltinTools 
} from '../../src/tools/builtin/index.js'

describe('Builtin Tools', () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = new ToolRegistry()
  })

  describe('createReadTool', () => {
    it('should create a read tool with correct properties', () => {
      const tool = createReadTool()
      expect(tool.name).toBe('Read')
      expect(tool.description).toBe('Reads a file from the local filesystem')
      expect(tool.isReadOnly()).toBe(true)
      expect(tool.isConcurrencySafe()).toBe(true)
      expect(tool.checkPermissions({ file_path: '/test' })).toBe('allow')
    })

    it('should read a file successfully', async () => {
      const tool = createReadTool()
      const result = await tool.execute({ file_path: './package.json' })
      expect(result.error).toBeUndefined()
      expect(result.output).toContain('name')
    })

    it('should handle file not found', async () => {
      const tool = createReadTool()
      const result = await tool.execute({ file_path: './nonexistent-file.txt' })
      expect(result.error).toBe(true)
      expect(result.output).toContain('Error')
    })
  })

  describe('createGlobTool', () => {
    it('should create a glob tool with correct properties', () => {
      const tool = createGlobTool()
      expect(tool.name).toBe('Glob')
      expect(tool.description).toBe('Fast file pattern matching tool')
      expect(tool.isReadOnly()).toBe(true)
      expect(tool.isConcurrencySafe()).toBe(true)
    })

    it('should find files matching pattern', async () => {
      const tool = createGlobTool()
      const result = await tool.execute({ pattern: '*.json' })
      expect(result.error).toBeUndefined()
      expect(result.output).toContain('package.json')
    })
  })

  describe('createGrepTool', () => {
    it('should create a grep tool with correct properties', () => {
      const tool = createGrepTool()
      expect(tool.name).toBe('Grep')
      expect(tool.description).toBe('A powerful search tool built on ripgrep')
      expect(tool.isReadOnly()).toBe(true)
      expect(tool.isConcurrencySafe()).toBe(true)
    })

    it('should search for pattern in files', async () => {
      const tool = createGrepTool()
      const result = await tool.execute({ 
        pattern: 'CLine', 
        output_mode: 'files_with_matches' 
      })
      expect(result.error).toBeUndefined()
    })
  })

  describe('createWebFetchTool', () => {
    it('should create a webfetch tool with correct properties', () => {
      const tool = createWebFetchTool()
      expect(tool.name).toBe('WebFetch')
      expect(tool.description).toBe('Fetches a URL and converts HTML to markdown')
      expect(tool.isReadOnly()).toBe(true)
      expect(tool.isConcurrencySafe()).toBe(true)
      expect(tool.checkPermissions({ url: 'https://example.com' })).toBe('ask')
    })
  })

  describe('createWebSearchTool', () => {
    it('should create a websearch tool with correct properties', () => {
      const tool = createWebSearchTool()
      expect(tool.name).toBe('WebSearch')
      expect(tool.description).toBe('Search the web for information')
      expect(tool.isReadOnly()).toBe(true)
      expect(tool.isConcurrencySafe()).toBe(true)
      expect(tool.checkPermissions({ query: 'test' })).toBe('ask')
    })

    it('should return search results', async () => {
      const tool = createWebSearchTool()
      const result = await tool.execute({ query: 'test query' })
      expect(result.error).toBeUndefined()
      expect(result.output).toContain('test query')
    })
  })

  describe('createAskUserQuestionTool', () => {
    it('should create an ask tool with correct properties', () => {
      const tool = createAskUserQuestionTool()
      expect(tool.name).toBe('AskUserQuestion')
      expect(tool.description).toBe('Ask the user questions during execution')
      expect(tool.isReadOnly()).toBe(true)
      expect(tool.isConcurrencySafe()).toBe(false)
      expect(tool.checkPermissions({ questions: [] })).toBe('allow')
    })

    it('should process questions', async () => {
      const tool = createAskUserQuestionTool()
      const result = await tool.execute({
        questions: [{
          question: 'What is your choice?',
          header: 'Choice',
          options: [
            { label: 'Option A', description: 'First option' },
            { label: 'Option B', description: 'Second option' }
          ]
        }]
      })
      expect(result.error).toBeUndefined()
      expect(result.output).toContain('What is your choice?')
    })
  })

  describe('registerBuiltinTools', () => {
    it('should register all builtin tools', () => {
      registerBuiltinTools(registry)
      expect(registry.size()).toBe(6)
      expect(registry.has('Read')).toBe(true)
      expect(registry.has('Glob')).toBe(true)
      expect(registry.has('Grep')).toBe(true)
      expect(registry.has('WebFetch')).toBe(true)
      expect(registry.has('WebSearch')).toBe(true)
      expect(registry.has('AskUserQuestion')).toBe(true)
    })

    it('should have all tools as read-only', () => {
      registerBuiltinTools(registry)
      const readOnly = registry.getReadOnly()
      expect(readOnly.length).toBe(6)
    })
  })
})
