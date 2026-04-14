import { Link } from 'react-router-dom'
import { useI18n } from '@/context/I18nContext'
import { useTheme } from '@/context/ThemeContext'

export function OfficeTopBar({
  lastUp,
  onNewTask,
  onRefresh,
  onSpawnAgent,
  detailPanelOpen,
  onOpenDetailPanel,
}: {
  lastUp: string
  onNewTask: () => void
  onRefresh: () => void
  onSpawnAgent: () => void
  detailPanelOpen: boolean
  onOpenDetailPanel: () => void
}) {
  const { t, lang, setLang } = useI18n()
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="office-top" id="officeTop">
      <div className="office-top-left">
        <h1 className="office-title">{t('officeTitle')}</h1>
        <p className="office-sub meta">
          <span>{t('officeSub')}</span>
          <span className="office-sub-sep">·</span>
          <span className="office-last-up" id="lastUp">
            {lastUp}
          </span>
        </p>
      </div>
      <div className="office-top-right">
        <select className="filter-select office-select" aria-label="project" defaultValue="">
          <option value="">{t('officeAllProj')}</option>
          <option>Kanvas Shell</option>
          <option>Demo / UI</option>
        </select>
        {!detailPanelOpen ? (
          <button type="button" className="btn btn-ghost office-head-btn" onClick={onOpenDetailPanel}>
            <i className="ph ph-sidebar-simple" /> <span>{t('officeOpenDetail')}</span>
          </button>
        ) : null}
        <button type="button" className="btn btn-accent office-head-btn" onClick={onSpawnAgent}>
          <i className="ph ph-user-plus" /> <span>{t('officeNewAgent')}</span>
        </button>
        <button type="button" className="btn btn-accent office-head-btn" id="officeBtnNewTask" onClick={onNewTask}>
          <i className="ph ph-plus-circle" /> <span>{t('officeNewTask')}</span>
        </button>
        <div className="office-bar-tools">
          <Link to="/settings" className="sidebar-btn office-bar-btn btn-ghost" title={t('navSettings')}>
            <i className="ph ph-gear-six" /> <span>{t('navSettings')}</span>
          </Link>
          <button
            type="button"
            className="sidebar-btn office-bar-btn"
            id="langBtn"
            title="Language"
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          >
            <i className="ph ph-translate" /> <span>{lang === 'zh' ? 'EN' : '中'}</span>
          </button>
          <button type="button" className="sidebar-btn office-bar-btn" id="themeBtn" title="Theme" onClick={toggleTheme}>
            <i className={theme === 'dark' ? 'ph ph-sun' : 'ph ph-moon'} />
          </button>
          <button type="button" className="sidebar-btn office-bar-btn" title="Refresh" onClick={onRefresh}>
            <i className="ph ph-arrows-clockwise" />
          </button>
        </div>
      </div>
    </header>
  )
}
