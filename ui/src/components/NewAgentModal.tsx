import { useEffect, useId, useState, type FormEvent } from 'react'
import { useI18n } from '@/context/I18nContext'

const PRESET_AVATARS = ['🧑', '🤖', '🦊', '🐱', '🚀', '📎', '🧠', '✨', '🛠️', '🎯'] as const

export type NewAgentFormValues = {
  displayName: string
  avatar: string
  personalityPrompt: string
}

export function NewAgentModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (values: NewAgentFormValues) => Promise<void>
}) {
  const { t } = useI18n()
  const formId = useId()
  const [avatar, setAvatar] = useState<string>(PRESET_AVATARS[0])
  const [customAvatar, setCustomAvatar] = useState('')

  useEffect(() => {
    if (!open) return
    setAvatar(PRESET_AVATARS[0])
    setCustomAvatar('')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const displayName = String(fd.get('displayName') ?? '').trim()
    const personalityPrompt = String(fd.get('personalityPrompt') ?? '').trim()
    const fromCustom = customAvatar.trim()
    const resolvedAvatar = fromCustom || avatar.trim()
    await onSubmit({
      displayName,
      avatar: resolvedAvatar,
      personalityPrompt,
    })
  }

  return (
    <div
      className="modal-ov is-open"
      aria-hidden="false"
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <div
        className="modal-sheet modal-sheet--agent"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-title`}
      >
        <div className="modal-head">
          <h2 className="modal-title" id={`${formId}-title`}>
            {t('modalNewAgentTitle')}
          </h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <form id={`${formId}-form`} className="modal-body modal-body--tight" onSubmit={handleSubmit}>
          <div className="modal-field">
            <label className="filter-group office-modal-field" htmlFor={`${formId}-name`}>
              <span className="modal-field-label">{t('modalAgentName')}</span>
            </label>
            <input
              id={`${formId}-name`}
              name="displayName"
              type="text"
              className="office-input"
              required
              maxLength={128}
              autoComplete="off"
              placeholder={t('modalAgentNamePh')}
            />
          </div>
          <div className="modal-field">
            <span className="modal-field-label">{t('modalAgentAvatar')}</span>
            <div className="office-avatar-picks" role="group" aria-label={t('modalAgentAvatar')}>
              {PRESET_AVATARS.map((emo) => (
                <button
                  key={emo}
                  type="button"
                  className={`office-avatar-pick${avatar === emo && !customAvatar.trim() ? ' is-selected' : ''}`}
                  onClick={() => {
                    setAvatar(emo)
                    setCustomAvatar('')
                  }}
                >
                  {emo}
                </button>
              ))}
            </div>
            <label className="filter-group office-modal-field office-avatar-custom" htmlFor={`${formId}-avatar-url`}>
              <span className="modal-field-label meta">{t('modalAgentAvatarCustom')}</span>
            </label>
            <input
              id={`${formId}-avatar-url`}
              type="text"
              className="office-input"
              value={customAvatar}
              onChange={(e) => setCustomAvatar(e.target.value)}
              maxLength={2048}
              autoComplete="off"
              placeholder={t('modalAgentAvatarCustomPh')}
            />
          </div>
          <div className="modal-field">
            <label className="filter-group office-modal-field" htmlFor={`${formId}-persona`}>
              <span className="modal-field-label">{t('modalAgentPersona')}</span>
            </label>
            <textarea
              id={`${formId}-persona`}
              name="personalityPrompt"
              className="office-textarea office-textarea--modal"
              rows={5}
              maxLength={32000}
              autoComplete="off"
              placeholder={t('modalAgentPersonaPh')}
            />
          </div>
        </form>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('modalCancel')}
          </button>
          <button type="submit" className="btn btn-accent" form={`${formId}-form`}>
            {t('modalAgentSubmit')}
          </button>
        </div>
      </div>
    </div>
  )
}
