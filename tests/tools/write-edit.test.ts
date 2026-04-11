import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import { createWriteTool, isPathSafe } from '../../src/tools/builtin/write.js'
import { createEditTool, isEditPathSafe } from '../../src/tools/builtin/edit.js'
import { ToolRegistry } from '../../src/tools/registry.js'

describe('Write Tool', () => {
  const testDir = path.join(process.cwd(), 'test-write-dir')
  const testFile = path.join(testDir, 'test.txt')

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  it('should create a write tool with correct properties', () => {
    const tool = createWriteTool()
    expect(tool.name).toBe('Write')
    expect(tool.description).toBe('Writes a file to the local filesystem')
    expect(tool.isReadOnly()).toBe(false)
    expect(tool.isDestructive()).toBe(true)
    expect(tool.isConcurrencySafe()).toBe(false)
    expect(tool.checkPermissions({ file_path: '/test', content: 'test' })).toBe('ask')
  })

  it('should write a new file', async () => {
    const tool = createWriteTool()
    const result = await tool.execute({ 
      file_path: testFile, 
      content: 'Hello, World!' 
    })
    
    expect(result.error).toBeUndefined()
    expect(result.output).toContain('Successfully wrote')
    
    const content = await fs.readFile(testFile, 'utf-8')
    expect(content).toBe('Hello, World!')
  })

  it('should overwrite existing file', async () => {
    await fs.writeFile(testFile, 'Old content', 'utf-8')
    
    const tool = createWriteTool()
    const result = await tool.execute({ 
      file_path: testFile, 
      content: 'New content' 
    })
    
    expect(result.error).toBeUndefined()
    
    const content = await fs.readFile(testFile, 'utf-8')
    expect(content).toBe('New content')
  })

  it('should create nested directories', async () => {
    const nestedFile = path.join(testDir, 'nested', 'deep', 'file.txt')
    const tool = createWriteTool()
    
    const result = await tool.execute({ 
      file_path: nestedFile, 
      content: 'Nested content' 
    })
    
    expect(result.error).toBeUndefined()
    
    const content = await fs.readFile(nestedFile, 'utf-8')
    expect(content).toBe('Nested content')
  })

  it('should reject unsafe paths', async () => {
    const tool = createWriteTool()
    const result = await tool.execute({ 
      file_path: path.join(process.cwd(), '..', '..', 'etc', 'passwd'), 
      content: 'malicious' 
    })
    
    expect(result.error).toBe(true)
    expect(result.output).toContain('not safe')
  })
})

describe('Edit Tool', () => {
  const testDir = path.join(process.cwd(), 'test-edit-dir')
  const testFile = path.join(testDir, 'test.txt')

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true })
    await fs.writeFile(testFile, 'Hello, World!', 'utf-8')
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  it('should create an edit tool with correct properties', () => {
    const tool = createEditTool()
    expect(tool.name).toBe('Edit')
    expect(tool.description).toBe('Performs a search and replace on a file')
    expect(tool.isReadOnly()).toBe(false)
    expect(tool.isDestructive()).toBe(true)
    expect(tool.isConcurrencySafe()).toBe(false)
    expect(tool.checkPermissions({ file_path: '/test', old_str: 'a', new_str: 'b' })).toBe('ask')
  })

  it('should replace text in file', async () => {
    const tool = createEditTool()
    const result = await tool.execute({ 
      file_path: testFile, 
      old_str: 'World', 
      new_str: 'CLine' 
    })
    
    expect(result.error).toBeUndefined()
    expect(result.output).toContain('Successfully edited')
    
    const content = await fs.readFile(testFile, 'utf-8')
    expect(content).toBe('Hello, CLine!')
  })

  it('should fail if old_str not found', async () => {
    const tool = createEditTool()
    const result = await tool.execute({ 
      file_path: testFile, 
      old_str: 'NotFound', 
      new_str: 'Replacement' 
    })
    
    expect(result.error).toBe(true)
    expect(result.output).toContain('Could not find')
  })

  it('should fail if old_str appears multiple times', async () => {
    await fs.writeFile(testFile, 'Hello Hello Hello', 'utf-8')
    
    const tool = createEditTool()
    const result = await tool.execute({ 
      file_path: testFile, 
      old_str: 'Hello', 
      new_str: 'Hi' 
    })
    
    expect(result.error).toBe(true)
    expect(result.output).toContain('3 occurrences')
  })

  it('should fail if old_str equals new_str', async () => {
    const tool = createEditTool()
    const result = await tool.execute({ 
      file_path: testFile, 
      old_str: 'World', 
      new_str: 'World' 
    })
    
    expect(result.error).toBe(true)
    expect(result.output).toContain('must be different')
  })

  it('should reject unsafe paths', async () => {
    const tool = createEditTool()
    const result = await tool.execute({ 
      file_path: path.join(process.cwd(), '..', '..', 'etc', 'passwd'), 
      old_str: 'a', 
      new_str: 'b' 
    })
    
    expect(result.error).toBe(true)
    expect(result.output).toContain('not safe')
  })
})

describe('isPathSafe', () => {
  it('should allow relative paths within cwd', () => {
    expect(isPathSafe(path.join(process.cwd(), 'test.txt'))).toBe(true)
    expect(isPathSafe(path.join(process.cwd(), 'src', 'index.ts'))).toBe(true)
    expect(isPathSafe(path.join(process.cwd(), 'src', 'utils', 'helper.ts'))).toBe(true)
  })

  it('should reject paths outside cwd', () => {
    expect(isPathSafe(path.join(process.cwd(), '..', 'outside.txt'))).toBe(false)
    expect(isPathSafe(path.join(process.cwd(), '..', '..', 'etc', 'passwd'))).toBe(false)
  })

  it('should reject paths with null bytes', () => {
    expect(isPathSafe('test\0.txt')).toBe(false)
  })
})

describe('isEditPathSafe', () => {
  it('should have same behavior as isPathSafe', () => {
    expect(isEditPathSafe(path.join(process.cwd(), 'test.txt'))).toBe(true)
    expect(isEditPathSafe(path.join(process.cwd(), '..', 'outside.txt'))).toBe(false)
  })
})

describe('ToolRegistry with Write and Edit', () => {
  it('should register write and edit tools', () => {
    const registry = new ToolRegistry()
    registry.register(createWriteTool())
    registry.register(createEditTool())
    
    expect(registry.has('Write')).toBe(true)
    expect(registry.has('Edit')).toBe(true)
    expect(registry.size()).toBe(2)
  })

  it('should identify destructive tools', () => {
    const registry = new ToolRegistry()
    registry.register(createWriteTool())
    registry.register(createEditTool())
    
    const destructive = registry.getDestructive()
    expect(destructive.length).toBe(2)
  })
})
