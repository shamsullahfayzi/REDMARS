import { z } from 'zod'

export const intakeSchema = z.object({
  receiptKey: z.uuid(),
  drugId: z.uuid(),
  supplierId: z.uuid().nullable(),
  lot: z.string().trim().min(1).max(100),
  location: z.string().trim().min(1).max(100),
  quantity: z.int().positive().max(1000000000),
  expiresOn: z.iso.date(),
})
export const stockSettingsSchema = z.object({
  reorderThreshold: z.int().nonnegative().max(1000000000),
  alternativeIds: z.array(z.uuid()).max(20),
})
export const availabilitySchema = z.array(
  z.object({
    id: z.string(),
    available: z.number(),
    reorderThreshold: z.number(),
    alternatives: z.array(z.object({ id: z.string(), name: z.string(), available: z.number() })),
  }),
)
export const inventoryDashboardSchema = z.object({
  today: z.string(),
  expiryLimit: z.string(),
  suppliers: z.array(z.object({ id: z.string(), name: z.string() })),
  drugs: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      available: z.number(),
      reorderThreshold: z.number(),
      alternativeIds: z.array(z.string()),
      batches: z.array(
        z.object({
          id: z.string(),
          lot: z.string(),
          location: z.string(),
          expiresOn: z.string(),
          quantity: z.number(),
          quarantined: z.boolean(),
          supplier: z.string().nullable(),
        }),
      ),
    }),
  ),
})

export const movementPageSchema = z.object({
  movements: z.array(
    z.object({
      id: z.string(),
      lot: z.string(),
      location: z.string(),
      kind: z.string(),
      quantity: z.number(),
      at: z.string(),
      reason: z.string().nullable(),
    }),
  ),
  next: z.string().nullable(),
})
