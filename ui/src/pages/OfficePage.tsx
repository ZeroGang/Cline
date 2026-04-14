import { useCallback, useEffect, useMemo, useState } from 'react'
import { OfficeTopBar } from '@/components/OfficeTopBar'
import { NewTaskModal } from '@/components/NewTaskModal'
import { NewAgentModal } from '@/components/NewAgentModal'
import { TaskCard } from '@/components/TaskCard'
import { useI18n } from '@/context/I18nContext'
import { cancelTask, createTask, fetchAgents, fetchTasks, spawnAgent, updateTask, type ApiAgent, type ApiTask } from '@/lib/api'
import { parseActivityTranscript, type ActivityKind } from '@/lib/activityTranscript'
import { taskToBoard, type BoardTask } from '@/lib/boardMap'
import { notyf } from '@/lib/toast'

const COLS = ['backlog', 'progress', 'input', 'done'] as const
type ColKey = (typeof COLS)[number]

const COL_I18N: Record<ColKey, string> = {
  backlog: 'officeColBacklog',
  progress: 'officeColProgress',
  input: 'officeColInput',
  done: 'officeColDone',
}

const AGENT_ICO = ['si-a', 'si-b', 'si-p'] as const
const AGENT_PH = ['ph-code', 'ph-seal-check', 'ph-brain'] as const

function agentBadgeClass(status: ApiAgent['status']): string {
  if (status === 'busy') return 'badge badge-success'
  if (status === 'error') return 'badge office-badge-warn'
  return 'badge office-badge-idle'
}

function agentStatusKey(status: ApiAgent['status']): string {
  if (status === 'busy') return 'officeAgentStBusy'
  if (status === 'error') return 'officeAgentStErr'
  if (status === 'offline') return 'officeAgentStOff'
  return 'officeAgentStIdle'
}

function isAvatarHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim())
}

/** 任务信息栏：仅展示池内 Agent 的显示名称；未分配、无显示名或不在列表中均为「—」。 */
function taskInfoAgentDisplayName(task: BoardTask, agents: ApiAgent[]): string {
  const aid = task.assignAgent?.trim()
  if (!aid) return '—'
  const a = agents.find((x) => x.id === aid)
  const name = a?.displayName?.trim()
  return name || '—'
}

function activityKindLabel(kind: ActivityKind, t: (k: string) => string): string {
  if (kind === 'user') return t('officeActUser')
  if (kind === 'assistant') return t('officeActAssistant')
  if (kind === 'tool') return t('officeActTool')
  if (kind === 'tool_result') return t('officeActToolResult')
  return t('officeActSystem')
}

