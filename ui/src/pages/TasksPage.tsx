import { ListTodo } from 'lucide-react'

export default function TasksPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Tasks</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Manage and monitor your tasks</p>
      </div>

      <div className="flex h-64 items-center justify-center rounded-[var(--border-radius-lg)] border border-[var(--border-color)] bg-[var(--bg-card)]">
        <div className="text-center">
          <ListTodo className="mx-auto h-12 w-12 text-[var(--text-muted)]" />
          <p className="mt-3 text-sm text-[var(--text-muted)]">No tasks yet</p>
          <p className="mt-1 text-xs text-[var(--text-disabled)]">Create a new task to get started</p>
        </div>
      </div>
    </div>
  )
}
