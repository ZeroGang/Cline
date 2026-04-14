import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { Logger } from '../infrastructure/logging/logger.js'
import type { AgentStartupProfile } from '../scheduler/types.js'

const logger = new Logger({ source: 'ClineConfig' })

/** 默认配置文件名（位于 `cwd` 根目录，除非设置环境变量 `CLINE_CONFIG`） */
export const CLINE_CONFIG_DEFAULT_FILENAME = 'cline-config.json'

const agentEntrySchema = z
  .object({
    displayName: z.string().min(1).max(128).optional(),
    name: z.string().min(1).max(128).optional(),
    avatar: z.string().max(2048).optional(),
    systemPrompt: z.string().max(64000).optional(),
    personalityPrompt: z.string().max(64000).optional(),
  })
  .passthrough()

/** 单条 serve 字段：数字支持 JSON 字符串（如 "0"），避免整文件校验失败 */
const servePartialSchema = z
  .object({
    minAgents: z.coerce.number().int().min(0).max(512).optional(),
    maxAgents: z.coerce.number().int().min(1).max(512).optional(),
    port: z.coerce.number().int().min(1).max(65535).optional(),
    host: z.string().min(1).max(256).optional(),
    mode: z.enum(['default', 'plan', 'auto', 'bypass']).optional(),
    requireAssignAgentBeforeRun: z.boolean().optional(),
    spawnClaudeOnNewAgent: z.boolean().optional(),
    agents: z.array(agentEntrySchema).max(512).optional(),
  })
  .passthrough()

const rootSchema = z
  .object({
    serve: servePartialSchema.optional(),
    minAgents: z.coerce.number().int().min(0).max(512).optional(),
    maxAgents: z.coerce.number().int().min(1).max(512).optional(),
    port: z.coerce.number().int().min(1).max(65535).optional(),
    host: z.string().min(1).max(256).optional(),
    mode: z.enum(['default', 'plan', 'auto', 'bypass']).optional(),
    requireAssignAgentBeforeRun: z.boolean().optional(),
    spawnClaudeOnNewAgent: z.boolean().optional(),
    agents: z.array(agentEntrySchema).max(512).optional(),
  })
  .passthrough()

export type ClineServeJson = z.infer<typeof servePartialSchema>

type ParsedRoot = z.infer<typeof rootSchema>

/** 根级字段与 serve 合并，serve 优先（覆盖根级同名项） */
function mergeEffectiveServe(p: ParsedRoot): Partial<ClineServeJson> {
  const base: Partial<ClineServeJson> = {
    minAgents: p.minAgents,
    maxAgents: p.maxAgents,
    port: p.port,
    host: p.host,
    mode: p.mode,
    requireAssignAgentBeforeRun: p.requireAssignAgentBeforeRun,
    spawnClaudeOnNewAgent: p.spawnClaudeOnNewAgent,
    agents: p.agents,
  }
  const out: Partial<ClineServeJson> = { ...base }
  if (p.serve) {
    Object.assign(out, p.serve)
  }
  return out
}

function normalizeStartupAgents(raw: z.infer<typeof agentEntrySchema>[] | undefined): AgentStartupProfile[] | undefined {
  if (!raw || raw.length === 0) {
    return undefined
  }
  const out: AgentStartupProfile[] = []
  for (const a of raw) {
    const displayName = (a.displayName ?? a.name)?.trim()
    const systemPrompt = (a.systemPrompt ?? a.personalityPrompt)?.trim()
    const avatar = a.avatar?.trim() || undefined
    if (!displayName && !avatar && !systemPrompt) {
      continue
    }
    out.push({
      displayName: displayName || undefined,
      avatar,
      systemPrompt: systemPrompt || undefined,
    })
  }
  return out.length ? out : undefined
}

export interface ResolvedServeOptions {
  port: number
  host: string
  minAgents: number
  maxAgents: number
  mode: 'default' | 'plan' | 'auto' | 'bypass'
  requireAssignAgentBeforeRun: boolean
  spawnClaudeOnNewAgent: boolean
  initialAgentProfiles?: AgentStartupProfile[]
  /** 实际读取的配置文件绝对路径；未找到则为 undefined */
  configPath?: string
}

function parsePositiveInt(v: string | undefined, fallback: number): number {
  if (v === undefined || v === '') return fallback
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : fallback
}

