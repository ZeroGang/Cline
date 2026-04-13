import { Bot } from 'lucide-react'

export default function AgentsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Agents</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Manage and monitor your CLine agents</p>
      </div>

      <div className="flex h-64 items-center justify-center rounded-[var(--border-radius-lg)] border border-[var(--border-color)] bg-[var(--bg-card)]">
        <div className="text-center">
          <Bot className="mx-auto h-12 w-12 text-[var(--text-muted)]" />
          <p className="mt-3 text-sm text-[var(--text-muted)]">No agents connected</p>
          <p className="mt-1 text-xs text-[var(--text-disabled)]">Agents will appear here when they connect to the system</p>
        </div>
      </div>
    </div>
  )
}