export default function OfficePage() {
  const { t, lang } = useI18n()
  const [apiTasks, setApiTasks] = useState<ApiTask[]>([])
  const [apiAgents, setApiAgents] = useState<ApiAgent[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [agentModalOpen, setAgentModalOpen] = useState(false)
  const [detailPanelOpen, setDetailPanelOpen] = useState(true)
  const [lastUp, setLastUp] = useState('')

  const boardTasks = useMemo(() => apiTasks.map(taskToBoard), [apiTasks])

  const byCol = useMemo(() => {
    const m: Record<ColKey, BoardTask[]> = { backlog: [], progress: [], input: [], done: [] }
    for (const bt of boardTasks) {
      const c = (COLS as readonly string[]).includes(bt.column) ? (bt.column as ColKey) : 'backlog'
      m[c].push(bt)
    }
    return m
  }, [boardTasks])

  const selected = useMemo(
    () => boardTasks.find((x) => x.id === selectedId) ?? null,
    [boardTasks, selectedId]
  )

  const activityLines = useMemo(
    () => (selected ? parseActivityTranscript(selected.raw.metadata) : []),
    [selected]
  )

  const refresh = useCallback(async () => {
    try {
      const list = await fetchTasks()
      setApiTasks(list)
      try {
        setApiAgents(await fetchAgents())
      } catch {
        setApiAgents([])
      }
      const loc = lang === 'zh' ? 'zh-CN' : 'en-US'
      setLastUp(
        t('updated') +
          new Date().toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      )
      setSelectedId((prev) => {
        if (prev && list.some((x) => x.id === prev)) return prev
        return list[0]?.id ?? null
      })
    } catch (e) {
      console.error(e)
      notyf.error(
        lang === 'zh' ? '无法加载任务（请确认后端 8080 与 /api/tasks）' : 'Failed to load tasks (check API on :8080)'
      )
      setApiTasks([])
      setApiAgents([])
      setSelectedId(null)
    }
  }, [lang, t])

  /** 运行中任务定时拉取，便于 Conversation 展示 Agent 实时输出 */
  useEffect(() => {
    if (!selected || selected.raw.status !== 'running') return
    const tick = window.setInterval(() => {
      void refresh()
    }, 2500)
    return () => window.clearInterval(tick)
  }, [selected?.id, selected?.raw.status, refresh])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await fetchTasks()
        if (cancelled) return
        setApiTasks(list)
        try {
          if (!cancelled) setApiAgents(await fetchAgents())
        } catch {
          if (!cancelled) setApiAgents([])
        }
        const loc = lang === 'zh' ? 'zh-CN' : 'en-US'
        setLastUp(
          t('updated') +
            new Date().toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        )
        setSelectedId((prev) => {
          if (prev && list.some((x) => x.id === prev)) return prev
          return list[0]?.id ?? null
        })
      } catch (e) {
        if (cancelled) return
        console.error(e)
        notyf.error(
          lang === 'zh' ? '无法加载任务（请确认后端 8080 与 /api/tasks）' : 'Failed to load tasks (check API on :8080)'
        )
        setApiTasks([])
        setApiAgents([])
        setSelectedId(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [lang, t])

  async function handleNewTask(content: string) {
    if (!content.trim()) {
      notyf.error(lang === 'zh' ? '请输入内容' : 'Please enter content')
      return
    }
    try {
      const task = await createTask(content.trim())
      setModalOpen(false)
      notyf.success(lang === 'zh' ? '任务已创建' : 'Task created')
      selectTaskId(task.id)
      await refresh()
    } catch {
      notyf.error(lang === 'zh' ? '创建失败' : 'Create failed')
    }
  }

  async function handleAssign(task: BoardTask, agent: string) {
    try {
      await updateTask(task.id, {
        metadata: { ...(task.raw.metadata ?? {}), assignAgent: agent },
      })
      await refresh()
    } catch {
      notyf.error(lang === 'zh' ? '分配失败' : 'Assign failed')
    }
  }

  async function handleAction(task: BoardTask, act: 'start' | 'cancel' | 'done') {
    try {
      if (act === 'cancel') {
        await cancelTask(task.id)
        notyf.success(lang === 'zh' ? '已取消' : 'Cancelled')
      } else if (act === 'done') {
        await updateTask(task.id, { status: 'completed' })
        notyf.success(lang === 'zh' ? '已完成' : 'Done')
      } else {
        await updateTask(task.id, { status: 'running' })
        notyf.success(lang === 'zh' ? '已开始' : 'Started')
      }
      await refresh()
    } catch {
      notyf.error(lang === 'zh' ? '操作失败' : 'Action failed')
    }
  }

  async function handleSpawnAgentSubmit(values: {
    displayName: string
    avatar: string
    personalityPrompt: string
    projectRoot: string
  }) {
    try {
      await spawnAgent({
        displayName: values.displayName,
        avatar: values.avatar || undefined,
        personalityPrompt: values.personalityPrompt || undefined,
        projectRoot: values.projectRoot.trim() || undefined,
      })
      notyf.success(t('officeSpawnOk'))
      setAgentModalOpen(false)
      await refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/max capacity|Cannot spawn|pool_full|501/i.test(msg)) {
        notyf.error(t('officeSpawnFull'))
      } else {
        notyf.error(lang === 'zh' ? '添加 Agent 失败' : 'Failed to add agent')
      }
    }
  }

  /** 选中任务并打开右侧详情栏（关闭栏不会清空选中，仅隐藏面板） */
  function selectTaskId(id: string) {
    setSelectedId(id)
    setDetailPanelOpen(true)
  }

  function sendDemo() {
    const v = (document.getElementById('officeSendInput') as HTMLTextAreaElement | null)?.value?.trim()
    if (!v) {
      notyf.error(lang === 'zh' ? '请输入内容' : 'Enter a message')
      return
    }
    notyf.success(lang === 'zh' ? '已发送（演示）' : 'Sent (demo)')
    const input = document.getElementById('officeSendInput') as HTMLTextAreaElement | null
    if (input) input.value = ''
  }

  return (
    <>
      <main className="main main--wide" id="main">
        <div id="officeRoot" className="office-wrap card sec">
          <OfficeTopBar
            lastUp={lastUp}
            onNewTask={() => setModalOpen(true)}
            onRefresh={() => {
              void refresh()
              notyf.success(lang === 'zh' ? '已刷新' : 'Refreshed')
            }}
            onSpawnAgent={() => setAgentModalOpen(true)}
            detailPanelOpen={detailPanelOpen}
            onOpenDetailPanel={() => setDetailPanelOpen(true)}
          />

          <div className={`office-grid${detailPanelOpen ? '' : ' office-grid--no-detail'}`}>
            <aside className="office-pane office-agents" aria-label="agents">
              <div className="office-pane-head">
                <span className="sec-title office-pane-title">
                  <i className="ph ph-users-three" /> <span>{t('officeAgents')}</span>
                </span>
              </div>
              <div className="office-agent-list">
                {apiAgents.length === 0 ? (
                  <div className="office-placeholder meta">{t('officePoolEmpty')}</div>
                ) : (
                  apiAgents.map((agent, i) => (
                    <article key={agent.id} className="office-agent">
                      <div className="office-agent-top">
                        <div className={`office-agent-ico ${AGENT_ICO[i % AGENT_ICO.length]}`}>
                          {agent.avatar && isAvatarHttpUrl(agent.avatar) ? (
                            <img className="office-agent-avatar-img" src={agent.avatar} alt="" />
                          ) : agent.avatar ? (
                            <span className="office-agent-emoji">{agent.avatar}</span>
                          ) : (
                            <i className={`ph ${AGENT_PH[i % AGENT_PH.length]}`} />
                          )}
                        </div>
                        <div className="office-agent-meta">
                          <div className="office-agent-titleblock">
                            <div className="office-agent-name">{agent.displayName ?? agent.id}</div>
                            {agent.displayName ? (
                              <div className="office-agent-id mono meta">{agent.id}</div>
                            ) : null}
                          </div>
                          <span className={agentBadgeClass(agent.status)}>{t(agentStatusKey(agent.status))}</span>
                        </div>
                      </div>
                      <p className="office-agent-desc">{t('officeAgentRuntime')}</p>
                      <div className="office-agent-foot meta">
                        {agent.currentTask
                          ? `${lang === 'zh' ? '任务' : 'Task'}: ${agent.currentTask}`
                          : lang === 'zh'
                            ? '无当前任务'
                            : 'No current task'}
                        {' · '}
                        {lang === 'zh' ? '回合' : 'Turns'} {agent.totalQueries} · Token {agent.totalTokens}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </aside>

            <section className="office-pane office-kanban" aria-label="kanban">
              <div className="office-pane-head office-pane-head--kanban">
                <span className="sec-title office-pane-title">
                  <i className="ph ph-columns" /> <span>{t('officeKanban')}</span>
                </span>
              </div>
              <div className="office-board" id="officeBoard">
                {COLS.map((key) => (
                  <div key={key} className="office-col" data-col={key}>
                    <div className="office-col-head">
                      <span
                        className={
                          key === 'backlog'
                            ? 'office-col-dot office-col-dot--muted'
                            : key === 'progress'
                              ? 'office-col-dot office-col-dot--blue'
                              : key === 'input'
                                ? 'office-col-dot office-col-dot--orange'
                                : 'office-col-dot office-col-dot--green'
                        }
                      />
                      <span className="office-col-title">{t(COL_I18N[key])}</span>
                      <span className="office-col-count" data-col-count={key}>
                        {byCol[key].length}
                      </span>
                    </div>
                    <div className="office-col-body" data-col-body={key}>
                      {byCol[key].map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          agents={apiAgents}
                          selected={task.id === selectedId}
                          onSelect={() => selectTaskId(task.id)}
                          onAction={(act) => void handleAction(task, act)}
                          onAssignChange={(agent) => void handleAssign(task, agent)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {detailPanelOpen ? (
            <aside className="office-pane office-detail" aria-label="detail">
              <div className="office-detail-head">
                <div className="office-detail-head-top">
                  <div className="office-detail-head-main">
                    <div className="office-detail-titlewrap">
                      <h2 className="office-detail-h" id="officeDetailTitle">
                        {selected ? selected.title : apiTasks.length === 0 ? t('officeNoTasksDetail') : t('officeDetailEmptyTitle')}
                      </h2>
                      <p
                        className={
                          selected
                            ? 'meta office-detail-hint office-detail-hint--agent'
                            : 'meta office-detail-hint'
                        }
                      >
                        {selected
                          ? taskInfoAgentDisplayName(selected, apiAgents)
                          : apiTasks.length === 0
                            ? t('officeDetail')
                            : t('officeDetailPickOne')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost office-detail-close office-task-noselect"
                    title={t('officeCloseDetail')}
                    aria-label={t('officeCloseDetail')}
                    onClick={() => {
                      /* 仅收起侧栏，保留看板上的任务选中态 */
                      setDetailPanelOpen(false)
                    }}
                  >
                    <i className="ph ph-x" />
                  </button>
                </div>
                {selected ? (
                  <div className="office-detail-overview-card" id="officeDetailOverview">
                    <div className="office-detail-overview-cap">{t('officeTaskOverview')}</div>
                    <dl className="office-detail-overview-kv">
                      <div>
                        <dt>{t('officeOvState')}</dt>
                        <dd>{selected.raw.status}</dd>
                      </div>
                      <div>
                        <dt>{t('officeOvProject')}</dt>
                        <dd>{selected.project}</dd>
                      </div>
                      <div>
                        <dt>{t('officeOvCreated')}</dt>
                        <dd className="mono">
                          {new Date(selected.raw.createdAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
                            dateStyle: 'short',
                            timeStyle: 'medium',
                          })}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('officeOvUpdated')}</dt>
                        <dd className="mono">
                          {new Date(
                            selected.raw.updatedAt ??
                              selected.raw.completedAt ??
                              selected.raw.startedAt ??
                              selected.raw.createdAt
                          ).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
                            dateStyle: 'short',
                            timeStyle: 'medium',
                          })}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ) : null}
              </div>
              <div className="office-detail-body">
                <div className="office-detail-block">
                  <div className="office-detail-h2">{t('officeConv')}</div>
                  {activityLines.length === 0 ? (
                    <div className="office-placeholder meta">{t('officeNoTranscript')}</div>
                  ) : (
                    <div className="office-transcript" role="log" aria-live="polite">
                      {activityLines.map((line, i) => (
                        <div
                          key={`${line.t}-${i}`}
                          className={`office-transcript-row office-transcript-row--${line.kind}`}
                        >
                          <div className="office-transcript-meta">
                            <span className="office-transcript-kind">{activityKindLabel(line.kind, t)}</span>
                            <span className="office-transcript-time mono">
                              {new Date(line.t).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </span>
                          </div>
                          <pre className="office-transcript-text">{line.text}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="office-detail-block">
                  <div className="office-detail-h2">{t('officeEvents')}</div>
                  <div className="office-placeholder meta">{t('officeNoEvents')}</div>
                </div>
              </div>
              <div className="office-detail-compose">
                <textarea
                  className="office-textarea"
                  id="officeSendInput"
                  rows={3}
                  autoComplete="off"
                  placeholder={t('officeSendPh')}
                />
                <button type="button" className="btn btn-accent office-send" id="officeSendBtn" onClick={sendDemo}>
                  <span>{t('officeSend')}</span>
                </button>
              </div>
            </aside>
            ) : null}
          </div>
        </div>
      </main>

      <NewTaskModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={handleNewTask} />
      <NewAgentModal
        open={agentModalOpen}
        onClose={() => setAgentModalOpen(false)}
        onSubmit={(v) => handleSpawnAgentSubmit(v)}
      />
    </>
  )
}
