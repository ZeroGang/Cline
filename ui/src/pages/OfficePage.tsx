import { useCallback, useEffect, useMemo, useState } from 'react'
import { OfficeTopBar } from '@/components/OfficeTopBar'
import { NewTaskModal } from '@/components/NewTaskModal'
import { NewAgentModal } from '@/components/NewAgentModal'
import { TaskCard } from '@/components/TaskCard'
import { useI18n } from '@/context/I18nContext'
import { cancelTask, createTask, fetchAgents, fetchTasks, spawnAgent, updateTask, type ApiAgent, type ApiTask } from '@/lib/api'
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

export default function OfficePage() {
  const { t, lang } = useI18n()
  const [apiTasks, setApiTasks] = useState<ApiTask[]>([])
  const [apiAgents, setApiAgents] = useState<ApiAgent[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [agentModalOpen, setAgentModalOpen] = useState(false)
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
      setSelectedId(task.id)
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

  async function handleSpawnAgentSubmit(values: { displayName: string; avatar: string; personalityPrompt: string }) {
    try {
      await spawnAgent({
        displayName: values.displayName,
        avatar: values.avatar || undefined,
        personalityPrompt: values.personalityPrompt || undefined,
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
          />

          <div className="office-grid">
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
                          onSelect={() => setSelectedId(task.id)}
                          onAction={(act) => void handleAction(task, act)}
                          onAssignChange={(agent) => void handleAssign(task, agent)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <aside className="office-pane office-detail" aria-label="detail">
              <div className="office-detail-head">
                <div className="office-detail-titlewrap">
                  <h2 className="office-detail-h" id="officeDetailTitle">
                    {selected?.title ?? t('officeNoTasksDetail')}
                  </h2>
                  <p className="meta office-detail-hint">{t('officeDetail')}</p>
                </div>
              </div>
              <div className="office-detail-body">
                <div className="office-detail-block">
                  <div className="office-detail-h2">{t('officeOverview')}</div>
                  <dl className="office-kv">
                    <div>
                      <dt>Status</dt>
                      <dd id="officeDetailStatus">{selected?.status ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Run</dt>
                      <dd id="officeDetailRun" className="mono">
                        {selected?.run ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Project</dt>
                      <dd id="officeDetailProject">{selected?.project ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Path</dt>
                      <dd id="officeDetailPath" className="mono">
                        {selected?.path ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Price</dt>
                      <dd id="officeDetailPrice">{selected?.price ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd id="officeDetailCreated" className="mono">
                        {selected?.created ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Updated</dt>
                      <dd id="officeDetailUpdated" className="mono">
                        {selected?.updated ?? '—'}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="office-detail-block">
                  <div className="office-detail-h2">{t('officeConv')}</div>
                  <div className="office-placeholder meta">{t('officeNoTranscript')}</div>
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
