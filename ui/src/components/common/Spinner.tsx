import { cn } from '@/utils/cn'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  color?: string
  className?: string
}

const sizeStyles = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-3',
}

export function Spinner({ size = 'md', color, className }: SpinnerProps) {
  return (
    <div
      className={cn(
        'animate-spin-custom rounded-full border-[var(--border-color)] border-t-transparent',
        sizeStyles[size],
        className
      )}
      style={color ? { borderTopColor: 'transparent', borderColor: color } : undefined}
      role="status"
      aria-label="Loading"
    />
  )
}
