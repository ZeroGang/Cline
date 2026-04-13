import { X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useUIStore } from '@/stores/uiStore'

export function DetailPanel() {
  const { detailPanelOpen, selectedTaskId, activeDetailTab, closeDetailPanel, setActiveDetailTab } =
    useUIStore()

  const tabs = [
    { key: 'details' as const, label: 'Details' },
    { key: 'logs' as const, label: 'Logs' },
    { key: 'config' as const, label: 'Config' },
  ]

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-l border-[var(--border-color)] bg-[var(--bg-secondary)] transition-all duration-300',
        detailPanelOpen ? 'w-96' : 'w-0 overflow-hidden'
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-[var(--border-color)] px-4">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          Task Details
        </h3>
        <button
          onClick={closeDetailPanel}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--border-radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-default cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex border-b border-[var(--border-color)]">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveDetailTab(key)}
            className={cn(
              'flex-1 px-3 py-2 text-xs font-medium transition-default cursor-pointer',
              activeDetailTab === key
                ? 'border-b-2 border-[var(--accent-blue)] text-[var(--accent-blue)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {selectedTaskId ? (
          <div className="text-sm text-[var(--text-secondary)]">
            <p>Task ID: {selectedTaskId}</p>
            <p className="mt-2 text-[var(--text-muted)]">
              {activeDetailTab === 'details' && 'Task details will be displayed here.'}
              {activeDetailTab === 'logs' && 'Task logs will be displayed here.'}
              {activeDetailTab === 'config' && 'Task configuration will be displayed here.'}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">Select a task to view details</p>
        )}
      </div>
    </aside>
  )
}
