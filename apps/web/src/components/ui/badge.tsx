import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-muted text-foreground',
        // A live/active state — the faint primary tint reads as "on" in both themes.
        active: 'bg-primary/10 text-primary',
        // An off/inactive state — deliberately muted so it recedes.
        muted: 'bg-muted text-muted-foreground',
        outline: 'border border-border text-muted-foreground',
        // Clinical status. Soft tinted fill + the text-safe solid token, so a lab
        // flag (normal/low/high) or an interaction warning carries meaning, not
        // just colour. success = normal, warning = low/caution, danger = high.
        success: 'bg-success/12 text-success',
        warning: 'bg-warning/12 text-warning',
        danger: 'bg-destructive/12 text-destructive',
        info: 'bg-info/12 text-info',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge }
