import { ScrollText } from 'lucide-react'

export default function LogsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Logs</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">View system and task logs</p>
      </div>

      <div className="flex h-64 items-center justify-center rounded-[var(--border-radius-lg)] border border-[var(--border-color)] bg-[var(--bg-card)]">
        <div className="text-center">
          <ScrollText className="mx-auto h-12 w-12 text-[var(--text-muted)]" />
          <p className="mt-3 text-sm text-[var(--text-muted)]">No logs available</p>
          <p className="mt-1 text-xs text-[var(--text-disabled)]">Logs will appear here when tasks are running</p>
        </div>
      </div>
    </div>
  )
}
