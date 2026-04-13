import { Wifi, WifiOff, Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'

interface FooterProps {
  wsConnected: boolean
  wsReconnecting?: boolean
  version?: string
}

export function Footer({ wsConnected, wsReconnecting = false, version = 'v1.0.0' }: FooterProps) {
  const statusColor = wsReconnecting
    ? 'bg-[var(--accent-yellow)]'
    : wsConnected
      ? 'bg-[var(--accent-green)]'
      : 'bg-[var(--accent-red)]'

  const statusText = wsReconnecting
    ? 'Reconnecting...'
    : wsConnected
      ? 'Connected'
      : 'Disconnected'

  const StatusIcon = wsReconnecting ? Loader2 : wsConnected ? Wifi : WifiOff

  return (
    <footer className="flex h-8 items-center justify-between border-t border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 text-xs">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-block h-2 w-2 rounded-full',
            statusColor,
            wsReconnecting && 'animate-pulse-custom'
          )}
          role="status"
          aria-label={statusText}
        />
        <StatusIcon
          className={cn(
            'h-3 w-3',
            wsReconnecting
              ? 'text-[var(--accent-yellow)] animate-spin-custom'
              : wsConnected
                ? 'text-[var(--accent-green)]'
                : 'text-[var(--accent-red)]'
          )}
        />
        <span className="text-[var(--text-muted)]">{statusText}</span>
      </div>
      <div className="text-[var(--text-disabled)]">CLine Monitor {version}</div>
    </footer>
  )
}
