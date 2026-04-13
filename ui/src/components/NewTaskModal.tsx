import { useEffect, useId, useRef, type FormEvent } from 'react'
import { useI18n } from '@/context/I18nContext'

export function NewTaskModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (content: string) => Promise<void>
}) {
  const { t } = useI18n()
  const formId = useId()
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    queueMicrotask(() => taRef.current?.focus())
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const content = String(fd.get('content') ?? '').trim()
    await onSubmit(content)
  }

  return (
    <div
      id="modalNewTask"
      className="modal-ov is-open"
      aria-hidden="false"
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <div className="modal-sheet modal-sheet--task" role="dialog" aria-modal="true" aria-labelledby={`${formId}-title`}>
        <div className="modal-head">
          <h2 className="modal-title" id={`${formId}-title`}>
            {t('modalNewTaskTitle')}
          </h2>
          <button type="button" className="modal-close" id="modalNewTaskClose" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <form id="formNewTask" className="modal-body modal-body--tight" onSubmit={handleSubmit}>
          <div className="modal-field">
            <label className="filter-group office-modal-field" htmlFor="modalNewTaskContent">
              <span className="modal-field-label">{t('modalTaskContent')}</span>
            </label>
            <textarea
              ref={taRef}
              id="modalNewTaskContent"
              className="office-textarea office-textarea--modal"
              name="content"
              rows={5}
              required
              autoComplete="off"
              maxLength={2000}
            />
          </div>
        </form>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" id="modalNewTaskCancel" onClick={onClose}>
            {t('modalCancel')}
          </button>
          <button type="submit" className="btn btn-accent" form="formNewTask">
            {t('modalSubmit')}
          </button>
        </div>
      </div>
    </div>
  )
}
