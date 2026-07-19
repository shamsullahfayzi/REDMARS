import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * The one text input. Every form field in the app is this, so spacing, focus ring,
 * and disabled state are decided once. Logical padding only (px is symmetric), so
 * it mirrors under dir="rtl".
 */
function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      className={cn(
        'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-colors',
        'placeholder:text-muted-foreground',
        'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
