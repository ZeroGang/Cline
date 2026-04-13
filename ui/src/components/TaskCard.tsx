import type { BoardTask } from '@/lib/boardMap'
import { badgeClassesForTask } from '@/lib/boardMap'
import type { ApiAgent } from '@/lib/api'
import { useI18n } from '@/context/I18nContext'

export function TaskCard({
  task,
  agents,
  selected,
  onSelect,
  onAction,
  onAssignChange,
}: {
  task: BoardTask
  agents: ApiAgent[]
  selected: boolean
  onSelect: () => void
  onAction: (act: 'start' | 'cancel' | 'done') => void
  onAssignChange: (agent: string) => void
}) {
  const { t } = useI18n()
  const col = task.column

  return (
    <article
      className={`office-task${selected ? ' is-selected' : ''}`}
      tabIndex={0}
      role="button"
      data-id={task.id}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('.office-task-noselect')) return
        onSelect()
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        if ((e.target as HTMLElement).closest('.office-task-noselect')) return
        e.preventDefault()
        onSelect()
      }}
    >
      <div className="office-task-top">
        <div className="office-task-title">{task.title}</div>
        <span className="office-task-agent mono">{task.agent}</span>
      </div>
      {task.subLabel ? <div className="office-task-sub mono">{task.subLabel}</div> : null}
      {task.logLine ? <div className="office-task-log mono">{task.logLine}</div> : null}
      <div className={`office-task-row${col === 'progress' ? ' office-task-row--split' : ''}`}>
        <span className={badgeClassesForTask(task)}>{task.status}</span>
        <div className="office-task-actions">
          {col === 'progress' ? (
            <>
              <button
                type="button"
                className="btn btn-sm office-task-action office-task-noselect"
                onClick={() => onAction('cancel')}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-accent office-task-action office-task-noselect"
                onClick={() => onAction('done')}
              >
                Done
              </button>
            </>
          ) : null}
          {col === 'input' ? (
            <button
              type="button"
              className="btn btn-sm btn-accent office-task-action office-task-noselect"
              onClick={() => onAction('start')}
            >
              补充
            </button>
          ) : null}
        </div>
      </div>
      {col === 'backlog' ? (
        <div className="office-task-assign office-task-noselect">
          <label className="office-task-assign-label" htmlFor={`assign-${task.id}`}>
            <span>{t('officeAssignAgent')}</span>
          </label>
          <p className="meta office-task-assign-hint">{t('officeAssignHint')}</p>
          <select
            id={`assign-${task.id}`}
            className="filter-select office-task-select"
            value={task.assignAgent}
            onChange={(e) => onAssignChange(e.target.value)}
          >
            <option value="">{t('officePickNone')}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName ?? a.id}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </article>
  )
}
