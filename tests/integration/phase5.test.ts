import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MCPManager, createMCPManager, loadMCPTools, type MCPServer } from '../../src/mcp/index.js'
import { PluginManager, createPluginManager, type Plugin } from '../../src/plugins/index.js'
import { DockerBackend, createDockerBackend } from '../../src/backend/docker.js'
import { ApiServer, createApiServer, setupApiRoutes, type ApiRequest } from '../../src/api/index.js'
import { ToolRegistry, createToolRegistry } from '../../src/tools/index.js'
import { LoadBalancer, createLoadBalancer } from '../../src/scheduler/loadbalancer.js'
import { MetricsCollector } from '../../src/monitoring/metrics.js'

describe('Phase 5 Integration Tests', () => {
  describe('MCP Integration', () => {
    let manager: MCPManager
    let registry: ToolRegistry

    beforeEach(() => {
      manager = createMCPManager({ connectionTimeout: 100, retryAttempts: 1 })
      registry = createToolRegistry()
    })

    afterEach(async () => {
      await manager.disconnectAll()
    })

    it('should integrate MCP tools into tool registry', async () => {
      const server: MCPServer = {
        name: 'test-server',
        tools: [
          { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
          { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } }
        ],
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn().mockResolvedValue({ result: 'success' }),
        isConnected: () => true
      }

      await manager.connect('test-server', server)
      loadMCPTools(server, registry)

      expect(registry.has('mcp_test-server_tool1')).toBe(true)
      expect(registry.has('mcp_test-server_tool2')).toBe(true)

      const tool = registry.get('mcp_test-server_tool1')
      const result = await tool?.execute({ arg: 'value' })
      expect(result).toEqual({ output: '{"result":"success"}', error: false })
    })

    it('should handle multiple MCP servers', async () => {
      const server1: MCPServer = {
        name: 'server-1',
        tools: [{ name: 'tool1', description: 'Tool 1', inputSchema: {} }],
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn(),
        isConnected: () => true
      }

      const server2: MCPServer = {
        name: 'server-2',
        tools: [{ name: 'tool2', description: 'Tool 2', inputSchema: {} }],
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn(),
        isConnected: () => true
      }

      await manager.connect('server-1', server1)
      await manager.connect('server-2', server2)

      loadMCPTools(server1, registry)
      loadMCPTools(server2, registry)

      expect(registry.has('mcp_server-1_tool1')).toBe(true)
      expect(registry.has('mcp_server-2_tool2')).toBe(true)
    })
  })

  describe('Plugin Integration', () => {
    let pluginManager: PluginManager
    let toolRegistry: ToolRegistry
    let loadBalancer: LoadBalancer
    let metricsCollector: MetricsCollector

    beforeEach(() => {
      toolRegistry = createToolRegistry()
      loadBalancer = createLoadBalancer()
      metricsCollector = new MetricsCollector()

      pluginManager = createPluginManager({}, {
        toolRegistry,
        loadBalancer,
        metricsCollector
      })
    })

    afterEach(async () => {
      await pluginManager.unloadAll()
    })

    it('should load plugin and register all components', async () => {
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        tools: [
          {
            name: 'plugin-tool',
            description: 'Plugin tool',
            inputSchema: { type: 'object' },
            execute: vi.fn().mockResolvedValue({ success: true })
          }
        ],
        strategies: [
          {
            name: 'plugin-strategy',
            select: vi.fn()
          }
        ],
        onLoad: vi.fn()
      }

      await pluginManager.load(plugin)

      expect(plugin.onLoad).toHaveBeenCalled()
      expect(toolRegistry.has('plugin-tool')).toBe(true)
      expect(loadBalancer.getStrategy('plugin-strategy')).toBeDefined()
    })

    it('should unload plugin and cleanup components', async () => {
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        tools: [
          {
            name: 'plugin-tool',
            description: 'Plugin tool',
            inputSchema: { type: 'object' },
            execute: vi.fn()
          }
        ],
        onUnload: vi.fn()
      }

      await pluginManager.load(plugin)
      await pluginManager.unload('test-plugin')

      expect(plugin.onUnload).toHaveBeenCalled()
      expect(toolRegistry.has('plugin-tool')).toBe(false)
    })

    it('should execute plugin commands', async () => {
      const executed: string[] = []

      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        commands: [
          {
            name: 'test-command',
            description: 'Test command',
            execute: async (args) => {
              executed.push(...args)
            }
          }
        ]
      }

      await pluginManager.load(plugin)
      await pluginManager.executeCommand('test-plugin', 'test-command', ['arg1', 'arg2'])

      expect(executed).toEqual(['arg1', 'arg2'])
    })
  })

  describe('Docker Backend Integration', () => {
    it('should create DockerBackend instance', () => {
      const backend = createDockerBackend({
        defaultImage: 'node:18-alpine',
        resourceLimits: {
          cpu: 2,
          memory: '1g'
        }
      })

      expect(backend.type).toBe('docker')
    })

    it('should check Docker availability', async () => {
      const backend = createDockerBackend()
      const available = await backend.isAvailable()
      expect(typeof available).toBe('boolean')
    })
  })

  describe('API Integration', () => {
    let server: ApiServer

    beforeEach(() => {
      server = createApiServer()
    })

    it('should handle task API requests', async () => {
      const tasks: any[] = []

      setupApiRoutes(server, {
        task: {
          createTask: async (task) => {
            const newTask = { ...task, id: `task-${Date.now()}`, createdAt: new Date(), updatedAt: new Date() }
            tasks.push(newTask)
            return newTask
          },
          getTask: async (id) => tasks.find(t => t.id === id),
          listTasks: async () => tasks,
          updateTask: async (id, updates) => {
            const task = tasks.find(t => t.id === id)
            if (task) Object.assign(task, updates)
            return task
          },
          deleteTask: async (id) => {
            const index = tasks.findIndex(t => t.id === id)
            if (index >= 0) {
              tasks.splice(index, 1)
              return true
            }
            return false
          },
          cancelTask: async (id) => {
            const task = tasks.find(t => t.id === id)
            if (task) {
              task.status = 'cancelled'
              return true
            }
            return false
          }
        },
        agent: {
          getAgentStatus: () => undefined,
          getAllAgentStatuses: () => []
        },
        scheduler: {
          getSchedulerStatus: () => ({
            running: false,
            totalAgents: 0,
            activeAgents: 0,
            idleAgents: 0,
            queuedTasks: 0,
            completedTasks: 0,
            failedTasks: 0
          }),
          start: async () => {},
          stop: async () => {}
        }
      })

      const createReq: ApiRequest = {
        method: 'POST',
        path: '/api/tasks',
        headers: {},
        query: {},
        body: { description: 'Test task', priority: 'high' }
      }

      const createRes = await server.handleRequest(createReq)
      expect(createRes.status).toBe(201)
      expect((createRes.body as any).task.description).toBe('Test task')

      const listReq: ApiRequest = {
        method: 'GET',
        path: '/api/tasks',
        headers: {},
        query: {}
      }

      const listRes = await server.handleRequest(listReq)
      expect(listRes.status).toBe(200)
      expect((listRes.body as any).tasks.length).toBe(1)
    })

    it('should handle agent API requests', async () => {
      const agents = [
        { id: 'agent-1', status: 'idle', lastActivity: new Date(), totalQueries: 0, totalTokens: 0, totalCost: 0, errorCount: 0 },
        { id: 'agent-2', status: 'busy', lastActivity: new Date(), totalQueries: 5, totalTokens: 100, totalCost: 0.01, errorCount: 0 }
      ]

      setupApiRoutes(server, {
        task: {
          createTask: async (task) => ({ ...task, id: 'task-1', createdAt: new Date(), updatedAt: new Date() }),
          getTask: async () => undefined,
          listTasks: async () => [],
          updateTask: async () => undefined,
          deleteTask: async () => false,
          cancelTask: async () => false
        },
        agent: {
          getAgentStatus: (id) => agents.find(a => a.id === id),
          getAllAgentStatuses: () => agents
        },
        scheduler: {
          getSchedulerStatus: () => ({
            running: true,
            totalAgents: 2,
            activeAgents: 1,
            idleAgents: 1,
            queuedTasks: 0,
            completedTasks: 5,
            failedTasks: 0
          }),
          start: async () => {},
          stop: async () => {}
        }
      })

      const listReq: ApiRequest = {
        method: 'GET',
        path: '/api/agents',
        headers: {},
        query: {}
      }

      const listRes = await server.handleRequest(listReq)
      expect(listRes.status).toBe(200)
      expect((listRes.body as any).agents.length).toBe(2)

      const getReq: ApiRequest = {
        method: 'GET',
        path: '/api/agents/agent-1',
        headers: {},
        query: {}
      }

      const getRes = await server.handleRequest(getReq)
      expect(getRes.status).toBe(200)
      expect((getRes.body as any).agent.id).toBe('agent-1')
    })

    it('should handle scheduler API requests', async () => {
      let running = false

      setupApiRoutes(server, {
        task: {
          createTask: async (task) => ({ ...task, id: 'task-1', createdAt: new Date(), updatedAt: new Date() }),
          getTask: async () => undefined,
          listTasks: async () => [],
          updateTask: async () => undefined,
          deleteTask: async () => false,
          cancelTask: async () => false
        },
        agent: {
          getAgentStatus: () => undefined,
          getAllAgentStatuses: () => []
        },
        scheduler: {
          getSchedulerStatus: () => ({
            running,
            totalAgents: 0,
            activeAgents: 0,
            idleAgents: 0,
            queuedTasks: 0,
            completedTasks: 0,
            failedTasks: 0
          }),
          start: async () => { running = true },
          stop: async () => { running = false }
        }
      })

      const startReq: ApiRequest = {
        method: 'POST',
        path: '/api/scheduler/start',
        headers: {},
        query: {}
      }

      const startRes = await server.handleRequest(startReq)
      expect(startRes.status).toBe(200)
      expect((startRes.body as any).success).toBe(true)

      const statusReq: ApiRequest = {
        method: 'GET',
        path: '/api/scheduler/status',
        headers: {},
        query: {}
      }

      const statusRes = await server.handleRequest(statusReq)
      expect(statusRes.status).toBe(200)
      expect((statusRes.body as any).status.running).toBe(true)
    })

    it('should serve OpenAPI documentation', async () => {
      setupApiRoutes(server, {
        task: {
          createTask: async (task) => ({ ...task, id: 'task-1', createdAt: new Date(), updatedAt: new Date() }),
          getTask: async () => undefined,
          listTasks: async () => [],
          updateTask: async () => undefined,
          deleteTask: async () => false,
          cancelTask: async () => false
        },
        agent: {
          getAgentStatus: () => undefined,
          getAllAgentStatuses: () => []
        },
        scheduler: {
          getSchedulerStatus: () => ({
            running: false,
            totalAgents: 0,
            activeAgents: 0,
            idleAgents: 0,
            queuedTasks: 0,
            completedTasks: 0,
            failedTasks: 0
          }),
          start: async () => {},
          stop: async () => {}
        }
      })

      const req: ApiRequest = {
        method: 'GET',
        path: '/api/openapi.json',
        headers: {},
        query: {}
      }

      const res = await server.handleRequest(req)
      expect(res.status).toBe(200)
      expect((res.body as any).openapi).toBe('3.0.0')
      expect((res.body as any).info.title).toBe('CLine API')
    })
  })

  describe('Full System Integration', () => {
    it('should integrate all components', async () => {
      const toolRegistry = createToolRegistry()
      const loadBalancer = createLoadBalancer()
      const metricsCollector = new MetricsCollector()
      const pluginManager = createPluginManager({}, { toolRegistry, loadBalancer, metricsCollector })
      const mcpManager = createMCPManager()
      const apiServer = createApiServer()

      const plugin: Plugin = {
        name: 'integration-plugin',
        version: '1.0.0',
        tools: [
          {
            name: 'integration-tool',
            description: 'Integration test tool',
            inputSchema: { type: 'object' },
            execute: vi.fn().mockResolvedValue({ integrated: true })
          }
        ]
      }

      await pluginManager.load(plugin)

      const mcpServer: MCPServer = {
        name: 'integration-mcp',
        tools: [
          { name: 'mcp-tool', description: 'MCP Tool', inputSchema: {} }
        ],
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn().mockResolvedValue({ mcp: true }),
        isConnected: () => true
      }

      await mcpManager.connect('integration-mcp', mcpServer)
      loadMCPTools(mcpServer, toolRegistry)

      expect(toolRegistry.has('integration-tool')).toBe(true)
      expect(toolRegistry.has('mcp_integration-mcp_mcp-tool')).toBe(true)

      setupApiRoutes(apiServer, {
        task: {
          createTask: async (task) => ({ ...task, id: 'task-1', createdAt: new Date(), updatedAt: new Date() }),
          getTask: async () => undefined,
          listTasks: async () => [],
          updateTask: async () => undefined,
          deleteTask: async () => false,
          cancelTask: async () => false
        },
        agent: {
          getAgentStatus: () => undefined,
          getAllAgentStatuses: () => []
        },
        scheduler: {
          getSchedulerStatus: () => ({
            running: false,
            totalAgents: 0,
            activeAgents: 0,
            idleAgents: 0,
            queuedTasks: 0,
            completedTasks: 0,
            failedTasks: 0
          }),
          start: async () => {},
          stop: async () => {}
        }
      })

      const healthReq: ApiRequest = {
        method: 'GET',
        path: '/api/health',
        headers: {},
        query: {}
      }

      const healthRes = await apiServer.handleRequest(healthReq)
      expect(healthRes.status).toBe(200)
      expect((healthRes.body as any).status).toBe('ok')

      await pluginManager.unloadAll()
      await mcpManager.disconnectAll()
    })
  })
})

import { afterEach } from 'vitest'
