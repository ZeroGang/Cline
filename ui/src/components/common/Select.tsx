import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  label?: string
  options: SelectOption[]
  value?: string
  placeholder?: string
  onChange: (value: string) => void
  searchable?: boolean
  className?: string
  disabled?: boolean
}

export function Select({
  label,
  options,
  value,
  placeholder = 'Select...',
  onChange,
  searchable = false,
  className,
  disabled = false,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = searchable
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  const selected = options.find((o) => o.value === value)

  return (
    <div ref={ref} className={cn('relative', className)}>
      {label && (
        <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
          {label}
        </label>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center justify-between rounded-[var(--border-radius-md)] border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]',
          'hover:border-[var(--border-light)] focus:border-[var(--accent-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !selected && 'text-[var(--text-muted)]'
        )}
      >
        <span className="truncate-nowrap">{selected?.label || placeholder}</span>
        <ChevronDown className={cn('ml-2 h-4 w-4 text-[var(--text-muted)] transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-[var(--border-radius-md)] border border-[var(--border-color)] bg-[var(--bg-card)] shadow-lg animate-fade-in">
          {searchable && (
            <div className="border-b border-[var(--border-color)] p-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full bg-transparent px-2 py-1 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                autoFocus
              />
            </div>
          )}
          <ul className="max-h-60 overflow-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-[var(--text-muted)]">No options</li>
            )}
            {filtered.map((option) => (
              <li
                key={option.value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                  setSearch('')
                }}
                className={cn(
                  'cursor-pointer px-3 py-2 text-sm transition-default',
                  option.value === value
                    ? 'bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]'
                    : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                )}
              >
                {option.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
