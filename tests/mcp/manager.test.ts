import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MCPManager, MCPConnectionError, createMCPManager, loadMCPTools, waitForMcpServers, type MCPServer, type MCPTool } from '../../src/mcp/manager.js'
import { ToolRegistry, createToolRegistry } from '../../src/tools/index.js'

describe('MCPManager', () => {
  let manager: MCPManager

  beforeEach(() => {
    manager = createMCPManager({
      connectionTimeout: 100,
      retryAttempts: 2,
      retryDelay: 10
    })
  })

  afterEach(async () => {
    await manager.disconnectAll()
  })

  describe('connect', () => {
    it('should connect to MCP server', async () => {
      const server: MCPServer = {
        name: 'test-server',
        tools: [],
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn(),
        isConnected: () => true
      }

      await manager.connect('test-server', server)

      expect(manager.getServer('test-server')).toBe(server)
      expect(manager.getConnectionStatus('test-server')).toBe('connected')
    })

    it('should retry on connection failure', async () => {
      const server: MCPServer = {
        name: 'test-server',
        tools: [],
        connect: vi.fn()
          .mockRejectedValueOnce(new Error('Connection failed'))
          .mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn(),
        isConnected: () => true
      }

      await manager.connect('test-server', server)

      expect(server.connect).toHaveBeenCalledTimes(2)
      expect(manager.getConnectionStatus('test-server')).toBe('connected')
    })

    it('should throw error after max retries', async () => {
      const server: MCPServer = {
        name: 'test-server',
        tools: [],
        connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
        disconnect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn(),
        isConnected: () => false
      }

      await expect(manager.connect('test-server', server)).rejects.toThrow(MCPConnectionError)
      expect(manager.getConnectionStatus('test-server')).toBe('error')
    })

    it('should not allow duplicate connections', async () => {
      const server: MCPServer = {
        name: 'test-server',
        tools: [],
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn(),
        isConnected: () => true
      }

      await manager.connect('test-server', server)
      await manager.connect('test-server', server)

      expect(server.connect).toHaveBeenCalledTimes(1)
    })

    it('should enforce max connections', async () => {
      const smallManager = createMCPManager({ maxConnections: 1 })

      const server1: MCPServer = {
        name: 'server-1',
        tools: [],
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn(),
        isConnected: () => true
      }

      const server2: MCPServer = {
        name: 'server-2',
        tools: [],
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn(),
        isConnected: () => true
      }

      await smallManager.connect('server-1', server1)
      
      await expect(smallManager.connect('server-2', server2)).rejects.toThrow('Maximum connections reached')
      
      await smallManager.disconnectAll()
    })
  })

  describe('disconnect', () => {
    it('should disconnect from MCP server', async () => {
      const server: MCPServer = {
        name: 'test-server',
        tools: [],
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn(),
        isConnected: () => true
      }

      await manager.connect('test-server', server)
      await manager.disconnect('test-server')

      expect(manager.getServer('test-server')).toBeUndefined()
      expect(manager.getConnectionStatus('test-server')).toBe('disconnected')
    })

    it('should handle disconnect error', async () => {
      const server: MCPServer = {
        name: 'test-server',
        tools: [],
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockRejectedValue(new Error('Disconnect error')),
        callTool: vi.fn(),
        isConnected: () => true
      }

      await manager.connect('test-server', server)
      await manager.disconnect('test-server')

      expect(manager.getServer('test-server')).toBeUndefined()
    })
  })

  describe('disconnectAll', () => {
    it('should disconnect all servers', async () => {
      const server1: MCPServer = {
        name: 'server-1',
        tools: [],
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn(),
        isConnected: () => true
      }

      const server2: MCPServer = {
        name: 'server-2',
        tools: [],
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn(),
        isConnected: () => true
      }

      await manager.connect('server-1', server1)
      await manager.connect('server-2', server2)
      await manager.disconnectAll()

      expect(manager.getAllServers().length).toBe(0)
    })
  })

  describe('callTool', () => {
    it('should call tool on connected server', async () => {
      const server: MCPServer = {
        name: 'test-server',
        tools: [],
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn().mockResolvedValue({ result: 'success' }),
        isConnected: () => true
      }

      await manager.connect('test-server', server)
      const result = await manager.callTool('test-server', 'test-tool', { arg: 'value' })

      expect(result).toEqual({ result: 'success' })
      expect(server.callTool).toHaveBeenCalledWith('test-tool', { arg: 'value' })
    })

    it('should throw error for non-existent server', async () => {
      await expect(
        manager.callTool('non-existent', 'test-tool', {})
      ).rejects.toThrow('Server non-existent not found')
    })

    it('should throw error for disconnected server', async () => {
      const server: MCPServer = {
        name: 'test-server',
        tools: [],
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn(),
        isConnected: () => false
      }

      await manager.connect('test-server', server)
      
      await expect(
        manager.callTool('test-server', 'test-tool', {})
      ).rejects.toThrow('Server test-server is not connected')
    })
  })

  describe('getAllConnectionStatuses', () => {
    it('should return all connection statuses', async () => {
      const server1: MCPServer = {
        name: 'server-1',
        tools: [],
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn(),
        isConnected: () => true
      }

      const server2: MCPServer = {
        name: 'server-2',
        tools: [],
        connect: vi.fn().mockRejectedValue(new Error('Failed')),
        disconnect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn(),
        isConnected: () => false
      }

      await manager.connect('server-1', server1)
      
      try {
        await manager.connect('server-2', server2)
      } catch {}

      const statuses = manager.getAllConnectionStatuses()
      expect(statuses['server-1']).toBe('connected')
      expect(statuses['server-2']).toBe('error')
    })
  })
})

