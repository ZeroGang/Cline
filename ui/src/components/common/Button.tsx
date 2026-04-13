import type { ButtonVariant, ButtonSize } from '@/types/ui'
import { cn } from '@/utils/cn'
import { Loader2 } from 'lucide-react'

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue)]/90',
  secondary: 'bg-[var(--bg-active)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
  outline: 'border border-[var(--border-light)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
  ghost: 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
  danger: 'bg-[var(--accent-red)] text-white hover:bg-[var(--accent-red)]/90',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  children: React.ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--border-radius-md)] font-medium transition-default cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]',
        'disabled:pointer-events-none disabled:opacity-50',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin-custom" />}
      {children}
    </button>
  )
}
