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
import { parseSessionPortFromAgentId, resolveAgentProjectDir, trySpawnClaudeCodeSession } from './spawn-claude-code.js'

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
   * 通过 API 新建 Agent 时，是否在目标项目目录打开终端并启动 `claude`（Claude Code CLI）。
   * 默认 `true`；设为 `false` 或 CLI `--skip-claude-spawn` 可关闭。
   */
  spawnClaudeOnNewAgent?: boolean
  /**
   * 新建 Agent 时 Claude Code 的默认工作目录；
   * 默认取 `CLINE_PROJECT_ROOT` 或 `process.cwd()`（见 `cline serve`）。
   * API 请求体可传 `projectRoot` 覆盖单次创建。
   */
  agentProjectRoot?: string
}

export interface SchedulerHttpHost {
  scheduler: MultiAgentScheduler
  httpServer: HttpServer
  close: () => Promise<void>
}

const logger = new Logger({ source: 'SchedulerHttpHost' })

function trySpawnClaudeForAgentInstance(
  inst: AgentInstanceImpl,
  cwd: string,
  source: 'startup' | 'api'
): void {
  const sessionPort = parseSessionPortFromAgentId(inst.id)
  if (sessionPort === undefined) {
    logger.warn('Agent id 非 agent-{port} 格式，跳过拉起 Claude Code', { id: inst.id, source })
    return
  }
  logger.info('拉起 Claude Code 终端', { agentId: inst.id, sessionPort, cwd, source })
  trySpawnClaudeCodeSession({
    cwd,
    displayName: inst.getDisplayName(),
    agentId: inst.id,
    sessionPort,
  })
}

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

  /** 配置里预置的 Agent（serve.agents）只在池初始化时创建，此前不会走 POST /api/agents，这里同样拉起终端 */
  if (spawnClaudeOnNewAgent) {
    const existing = scheduler.getAllAgentInstances()
    if (existing.length > 0) {
      logger.info('serve 启动后为已有 Agent 拉起 Claude Code（与新建 Agent 行为一致）', { count: existing.length })
    }
    const staggerMs = 600
    existing.forEach((inst, i) => {
      setTimeout(() => {
        trySpawnClaudeForAgentInstance(inst, agentProjectRoot, 'startup')
      }, i * staggerMs)
    })
  } else {
    logger.info('已关闭 spawnClaudeOnNewAgent（--skip-claude-spawn 或配置），不会自动打开终端启动 Claude Code')
  }

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
        const inst = scheduler.getAgentInstance(id)
        if (spawnClaudeOnNewAgent && inst) {
          const cwd = resolveAgentProjectDir(input?.projectRoot, agentProjectRoot)
          trySpawnClaudeForAgentInstance(inst, cwd, 'api')
        }
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