describe('loadMCPTools', () => {
  it('should load MCP tools into registry', () => {
    const registry = createToolRegistry()
    const server: MCPServer = {
      name: 'test-server',
      tools: [
        {
          name: 'tool1',
          description: 'Tool 1',
          inputSchema: { type: 'object' }
        },
        {
          name: 'tool2',
          description: 'Tool 2',
          inputSchema: { type: 'object' }
        }
      ],
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn().mockResolvedValue({ result: 'success' }),
      isConnected: () => true
    }

    loadMCPTools(server, registry)

    expect(registry.get('mcp_test-server_tool1')).toBeDefined()
    expect(registry.get('mcp_test-server_tool2')).toBeDefined()
  })

  it('should execute MCP tool through registry', async () => {
    const registry = createToolRegistry()
    const server: MCPServer = {
      name: 'test-server',
      tools: [
        {
          name: 'test-tool',
          description: 'Test Tool',
          inputSchema: { type: 'object' }
        }
      ],
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn().mockResolvedValue({ result: 'success' }),
      isConnected: () => true
    }

    loadMCPTools(server, registry)

    const tool = registry.get('mcp_test-server_test-tool')
    const result = await tool?.execute({ arg: 'value' })

    expect(result).toEqual({ output: '{"result":"success"}', error: false })
    expect(server.callTool).toHaveBeenCalledWith('test-tool', { arg: 'value' })
  })
})

describe('waitForMcpServers', () => {
  it('should wait for servers to connect', async () => {
    const manager = createMCPManager()

    const server: MCPServer = {
      name: 'test-server',
      tools: [],
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn(),
      isConnected: () => true
    }

    await manager.connect('test-server', server)
    await waitForMcpServers(manager, ['test-server'], 1000)

    expect(manager.getConnectionStatus('test-server')).toBe('connected')
    
    await manager.disconnectAll()
  })

  it('should timeout if servers not connected', async () => {
    const manager = createMCPManager()

    await expect(
      waitForMcpServers(manager, ['non-existent'], 100)
    ).rejects.toThrow('Timeout waiting for MCP servers')
  })
})

import { afterEach } from 'vitest'
