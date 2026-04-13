import { cn } from '@/utils/cn'

interface ProgressBarProps {
  value: number
  color?: string
  animated?: boolean
  className?: string
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const sizeStyles = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
}

export function ProgressBar({
  value,
  color,
  animated = true,
  className,
  showLabel = false,
  size = 'md',
}: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value))
  const barColor = color || getProgressColor(clampedValue)

  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="mb-1 flex justify-between text-xs text-[var(--text-secondary)]">
          <span>Progress</span>
          <span>{Math.round(clampedValue)}%</span>
        </div>
      )}
      <div className={cn('w-full overflow-hidden rounded-full bg-[var(--bg-active)]', sizeStyles[size])}>
        <div
          className={cn('h-full rounded-full', animated && 'transition-all duration-300 ease-out')}
          style={{
            width: `${clampedValue}%`,
            backgroundColor: barColor,
          }}
        />
      </div>
    </div>
  )
}

function getProgressColor(value: number): string {
  if (value >= 80) return '#10b981'
  if (value >= 50) return '#3b82f6'
  if (value >= 25) return '#f59e0b'
  return '#ef4444'
}
