import type { InvoiceOrigin, InvoiceStatus } from '@redmars/shared'

/**
 * Badge colours shared by the invoice register (6.1), its detail view, and the collections
 * worklist (6b.7) — split into their own file (no JSX) so components exporting alongside
 * them stay fast-refresh-clean, the same reasoning as the useLabPrintSelection/
 * LabPrintSelectionProvider split in 6b.6.
 */
export const STATUS_VARIANT: Record<InvoiceStatus, 'success' | 'warning' | 'muted' | 'danger'> = {
  paid: 'success',
  partially_paid: 'warning',
  issued: 'muted',
  draft: 'muted',
  cancelled: 'danger',
}

/**
 * The till that raised a bill, coloured so the three read apart at a glance (task 6.2).
 * Kept clear of the status palette (success/warning/danger) — origin is not a state.
 */
export const ORIGIN_VARIANT: Record<InvoiceOrigin, 'info' | 'active' | 'outline' | 'muted'> = {
  reception: 'info',
  lab: 'active',
  pharmacy: 'outline',
  other: 'muted',
}
