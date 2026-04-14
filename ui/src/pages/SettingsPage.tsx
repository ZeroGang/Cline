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
          <div className="settings-subcard-title">cline-config.json</div>
          <p className="settings-hint">
            仓库根目录已提供 <span className="mono">cline-config.json</span>（也可在运行 <span className="mono">cline serve</span> 的目录单独放置）。
            用 <span className="mono">serve</span> 段配置预创建 Agent 等，例如{' '}
            <span className="mono">serve.minAgents</span>（无 <span className="mono">agents</span> 时生效，默认 0）、
            <span className="mono">serve.maxAgents</span>、
            <span className="mono">serve.port</span>、<span className="mono">serve.agents</span>（非空时 <span className="mono">minAgents</span> 等于预载条数且不超过 maxAgents；启动预载：{' '}
            <span className="mono">displayName</span>/<span className="mono">name</span>、
            <span className="mono">systemPrompt</span>/<span className="mono">personalityPrompt</span>、可选 <span className="mono">avatar</span>；Agent ID 由服务端固定为「agent-」加会话端口号，与拉起 Claude Code 时注入的环境变量{' '}
            <span className="mono">CLINE_CLAUDE_CODE_SESSION_PORT</span> 一致，不可在 JSON 中配置 id）、
            <span className="mono">requireAssignAgentBeforeRun</span>、
            <span className="mono">spawnClaudeOnNewAgent</span>。CLI 参数优先于文件。环境变量{' '}
            <span className="mono">CLINE_CONFIG</span> 可指向其它路径的 JSON。
          </p>
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
