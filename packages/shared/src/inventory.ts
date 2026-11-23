import { z } from 'zod'
import { moneySchema } from './reception.js'
import { moneyDecimal } from './money.js'

export const packBasisSchema = z.enum(['unit', 'packet', 'box'])
export type PackBasis = z.infer<typeof packBasisSchema>
const count = z.int().positive().max(1000000000)

export const receiptPackSchema = z
  .object({
    unitName: z.string().trim().min(1).max(32),
    unitsPerPacket: count,
    packetsPerBox: count.nullable(),
    receivedAs: packBasisSchema,
    receivedCount: count,
    purchasePrice: moneySchema.transform((price) => moneyDecimal(price).toFixed(2)),
    sellBy: packBasisSchema,
    sellPrice: moneySchema.transform((price) => moneyDecimal(price).toFixed(2)),
  })
  .refine(
    (p) => (p.receivedAs !== 'box' && p.sellBy !== 'box') || p.packetsPerBox !== null,
    'Enter packets per box.',
  )
  .refine(
    (p) => p.unitsPerPacket * (p.packetsPerBox ?? 1) <= 1000000000,
    'Box size exceeds the stock limit.',
  )
export type ReceiptPack = z.infer<typeof receiptPackSchema>

export function unitsPerPack(
  basis: PackBasis,
  p: Pick<ReceiptPack, 'unitsPerPacket' | 'packetsPerBox'>,
) {
  if (basis === 'box') return p.unitsPerPacket * (p.packetsPerBox ?? 0)
  return basis === 'packet' ? p.unitsPerPacket : 1
}

/** Apply the original package rate before rounding the extended line amount. */
export function priceForUnits(price: string, unitsPerPrice: number, units: number) {
  return moneyDecimal(price).mul(units).div(unitsPerPrice).toFixed(2)
}

export function packetEquivalent(units: number, size: number, unitName: string) {
  if (size === 1) return units + ' × ' + unitName
  const packets = Math.floor(units / size)
  const loose = units % size
  return (
    [
      packets && packets + (packets === 1 ? ' packet' : ' packets'),
      loose && loose + ' × ' + unitName,
    ]
      .filter(Boolean)
      .join(' + ') || '0'
  )
}

export const intakeSchema = z
  .object({
    receiptKey: z.uuid(),
    drugId: z.uuid(),
    supplierId: z.uuid().nullable(),
    lot: z.string().trim().min(1).max(100),
    location: z.string().trim().min(1).max(100),
    quantity: z.int().positive().max(1000000000),
    expiresOn: z.iso.date(),
    packaging: receiptPackSchema.optional(),
  })
  .refine(
    (r) =>
      !r.packaging ||
      r.quantity === r.packaging.receivedCount * unitsPerPack(r.packaging.receivedAs, r.packaging),
    'Received quantity does not match the package count and size.',
  )
export const stockSettingsSchema = z.object({
  reorderThreshold: z.int().nonnegative().max(1000000000),
  alternativeIds: z.array(z.uuid()).max(20),
})
export const availabilitySchema = z.array(
  z.object({
    id: z.string(),
    available: z.number(),
    reorderThreshold: z.number(),
    packet: z.object({ size: z.int().positive(), unitName: z.string() }).nullable().optional(),
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
      dispensingUnit: z.string().nullable().optional(),
      alternativeIds: z.array(z.string()),
      batches: z.array(
        z.object({
          id: z.string(),
          lot: z.string(),
          location: z.string(),
          expiresOn: z.string(),
          quantity: z.number(),
          quarantined: z.boolean(),
          packaging: receiptPackSchema.nullable().optional(),
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
      packaging: receiptPackSchema.nullable().optional(),
    }),
  ),
  next: z.string().nullable(),
})
