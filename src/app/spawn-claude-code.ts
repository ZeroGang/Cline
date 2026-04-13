import { spawn } from 'node:child_process'
import { Logger } from '../infrastructure/logging/logger.js'

const logger = new Logger({ source: 'ClaudeCodeSpawn' })

export interface SpawnClaudeCodeOptions {
  /** 一般为 `cline serve` 启动时的工程根目录（`process.cwd()`） */
  cwd: string
  displayName?: string
  agentId?: string
}

/**
 * 在指定目录下尝试拉起本机 Claude Code CLI（默认可执行文件名为 `claude`）。
 * 异步、非阻塞；失败只记日志，不影响池内 Agent 的创建。
 *
 * 环境变量：`CLINE_CLAUDE_BIN` 覆盖可执行文件路径或命令名（如 `claude` 的绝对路径）。
 */
export function trySpawnClaudeCodeSession(opts: SpawnClaudeCodeOptions): void {
  const bin = process.env.CLINE_CLAUDE_BIN?.trim() || 'claude'
  const cwd = opts.cwd.trim()
  if (!cwd) {
    logger.warn('Skip Claude Code spawn: empty cwd')
    return
  }

  try {
    if (process.platform === 'win32') {
      const titleBase = opts.displayName?.trim() || opts.agentId || 'Claude Code'
      const title = titleBase.slice(0, 60)
      const child = spawn('cmd.exe', ['/c', 'start', title, bin], {
        cwd,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: process.env,
      })
      child.on('error', (err) => {
        logger.warn('Claude Code spawn failed (Windows)', { error: String(err), cwd, bin })
      })
      child.unref()
      logger.info('Claude Code session started (new console window)', { cwd, bin, pid: child.pid })
      return
    }

    const child = spawn(bin, [], {
      cwd,
      detached: true,
      stdio: 'ignore',
      env: process.env,
    })
    child.on('error', (err) => {
      logger.warn('Claude Code spawn failed', { error: String(err), cwd, bin })
    })
    child.unref()
    logger.info('Claude Code process started', { cwd, bin, pid: child.pid })
  } catch (e) {
    logger.warn('Claude Code spawn threw', { error: String(e), cwd, bin })
  }
}
