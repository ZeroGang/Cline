import type { BadgeVariant, Size } from '@/types/ui'
import { cn } from '@/utils/cn'

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-[var(--bg-active)] text-[var(--text-secondary)]',
  success: 'bg-[#10b981]/20 text-[#10b981]',
  warning: 'bg-[#f59e0b]/20 text-[#f59e0b]',
  error: 'bg-[#ef4444]/20 text-[#ef4444]',
  info: 'bg-[#3b82f6]/20 text-[#3b82f6]',
}

const sizeStyles: Record<Size, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-sm',
}

interface BadgeProps {
  variant?: BadgeVariant
  size?: Size
  children: React.ReactNode
  className?: string
}

export function Badge({ variant = 'default', size = 'md', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {children}
    </span>
  )
}
