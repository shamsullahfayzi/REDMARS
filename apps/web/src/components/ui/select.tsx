import type { ComponentProps } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A native <select> styled to match Input. Native on purpose: it is keyboard- and
 * screen-reader-correct for free, and on a shared hospital workstation a plain OS
 * dropdown is one less thing to misbehave. The chevron sits at the inline end
 * (end-2.5), so it lands on the correct side under dir="rtl".
 */
function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          'w-full appearance-none rounded-lg border border-input bg-background px-3 py-2 pe-9 text-sm text-foreground shadow-xs outline-none transition-colors',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

export { Select }
