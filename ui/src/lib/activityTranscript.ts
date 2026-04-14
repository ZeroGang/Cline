/** 与后端 `activity-transcript.ts` 中 `ACTIVITY_TRANSCRIPT_KEY` 一致 */
export const ACTIVITY_TRANSCRIPT_KEY = 'activityTranscript'

export type ActivityKind = 'user' | 'assistant' | 'tool' | 'tool_result' | 'system'

export interface ActivityLine {
  t: number
  kind: ActivityKind
  text: string
}

export function parseActivityTranscript(metadata: Record<string, unknown> | undefined): ActivityLine[] {
  if (!metadata) return []
  const raw = metadata[ACTIVITY_TRANSCRIPT_KEY]
  if (!Array.isArray(raw)) return []
  const out: ActivityLine[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    if (typeof o.text !== 'string') continue
    const k = o.kind
    if (k !== 'user' && k !== 'assistant' && k !== 'tool' && k !== 'tool_result' && k !== 'system') continue
    out.push({
      t: typeof o.t === 'number' ? o.t : 0,
      kind: k,
      text: o.text,
    })
  }
  return out
}
