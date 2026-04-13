/**
 * 监控面板样式：与「搞着玩/Cline」app/style.css 的 Zinc 灰 + 翠绿主题对齐（精简子集）。
 */
export const MONITOR_DASHBOARD_CSS = `
:root {
  --font: 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
  --mono: 'JetBrains Mono', 'SF Mono', monospace;
  --space-xs: 4px; --space-sm: 8px; --space-md: 16px; --space-lg: 24px; --space-xl: 32px; --space-2xl: 48px;
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px;
}
[data-theme="dark"] {
  --bg-0: #0c0f14; --bg-1: #13161d; --bg-2: #1a1e27; --bg-3: #242936; --bg-4: #333a4a;
  --text-0: #e8ecf1; --text-1: #9ca3b0; --text-2: #6b7280;
  --accent: #34d399; --accent-hover: #6ee7b7; --accent-bg: rgba(52,211,153,0.10); --accent-glow: rgba(52,211,153,0.15);
  --accent-2: #10b981; --accent-grad: linear-gradient(135deg, #059669, #10b981, #34d399);
  --green: #4ade80; --red: #f87171; --orange: #fbbf24; --blue: #60a5fa;
  --green-bg: rgba(74,222,128,0.12); --red-bg: rgba(248,113,113,0.12);
  --border: rgba(148,163,184,0.07); --border-l: rgba(148,163,184,0.035);
  --card-bg: rgba(19,22,29,0.88); --card-border: rgba(148,163,184,0.07);
  --card-glow: 0 0 0 1px rgba(52,211,153,0.06);
  --shadow-sm: 0 1px 4px rgba(0,0,0,0.45);
  --shadow-md: 0 8px 32px rgba(0,0,0,0.55);
  --scroll: rgba(148,163,184,0.1);
}
*,*::before,*::after { margin:0; padding:0; box-sizing:border-box; }
body {
  font-family: var(--font);
  background: #0a0e17;
  background-image:
    radial-gradient(ellipse 70% 50% at 30% -10%, rgba(52,211,153,0.07) 0%, transparent 55%),
    radial-gradient(ellipse 50% 40% at 90% 90%, rgba(192,132,252,0.05) 0%, transparent 50%);
  background-attachment: fixed;
  color: var(--text-0);
  min-height: 100vh;
  line-height: 1.5;
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
}
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-thumb { background: var(--scroll); border-radius: 4px; }

.main {
  margin: 0 auto;
  min-height: 100vh;
  padding: var(--space-lg) var(--space-xl) var(--space-2xl);
  max-width: 1200px;
  position: relative;
}
.main::before {
  content: '';
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: var(--accent-grad);
  opacity: 0.5;
  z-index: 50;
}
.main--wide { max-width: none; padding-left: var(--space-lg); padding-right: var(--space-lg); }

.monitor-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
  margin-bottom: var(--space-lg);
}
.monitor-title {
  font: 700 22px var(--font);
  letter-spacing: -0.02em;
  color: var(--text-0);
  margin: 0 0 4px;
}
.monitor-sub {
  margin: 0;
  max-width: 42rem;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.45;
}
.meta { font: 400 11px var(--mono); color: var(--text-2); }

.conn-pill {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 20px;
  font: 600 11px var(--font);
  border: 1px solid var(--border);
  background: var(--card-bg);
  backdrop-filter: blur(12px);
  transition: border-color 0.2s, color 0.2s, box-shadow 0.2s;
}
.conn-pill .dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--text-2);
}
.conn-pill.connected {
  border-color: rgba(74,222,128,0.35);
  color: var(--green);
  box-shadow: 0 0 12px rgba(52,211,153,0.08);
}
.conn-pill.connected .dot {
  background: var(--green);
  animation: pulse 2s ease-in-out infinite;
}
.conn-pill.disconnected {
  border-color: rgba(248,113,113,0.35);
  color: var(--red);
}
.conn-pill.disconnected .dot { background: var(--red); }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }

.mon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--space-md);
}

.card {
  background: var(--card-bg);
  backdrop-filter: blur(24px);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-lg);
  position: relative;
  overflow: hidden;
  transition: box-shadow 0.35s, border-color 0.35s, transform 0.35s;
}
.card::after {
  content: '';
  position: absolute;
  top: 0; left: 10%; right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(52,211,153,0.15), transparent);
  pointer-events: none;
}
.card:hover {
  box-shadow: var(--shadow-md), var(--card-glow);
  border-color: rgba(52,211,153,0.12);
  transform: translateY(-2px);
}

.sec-title {
  font: 600 15px var(--font);
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: var(--space-md);
  color: var(--text-0);
}
.sec-title i { color: var(--accent); font-size: 16px; }

.stat-rows { display: flex; flex-direction: column; gap: 0; }
.stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-l);
}
.stat:last-child { border-bottom: none; }
.stat-label { color: var(--text-2); font: 500 12px var(--font); }
.stat-value { font: 700 14px var(--mono); color: var(--text-0); }

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 20px;
  font: 600 10px var(--font);
}
.status-running { background: var(--green-bg); color: var(--green); border: 1px solid rgba(74,222,128,0.25); }
.status-stopped { background: var(--red-bg); color: var(--red); border: 1px solid rgba(248,113,113,0.25); }
.status-idle { background: rgba(96,165,250,0.12); color: var(--blue); border: 1px solid rgba(96,165,250,0.22); }
.status-busy { background: rgba(251,191,36,0.12); color: var(--orange); border: 1px solid rgba(251,191,36,0.22); }
.status-error { background: var(--red-bg); color: var(--red); border: 1px solid rgba(248,113,113,0.25); }

.agent-list, .alert-list, .event-log {
  max-height: 400px;
  overflow-y: auto;
}
.agent-item {
  padding: 12px 14px;
  margin-bottom: 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-l);
  background: var(--bg-1);
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}
.agent-item:last-child { margin-bottom: 0; }
.agent-item:hover {
  border-color: rgba(52,211,153,0.18);
  box-shadow: 0 2px 14px rgba(0,0,0,0.12);
  transform: translateY(-1px);
}
.agent-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.agent-item-id {
  font: 600 13px var(--font);
  color: var(--text-0);
}
.agent-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  font: 400 11px var(--mono);
  color: var(--text-2);
}

.alert-item {
  padding: 12px 14px;
  margin-bottom: 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-1);
  border: 1px solid var(--border-l);
  border-left: 3px solid var(--text-2);
}
.alert-item:last-child { margin-bottom: 0; }
.alert-warning { border-left-color: var(--orange); }
.alert-critical { border-left-color: var(--red); }
.alert-info { border-left-color: var(--blue); }
.alert-title { font: 600 13px var(--font); color: var(--text-0); margin-bottom: 4px; }
.alert-message { font: 400 12px var(--font); color: var(--text-2); line-height: 1.45; }

.event-log {
  font-family: var(--mono);
  font-size: 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-2);
}
.event-item {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-l);
}
.event-item:last-child { border-bottom: none; }
.event-type { color: var(--accent); font-weight: 600; }
.event-time { color: var(--text-2); margin-left: 10px; }

.empty-hint {
  text-align: center;
  padding: 28px 12px;
  color: var(--text-2);
  font: 400 13px var(--font);
}

@media (max-width: 600px) {
  .main { padding: var(--space-md); }
  .monitor-title { font-size: 18px; }
}
`
