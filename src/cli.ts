#!/usr/bin/env node

import { Command } from 'commander'
import { pickClaudeSessionPort } from './infrastructure/net/pick-claude-session-port.js'
import { createScheduler } from './scheduler/index.js'
import type { AgentDefinition } from './agent/types.js'
import { productionDeps } from './agent/deps.js'
import { Logger } from './infrastructure/logging/logger.js'
import { CLINE_CONFIG_DEFAULT_FILENAME, resolveServeOptions } from './config/cline-config.js'

const program = new Command()
const logger = new Logger({ source: 'CLI' })

program
  .name('cline')
  .description('Claude Code 多实例调度器（CLI + HTTP API + Web UI）')
  .version('1.0.0')

program
  .command('serve')
  .description(
    `启动多 Agent 调度器与 REST API（供 ui/ Vite 代理）。端口、最小/最大 Agent 数等可从仓库根目录 ${CLINE_CONFIG_DEFAULT_FILENAME} 的 serve 段读取，CLI 参数优先。`
  )
  .option('-p, --port <n>', `HTTP 端口（未传则用 ${CLINE_CONFIG_DEFAULT_FILENAME} 或 ${8080}）`)
  .option('-H, --host <host>', `监听地址（未传则用 ${CLINE_CONFIG_DEFAULT_FILENAME} 或 localhost）`)
  .option('--min-agents <n>', `最小 Agent 数（未传则用 ${CLINE_CONFIG_DEFAULT_FILENAME}，否则默认 0）`)
  .option('--max-agents <n>', `最大 Agent 数（未传则用 ${CLINE_CONFIG_DEFAULT_FILENAME} serve.maxAgents，否则 16）`)
  .option('-m, --mode <mode>', '权限模式 (default/plan/auto/bypass)，未传则从配置文件或 default')
  .option(
    '--skip-claude-spawn',
    '新建 Agent（看板「新员工」）时不在目标项目目录打开终端并启动本机 Claude Code CLI（claude）'
  )
  .action(
    async (options: {
      port?: string
      host?: string
      minAgents?: string
      maxAgents?: string
      mode?: string
      skipClaudeSpawn?: boolean
    }) => {
    const projectRoot = process.env.CLINE_PROJECT_ROOT?.trim() || process.cwd()
    const resolved = resolveServeOptions(projectRoot, options)
    if (resolved.configPath) {
      logger.info(`已加载 ${CLINE_CONFIG_DEFAULT_FILENAME}`, { path: resolved.configPath })
    }
    logger.info('serve 生效参数', {
      port: resolved.port,
      host: resolved.host,
      minAgents: resolved.minAgents,
      maxAgents: resolved.maxAgents,
    })
    const { startSchedulerHttpHost } = await import('./app/scheduler-http-host.js')
    const definition: AgentDefinition = {
      agentType: 'default',
      permissionMode: resolved.mode as AgentDefinition['permissionMode'],
      isolation: 'shared',
      background: false,
    }
    const host = await startSchedulerHttpHost({
      port: resolved.port,
      host: resolved.host,
      scheduler: {
        minAgents: resolved.minAgents,
        maxAgents: resolved.maxAgents,
        loadBalanceStrategy: 'least-loaded',
        requireAssignAgentBeforeRun: resolved.requireAssignAgentBeforeRun,
        initialAgentProfiles: resolved.initialAgentProfiles,
      },
      agentDefinition: definition,
      spawnClaudeOnNewAgent: resolved.spawnClaudeOnNewAgent,
      agentProjectRoot: projectRoot,
    })
    const url = `http://${resolved.host}:${resolved.port}`
    logger.info('Scheduler + API ready', { url })
    console.log(`\n  Cline 调度器已启动\n  REST API: ${url}\n  健康检查: ${url}/api/health\n  任务列表: ${url}/api/tasks\n`)
    const shutdown = async () => {
      logger.info('Shutting down…')
      await host.close()
      process.exit(0)
    }
    process.on('SIGINT', () => void shutdown())
    process.on('SIGTERM', () => void shutdown())
  })

