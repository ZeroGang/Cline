import { useState, useRef, useEffect } from 'react'
import type { TooltipPlacement } from '@/types/ui'
import { cn } from '@/utils/cn'

const placementStyles: Record<TooltipPlacement, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
}

interface TooltipProps {
  content: string
  placement?: TooltipPlacement
  delay?: number
  children: React.ReactNode
}

export function Tooltip({ content, placement = 'top', delay = 300, children }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const show = () => {
    timeoutRef.current = setTimeout(() => setVisible(true), delay)
  }

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setVisible(false)
  }

  return (
    <div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible && (
        <div
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-[var(--border-radius-sm)] bg-[var(--bg-active)] px-2 py-1 text-xs text-[var(--text-primary)] shadow-md animate-fade-in',
            placementStyles[placement]
          )}
          role="tooltip"
        >
          {content}
        </div>
      )}
    </div>
  )
}
