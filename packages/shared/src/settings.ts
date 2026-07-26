import { z } from 'zod'

/**
 * Task 6b.1 — the R10 discount ceiling stops being a hardcoded 10% and becomes something
 * an admin sets per facility. A facility with no row yet reads as this default, so nothing
 * changes the day this ships until an admin actually opens the settings screen.
 */
export const DISCOUNT_MAX_PERCENT_DEFAULT = 10
export const DISCOUNT_MAX_PERCENT_BOUNDS = [0, 100] as const

export const discountCeilingResponseSchema = z.object({
  maxPercent: z.number().min(0).max(100),
})
export type DiscountCeilingResponse = z.infer<typeof discountCeilingResponseSchema>

export const updateDiscountCeilingRequestSchema = z.object({
  maxPercent: z
    .number('Enter a percentage.')
    .min(DISCOUNT_MAX_PERCENT_BOUNDS[0], 'Cannot be negative.')
    .max(DISCOUNT_MAX_PERCENT_BOUNDS[1], 'Cannot exceed 100%.'),
})
export type UpdateDiscountCeilingRequest = z.infer<typeof updateDiscountCeilingRequestSchema>
