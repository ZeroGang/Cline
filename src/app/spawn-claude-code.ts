import { spawn, spawnSync } from 'node:child_process'
import { existsSync, statSync, writeFileSync, chmodSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { Logger } from '../infrastructure/logging/logger.js'

const logger = new Logger({ source: 'ClaudeCodeSpawn' })

/** 解析 `agent-{port}` 中的端口；非法格式返回 `undefined`。 */
export function parseSessionPortFromAgentId(agentId: string): number | undefined {
  const m = /^agent-(\d+)$/.exec(agentId.trim())
  const cap = m?.[1]
  if (!cap) return undefined
  const n = Number.parseInt(cap, 10)
  if (!Number.isFinite(n) || n < 1 || n > 65535) return undefined
  return n
}

export interface SpawnClaudeCodeOptions {
  /** 目标项目根目录（终端先 `cd` 再启动 Claude Code） */
  cwd: string
  displayName?: string
  agentId?: string
  /**
   * 与 Agent ID `agent-{sessionPort}` 中的端口一致；注入子进程环境变量 `CLINE_CLAUDE_CODE_SESSION_PORT`，供 Claude Code 或周边脚本识别本会话。
   */
  sessionPort: number
}

/** 供 API 传入的目录解析：须为已存在目录，否则回退 `fallback` */
export function resolveAgentProjectDir(requested: string | undefined, fallback: string): string {
  const fb = path.resolve(fallback.trim() || process.cwd())
  const raw = (requested ?? '').trim()
  if (!raw) return fb
  const abs = path.resolve(raw)
  try {
    if (!existsSync(abs)) {
      logger.warn('projectRoot 不存在，使用默认目录', { abs, fallback: fb })
      return fb
    }
    if (!statSync(abs).isDirectory()) {
      logger.warn('projectRoot 不是目录，使用默认目录', { abs, fallback: fb })
      return fb
    }
    return abs
  } catch (e) {
    logger.warn('projectRoot 校验失败，使用默认目录', { abs, error: String(e), fallback: fb })
    return fb
  }
}

function bashSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

function winCmdQuotePath(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

function commandOnPath(name: string): boolean {
  const r = spawnSync(process.platform === 'win32' ? 'where.exe' : 'sh', process.platform === 'win32' ? [name] : ['-c', `command -v ${bashSingleQuote(name)}`], {
    encoding: 'utf8',
    windowsHide: true,
  })
  return r.status === 0 && Boolean((r.stdout ?? '').trim())
}

/** Windows Terminal：`where wt.exe` / `where wt`（应用执行别名可能只有 `wt`） */
function resolveWindowsTerminalExecutable(): string | null {
  for (const name of ['wt.exe', 'wt']) {
    const r = spawnSync('where.exe', [name], { encoding: 'utf8', windowsHide: true })
    if (r.status !== 0) continue
    const line = (r.stdout ?? '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean)
    if (line) return line
  }
  return null
}

/**
 * 在目标目录打开**交互式终端**，并在其中启动 Claude Code CLI（默认可执行文件名为 `claude`）。
 * 异步、非阻塞；失败只记日志，不影响池内 Agent 的创建。
 *
 * - `CLINE_CLAUDE_BIN`：覆盖可执行文件路径或命令名。
 * - Windows：优先 `wt.exe -d <cwd> cmd /k …`（Windows Terminal），否则 `start … cmd /k cd /d …`。
 * - macOS：`open -a Terminal` 运行临时 `.command` 脚本（先 `cd` 再 `exec claude`）。
 * - Linux：依次尝试 `gnome-terminal`、`xfce4-terminal`、`konsole`、`x-terminal-emulator`。
 */
export function trySpawnClaudeCodeSession(opts: SpawnClaudeCodeOptions): void {
  const bin = process.env.CLINE_CLAUDE_BIN?.trim() || 'claude'
  const cwd = opts.cwd.trim()
  if (!cwd) {
    logger.warn('Skip Claude Code spawn: empty cwd')
    return
  }

  const portStr = String(opts.sessionPort)
  const childEnv = {
    ...process.env,
    CLINE_CLAUDE_CODE_SESSION_PORT: portStr,
  }

  const binPart = /\s|[&^|<>()]/.test(bin) ? winCmdQuotePath(bin) : bin
  const innerWithCd = `cd /d ${winCmdQuotePath(cwd)} && set CLINE_CLAUDE_CODE_SESSION_PORT=${portStr} && ${binPart}`
  const innerWt = `set CLINE_CLAUDE_CODE_SESSION_PORT=${portStr} && ${binPart}`

  try {
    if (process.platform === 'win32') {
      /** `windowsHide: true` 会导致部分环境下新控制台/WT 窗口不弹出 */
      const winSpawnOpts = { detached: true, stdio: 'ignore' as const, windowsHide: false, env: childEnv }
      const wtExe = process.env.CLINE_USE_WT !== '0' ? resolveWindowsTerminalExecutable() : null
      if (wtExe) {
        const child = spawn(wtExe, ['-d', cwd, 'cmd.exe', '/k', innerWt], {
          cwd,
          ...winSpawnOpts,
        })
        child.on('error', (err) => {
          logger.warn('Windows Terminal 启动失败，回退 cmd start', { error: String(err), wtExe })
          spawnWinCmdStart({ inner: innerWithCd, cwd, childEnv })
        })
        child.unref()
        logger.info('Claude Code: Windows Terminal', { cwd, bin, sessionPort: portStr, wtExe })
        return
      }
      spawnWinCmdStart({ inner: innerWithCd, cwd, childEnv })
      return
    }

    if (process.platform === 'darwin') {
      spawnMacTerminal({ cwd, bin, childEnv })
      return
    }

    spawnLinuxTerminal({ cwd, bin, childEnv })
  } catch (e) {
    logger.warn('Claude Code spawn threw', { error: String(e), cwd, bin })
  }
}

function spawnWinCmdStart(args: { inner: string; cwd: string; childEnv: NodeJS.ProcessEnv }): void {
  const { inner, cwd, childEnv } = args
  /** `start` 首段引号内为窗口标题；用固定 ASCII 标题避免中文/空格被 cmd 误解析 */
  const startTitle = 'Cline-Claude'
  const child = spawn('cmd.exe', ['/c', 'start', startTitle, 'cmd.exe', '/k', inner], {
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    env: childEnv,
  })
  child.on('error', (err) => {
    logger.warn('Claude Code spawn failed (Windows cmd)', { error: String(err), cwd })
  })
  child.unref()
  logger.info('Claude Code: 新控制台 cmd /k', { cwd })
}

function spawnMacTerminal(args: { cwd: string; bin: string; childEnv: NodeJS.ProcessEnv }): void {
  const { cwd, bin, childEnv } = args
  const portStr = String(childEnv.CLINE_CLAUDE_CODE_SESSION_PORT ?? '')
  const scriptPath = path.join(tmpdir(), `cline-claude-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.command`)
  const script = `#!/bin/bash
cd ${bashSingleQuote(cwd)} || exit 1
export CLINE_CLAUDE_CODE_SESSION_PORT=${bashSingleQuote(portStr)}
exec ${bashSingleQuote(bin)}
`
  try {
    writeFileSync(scriptPath, script, { encoding: 'utf8' })
    chmodSync(scriptPath, 0o755)
  } catch (e) {
    logger.warn('Claude Code: 无法写入临时 .command', { error: String(e), scriptPath })
    return
  }

  const child = spawn('open', ['-a', 'Terminal', scriptPath], {
    detached: true,
    stdio: 'ignore',
    env: childEnv,
  })
  child.on('error', (err) => {
    logger.warn('Claude Code spawn failed (macOS open Terminal)', { error: String(err), cwd, bin })
  })
  child.on('spawn', () => {
    setTimeout(() => {
      try {
        unlinkSync(scriptPath)
      } catch {
        /* 忽略 */
      }
    }, 5000)
  })
  child.unref()
  logger.info('Claude Code: Terminal.app', { cwd, bin, sessionPort: portStr })
}

function spawnLinuxTerminal(args: { cwd: string; bin: string; childEnv: NodeJS.ProcessEnv }): void {
  const { cwd, bin, childEnv } = args
  const portStr = String(childEnv.CLINE_CLAUDE_CODE_SESSION_PORT ?? '')
  const bashLine = `export CLINE_CLAUDE_CODE_SESSION_PORT=${bashSingleQuote(portStr)}; exec ${bashSingleQuote(bin)}`

  const attempts: Array<{ label: string; cmd: string; argv: string[] }> = []
  if (commandOnPath('gnome-terminal')) {
    attempts.push({
      label: 'gnome-terminal',
      cmd: 'gnome-terminal',
      argv: ['--working-directory', cwd, '--', 'bash', '-lc', bashLine],
    })
  }
  if (commandOnPath('xfce4-terminal')) {
    attempts.push({
      label: 'xfce4-terminal',
      cmd: 'xfce4-terminal',
      argv: ['--working-directory', cwd, '-e', `bash -lc ${bashSingleQuote(bashLine)}`],
    })
  }
  if (commandOnPath('konsole')) {
    attempts.push({
      label: 'konsole',
      cmd: 'konsole',
      argv: ['--workdir', cwd, '-e', 'bash', '-lc', bashLine],
    })
  }
  if (commandOnPath('x-terminal-emulator')) {
    attempts.push({
      label: 'x-terminal-emulator',
      cmd: 'x-terminal-emulator',
      argv: ['-e', 'bash', '-lc', `cd ${bashSingleQuote(cwd)} && ${bashLine}`],
    })
  }

  if (attempts.length === 0) {
    logger.warn('未找到可用终端模拟器（gnome-terminal / xfce4-terminal / konsole / x-terminal-emulator）', { cwd })
    return
  }

  const { label, cmd, argv } = attempts[0]!
  const child = spawn(cmd, argv, { detached: true, stdio: 'ignore', env: childEnv })
  child.on('error', (err) => {
    logger.warn('Linux 终端启动失败', { error: String(err), cmd: label, cwd })
  })
  child.unref()
  logger.info(`Claude Code: ${label}`, { cwd, bin })
}
