import { Link } from 'react-router-dom'
import { useI18n } from '@/context/I18nContext'

export default function SettingsPage() {
  const { t } = useI18n()
  return (
    <main className="main main--wide settings-page">
      <div className="card sec" style={{ maxWidth: 960 }}>
        <div className="sec-header">
          <div>
            <h1 className="office-title" style={{ marginBottom: 8 }}>
              {t('settingsTitle')}
            </h1>
            <p className="meta">{t('settingsIntro')}</p>
          </div>
          <Link to="/" className="btn btn-ghost office-head-btn">
            {t('settingsBack')}
          </Link>
        </div>
        <div className="settings-subcard">
          <div className="settings-subcard-title">API</div>
          <p className="settings-hint">
            开发模式下请求通过 Vite 代理转发到 <span className="mono">http://localhost:8080</span>。
            若终端出现 <span className="mono">ECONNREFUSED</span> 或 <span className="mono">http proxy error: /api/…</span>，说明本机
            8080 上没有 API：请在仓库根目录先执行 <span className="mono">npm run build && npm run serve</span>，或一条命令{' '}
            <span className="mono">npm run dev:stack</span>（会编译并同时起 API 与 UI）。
          </p>
        </div>
      </div>
    </main>
  )
}
