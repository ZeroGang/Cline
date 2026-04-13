import type { Server as HttpServer } from 'node:http'
import { createApiServer, setupApiRoutes } from '../api/index.js'
import { listenApiServer } from '../api/http-node.js'
import { createMultiAgentScheduler, type MultiAgentScheduler } from '../scheduler/index.js'
import type { MultiAgentSchedulerConfig } from '../scheduler/multi-agent-scheduler.js'
import { productionDeps } from '../agent/deps.js'
import type { AgentDefinition } from '../agent/types.js'
import type { Task } from '../scheduler/types.js'
import type { AgentStatus } from '../monitoring/monitor.js'
import type { AgentId } from '../types.js'
import type { AgentInstanceImpl } from '../agent/instance.js'
import { Logger } from '../infrastructure/logging/logger.js'
import { trySpawnClaudeCodeSession } from './spawn-claude-code.js'

function mapPoolAgentToApiStatus(agent: AgentInstanceImpl): AgentStatus {
  const st = agent.status
  const status: AgentStatus['status'] =
    st === 'disposed' ? 'offline' : st === 'busy' ? 'busy' : st === 'error' ? 'error' : 'idle'
  const m = agent.getMetrics()
  return {
    id: agent.id,
    status,
    currentTask: agent.currentTaskId ?? undefined,
    lastActivity: new Date(),
    totalQueries: m.turns,
    totalTokens: m.totalTokens,
    totalCost: m.cost,
    errorCount: status === 'error' ? 1 : 0,
    displayName: agent.getDisplayName(),
    avatar: agent.getAvatar(),
  }
}

export interface SchedulerHttpHostOptions {
  port: number
  host: string
  /** 不含 agentDefinition，与 {@link AgentDefinition} 分开传入 */
  scheduler: Omit<MultiAgentSchedulerConfig, 'agentDefinition'>
  agentDefinition: AgentDefinition
  /**
   * 通过 API 新建 Agent 时，是否在本机工程目录执行 `claude`（Claude Code CLI）。
   * 默认 `true`；设为 `false` 或 CLI `--skip-claude-spawn` 可关闭。
   */
  spawnClaudeOnNewAgent?: boolean
  /** Claude Code 工作目录；默认 `process.cwd()`（即当前运行 `serve` 的工程目录） */
  agentProjectRoot?: string
}

export interface SchedulerHttpHost {
  scheduler: MultiAgentScheduler
  httpServer: HttpServer
  close: () => Promise<void>
}

const logger = new Logger({ source: 'SchedulerHttpHost' })

/**
 * 启动「多 Agent 调度器 + REST API」一体化进程，对接 `ui/` 与自动化脚本。
 */
export async function startSchedulerHttpHost(opts: SchedulerHttpHostOptions): Promise<SchedulerHttpHost> {
  const deps = productionDeps()
  const agentProjectRoot = opts.agentProjectRoot ?? process.cwd()
  const spawnClaudeOnNewAgent = opts.spawnClaudeOnNewAgent !== false

  const scheduler = createMultiAgentScheduler(
    {
      ...opts.scheduler,
      agentDefinition: opts.agentDefinition,
      /** 看板/API 默认：须分配池内 Agent 后才执行；传 `false` 可恢复旧行为 */
      requireAssignAgentBeforeRun: opts.scheduler.requireAssignAgentBeforeRun !== false,
    } satisfies MultiAgentSchedulerConfig,
    deps
  )

  await scheduler.initialize()

  const api = createApiServer({ port: opts.port, host: opts.host })

  setupApiRoutes(api, {
    task: {
      createTask: async (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => scheduler.createTaskForApi(task),
      getTask: async (id) => scheduler.getTask(id),
      listTasks: async (filter) => Promise.resolve(scheduler.listTasksForApi(filter)),
      updateTask: async (id, updates) => scheduler.updateTaskForApi(id, updates),
      deleteTask: async (id) => scheduler.deleteTaskForApi(id),
      cancelTask: async (id) => scheduler.tryCancelTaskForApi(id),
    },
    agent: {
      getAgentStatus: (agentId) => {
        const inst = scheduler.getAgentInstance(agentId as AgentId)
        return inst ? mapPoolAgentToApiStatus(inst) : undefined
      },
      getAllAgentStatuses: () => scheduler.getAllAgentInstances().map(mapPoolAgentToApiStatus),
      spawnAgent: async (input) => {
        const id = await scheduler.spawnAgent(input)
        if (!id) return null
        if (spawnClaudeOnNewAgent) {
          trySpawnClaudeCodeSession({
            cwd: agentProjectRoot,
            displayName: input?.displayName,
            agentId: id,
          })
        }
        const inst = scheduler.getAgentInstance(id)
        return inst ? mapPoolAgentToApiStatus(inst) : null
      },
    },
    scheduler: {
      getSchedulerStatus: () => scheduler.getSchedulerStatusForApi(),
      start: async () => {
        scheduler.resumeScheduling()
      },
      stop: async () => {
        scheduler.pauseScheduling()
      },
    },
  })

  const httpServer = await listenApiServer(api, opts.port, opts.host)
  logger.info('HTTP API listening', { url: `http://${opts.host}:${opts.port}` })

  return {
    scheduler,
    httpServer,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()))
      })
      await scheduler.shutdown()
    },
  }
}