/**
 * 读取 `cline-config.json`（或环境变量 `CLINE_CONFIG` 指向的文件）。
 * 文件不存在或解析失败时返回 `null`，调用方使用 CLI/内置默认值。
 */
export function loadClineConfigFromDisk(cwd: string): { merged: Partial<ClineServeJson>; path: string } | null {
  const configPath = process.env.CLINE_CONFIG?.trim() || path.join(cwd, CLINE_CONFIG_DEFAULT_FILENAME)
  if (!existsSync(configPath)) {
    return null
  }
  try {
    const raw = readFileSync(configPath, 'utf8')
    const json = JSON.parse(raw) as unknown
    const parsed = rootSchema.safeParse(json)
    if (!parsed.success) {
      logger.warn(`${CLINE_CONFIG_DEFAULT_FILENAME} 校验失败，将忽略文件中的配置`, {
        path: configPath,
        issues: parsed.error.flatten(),
      })
      return null
    }
    return { merged: mergeEffectiveServe(parsed.data), path: configPath }
  } catch (e) {
    logger.warn(`${CLINE_CONFIG_DEFAULT_FILENAME} 读取失败，将忽略`, { path: configPath, error: String(e) })
    return null
  }
}

export interface ServeCliFlags {
  port?: string
  host?: string
  minAgents?: string
  maxAgents?: string
  mode?: string
  skipClaudeSpawn?: boolean
}

const DEFAULT_PORT = 8080
const DEFAULT_HOST = 'localhost'
/** 无配置文件且未配置 serve.agents 时默认不预创建 Agent */
const DEFAULT_MIN_AGENTS = 0
const DEFAULT_MAX_AGENTS = 16
const DEFAULT_MODE = 'default' as const

/**
 * 合并顺序：CLI 显式传入优先，否则 `cline-config.json`（根级与 `serve` 合并，`serve` 覆盖根级），再否则内置默认。
 */
export function resolveServeOptions(cwd: string, cli: ServeCliFlags): ResolvedServeOptions {
  const file = loadClineConfigFromDisk(cwd)
  const s = file?.merged

  const port = parsePositiveInt(cli.port, s?.port ?? DEFAULT_PORT)
  const host = (cli.host !== undefined && cli.host !== '' ? cli.host : s?.host) ?? DEFAULT_HOST
  let maxAgents = parsePositiveInt(cli.maxAgents, s?.maxAgents ?? DEFAULT_MAX_AGENTS)
  const modeRaw = (cli.mode !== undefined && cli.mode !== '' ? cli.mode : s?.mode) ?? DEFAULT_MODE
  const mode = (['default', 'plan', 'auto', 'bypass'] as const).includes(modeRaw as 'default')
    ? (modeRaw as 'default' | 'plan' | 'auto' | 'bypass')
    : DEFAULT_MODE

  const initialAgentProfiles = normalizeStartupAgents(s?.agents)

  let minAgents: number
  if (initialAgentProfiles && initialAgentProfiles.length > 0) {
    /** 配置了 serve.agents 时，minAgents 与预载条数一致（不超过 maxAgents） */
    minAgents = Math.min(initialAgentProfiles.length, maxAgents)
    if (initialAgentProfiles.length > maxAgents) {
      logger.info('serve.agents 条数大于 maxAgents，minAgents 与实际上限以 maxAgents 为准', {
        agents: initialAgentProfiles.length,
        maxAgents,
      })
    }
  } else {
    minAgents = parsePositiveInt(cli.minAgents, s?.minAgents ?? DEFAULT_MIN_AGENTS)
    if (minAgents > maxAgents) {
      logger.warn('minAgents 大于 maxAgents，已将 maxAgents 调整为与 minAgents 相同', { minAgents, maxAgents })
      maxAgents = minAgents
    }
  }

  const requireAssignAgentBeforeRun = s?.requireAssignAgentBeforeRun !== false
  let spawnClaudeOnNewAgent = s?.spawnClaudeOnNewAgent !== false
  if (cli.skipClaudeSpawn === true) {
    spawnClaudeOnNewAgent = false
  }

  return {
    port,
    host,
    minAgents,
    maxAgents,
    mode,
    requireAssignAgentBeforeRun,
    spawnClaudeOnNewAgent,
    initialAgentProfiles,
    configPath: file?.path,
  }
}