program
  .command('start')
  .description('仅启动单机调度器（无 HTTP，调试用）；Agent ID 固定为 agent-{会话端口}，不可配置')
  .option('-m, --mode <mode>', 'Permission mode (default/plan/auto/bypass)', 'default')
  .action(async (options) => {
    const port = await pickClaudeSessionPort()
    const agentId = `agent-${port}`
    logger.info('Starting CLine scheduler...', { agentId, mode: options.mode })

    const definition: AgentDefinition = {
      agentType: 'default',
      permissionMode: options.mode as 'default' | 'plan' | 'auto' | 'bypass',
      isolation: 'shared',
      background: false,
    }

    const scheduler = createScheduler(
      {
        agentId,
        agentDefinition: definition,
      },
      productionDeps()
    )

    scheduler.on('*', (event) => {
      console.log(`[${event.type}] ${event.taskId || ''}`)
    })

    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down...')
      await scheduler.shutdown()
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down...')
      await scheduler.shutdown()
      process.exit(0)
    })

    logger.info('Scheduler started. Press Ctrl+C to stop.')
    logger.info('Use "cline submit <prompt>" or POST /api/tasks (需先 cline serve).')
  })

program
  .command('submit <prompt>')
  .description('向运行中的 HTTP API 提交任务（需先执行 cline serve）')
  .option('-p, --priority <priority>', '优先级 (critical/high/medium/low 或 normal→medium)', 'medium')
  .option('-t, --type <type>', '任务类型', 'default')
  .option('-u, --url <url>', 'API 根地址', process.env.CLINE_API_URL ?? 'http://localhost:8080')
  .action(async (prompt: string, options: { priority: string; type: string; url: string }) => {
    const base = options.url.replace(/\/$/, '')
    const priority =
      options.priority === 'normal' || options.priority === 'default' ? 'medium' : options.priority
    try {
      let assignAgent: string | undefined
      try {
        const ar = await fetch(`${base}/api/agents`, { headers: { Accept: 'application/json' } })
        if (ar.ok) {
          const aj = (await ar.json()) as { agents?: { id: string }[] }
          const first = Array.isArray(aj.agents) ? aj.agents[0]?.id : undefined
          if (first) assignAgent = first
        }
      } catch {
        /* 无 agents 接口时仍创建任务，由看板手动分配 */
      }

      const r = await fetch(`${base}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          prompt,
          priority,
          type: options.type,
          ...(assignAgent ? { metadata: { assignAgent } } : {}),
        }),
      })
      const j = (await r.json()) as { task?: { id: string }; error?: string }
      if (!r.ok) {
        console.error('提交失败:', j.error ?? r.status)
        process.exitCode = 1
        return
      }
      if (!assignAgent) {
        console.log('提示: 当前无可用 Agent，任务将停留在待办，请在看板为任务分配 Agent 后才会执行。')
      }
      console.log('已创建任务:', j.task?.id ?? j)
    } catch (e) {
      console.error('无法连接 API，请先运行: npm run serve（或 cline serve）', e)
      process.exitCode = 1
    }
  })

program
  .command('status')
  .description('查询 HTTP API 上的调度器状态')
  .option('-u, --url <url>', 'API 根地址', process.env.CLINE_API_URL ?? 'http://localhost:8080')
  .action(async (options: { url: string }) => {
    const base = options.url.replace(/\/$/, '')
    try {
      const r = await fetch(`${base}/api/scheduler/status`)
      const j = (await r.json()) as { status?: unknown; error?: string }
      if (!r.ok) {
        console.error(j.error ?? r.status)
        process.exitCode = 1
        return
      }
      console.log(JSON.stringify(j.status ?? j, null, 2))
    } catch (e) {
      console.error('无法连接 API:', e)
      process.exitCode = 1
    }
  })

program.parse()
