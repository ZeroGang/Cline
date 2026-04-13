import type { TaskStatus } from '@/types/task'
import { STATUS_COLORS } from '@/types/ui'
import { cn } from '@/utils/cn'

interface StatusIndicatorProps {
  status: TaskStatus
  showLabel?: boolean
  className?: string
}

const statusLabels: Record<TaskStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
}

export function StatusIndicator({ status, showLabel = false, className }: StatusIndicatorProps) {
  const color = STATUS_COLORS[status]

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn(
          'inline-block h-2 w-2 rounded-full',
          status === 'running' && 'animate-pulse-custom',
          status === 'failed' && 'animate-blink'
        )}
        style={{ backgroundColor: color }}
        role="status"
        aria-label={statusLabels[status]}
      />
      {showLabel && (
        <span className="text-xs text-[var(--text-secondary)]">{statusLabels[status]}</span>
      )}
    </span>
  )
}
