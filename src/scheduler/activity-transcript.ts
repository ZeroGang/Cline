import type { Message } from '../agent/types.js'
import type { AgentEvent, Task } from './types.js'

/** 看板「对话」区与 API 任务列表共用的执行记录（仅内存，重启清空） */
export const ACTIVITY_TRANSCRIPT_KEY = 'activityTranscript'

const MAX_LINES = 300
const MAX_LINE_CHARS = 2400

export interface ActivityTranscriptLine {
  t: number
  kind: 'user' | 'assistant' | 'tool' | 'tool_result' | 'system'
  text: string
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}

function readLines(md: Record<string, unknown> | undefined): ActivityTranscriptLine[] {
  const raw = md?.[ACTIVITY_TRANSCRIPT_KEY]
  if (!Array.isArray(raw)) return []
  const out: ActivityTranscriptLine[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    if (typeof o.text !== 'string' || typeof o.kind !== 'string') continue
    out.push({
      t: typeof o.t === 'number' ? o.t : Date.now(),
      kind: o.kind as ActivityTranscriptLine['kind'],
      text: o.text,
    })
  }
  return out
}

function assistantTextOnly(message: Message): string {
  if (typeof message.content === 'string') return message.content.trim()
  const parts: string[] = []
  for (const block of message.content) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      parts.push(block.text.trim())
    }
  }
  return parts.join('\n').trim()
}

function toolResultSummary(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const d = data as Record<string, unknown>
  if (d.result && typeof d.result === 'object') {
    const r = d.result as { output?: unknown; error?: boolean; metadata?: { errorMessage?: string } }
    if (r.error) {
      return `Error: ${r.metadata?.errorMessage ?? 'unknown'}`
    }
    if (typeof r.output === 'string') return r.output
    try {
      return JSON.stringify(r.output)
    } catch {
      return String(r.output)
    }
  }
  if (typeof d.toolUseId === 'string') {
    return '(interrupted)'
  }
  return ''
}

/** 将单条 Agent 事件追加到任务的 metadata（就地更新 task 对象） */
export function appendActivityTranscriptFromEvent(task: Task, event: AgentEvent): void {
  const ts = event.timestamp
  const md = { ...(task.metadata ?? {}) }
  const lines = readLines(md)

  const push = (kind: ActivityTranscriptLine['kind'], text: string) => {
    const t = clip(text.trim(), MAX_LINE_CHARS)
    if (!t) return
    lines.push({ t: ts, kind, text: t })
    while (lines.length > MAX_LINES) lines.shift()
  }

  switch (event.type) {
    case 'model_response': {
      const data = event.data as { message?: Message } | undefined
      const msg = data?.message
      if (!msg || msg.role !== 'assistant') break
      const text = assistantTextOnly(msg)
      if (text) push('assistant', text)
      break
    }
    case 'tool_start': {
      const data = event.data as { toolName?: string } | undefined
      const name = data?.toolName
      if (typeof name === 'string' && name) push('tool', `▶ ${name}`)
      break
    }
    case 'tool_result': {
      const data = event.data as { toolName?: string; toolUseId?: string } | undefined
      const name = typeof data?.toolName === 'string' ? data.toolName : 'tool'
      const summary = toolResultSummary(event.data)
      push('tool_result', summary ? `◀ ${name}: ${summary}` : `◀ ${name}`)
      break
    }
    case 'detention': {
      const data = event.data as { reason?: string } | undefined
      push('system', `⚠ ${data?.reason ?? 'detention'}`)
      break
    }
    case 'aborted': {
      const data = event.data as { reason?: string } | undefined
      push('system', `⏹ ${data?.reason ?? 'aborted'}`)
      break
    }
    case 'completed': {
      push('system', 'Task completed')
      break
    }
    default:
      break
  }

  md[ACTIVITY_TRANSCRIPT_KEY] = lines
  task.metadata = md
}

export function seedActivityTranscriptUserPrompt(task: Task, prompt: string): void {
  const md = { ...(task.metadata ?? {}) }
  const lines = readLines(md)
  const text = clip(prompt.trim(), MAX_LINE_CHARS)
  if (!text) return
  lines.push({ t: Date.now(), kind: 'user', text })
  while (lines.length > MAX_LINES) lines.shift()
  md[ACTIVITY_TRANSCRIPT_KEY] = lines
  task.metadata = md
}

export function appendActivityTranscriptFailure(task: Task, err: string): void {
  const md = { ...(task.metadata ?? {}) }
  const lines = readLines(md)
  const text = clip(`Failed: ${err.trim()}`, MAX_LINE_CHARS)
  lines.push({ t: Date.now(), kind: 'system', text })
  while (lines.length > MAX_LINES) lines.shift()
  md[ACTIVITY_TRANSCRIPT_KEY] = lines
  task.metadata = md
}
