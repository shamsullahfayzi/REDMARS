import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Wallet } from 'lucide-react'
import { PAYMENT_METHODS, type LabChargeOrder, type PaymentMethod } from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { useLabCharges, usePayLabCharges } from '@/hooks/useLabBilling'
import { ApiError } from '@/lib/api'

/**
 * Reception's lab settlement, on the patient's own page — the counterpart to the doctor's
 * order. The desk pulls up the patient, sees the tests the lab is owed for, ticks the ones
 * the patient is paying for, and takes the cash for exactly those. Paying a test frees it for
 * the bench; the rest stay owed. Rendered only where the lab is on and the viewer may bill.
 */
export function LabChargesCard({ patientId }: { patientId: string }) {
  const { t } = useTranslation()
  const { roles, enabledModules } = useAuth()

  // Not pharmacist: a lab bill is not theirs to see at all (R12) — the same exclusion the
  // API enforces on invoice.read/invoice.list and the lab-charges endpoints this card calls
  // (lab_charge.read / lab_charge.collect, neither of which the pharmacist role holds).
  const mayBill = roles.includes('admin') || roles.includes('receptionist') || roles.includes('management')
  const mayPay = roles.includes('receptionist')
  const enabled = enabledModules.includes('lab') && mayBill

  const chargesQuery = useLabCharges(patientId, enabled)
  const orders = chargesQuery.data?.orders ?? []

  if (!enabled || orders.length === 0) return null

  return (
    <Card className="max-w-lg space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Wallet className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="font-semibold text-foreground">{t('labCharges.title')}</h2>
      </div>
      {orders.map((order) => (
        <ChargeOrder key={order.orderId} order={order} patientId={patientId} mayPay={mayPay} />
      ))}
    </Card>
  )
}

function ChargeOrder({
  order,
  patientId,
  mayPay,
}: {
  order: LabChargeOrder
  patientId: string
  mayPay: boolean
}) {
  const { t } = useTranslation()
  const pay = usePayLabCharges(patientId)

  const unpaid = useMemo(() => order.items.filter((item) => !item.isPaid), [order.items])
  const [selected, setSelected] = useState<Set<string>>(() => new Set(unpaid.map((i) => i.itemId)))
  const [method, setMethod] = useState<PaymentMethod>('cash')

  const toggle = (itemId: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })

  const chosen = unpaid.filter((item) => selected.has(item.itemId))
  const totalDue = chosen.reduce((sum, item) => sum + Number(item.price), 0)

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">
        <span dir="ltr" className="font-mono">
          {order.orderNo}
        </span>
        {' · '}
        {t('labCharges.outstanding', { amount: order.outstanding })}
      </p>

      <ul className="space-y-1.5">
        {order.items.map((item) => (
          <li key={item.itemId} className="flex items-center gap-2 text-sm">
            {item.isPaid ? (
              <span className="flex-1 text-muted-foreground line-through">{item.testName}</span>
            ) : (
              <label className="flex flex-1 items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={selected.has(item.itemId)}
                  disabled={!mayPay || pay.isPending}
                  onChange={() => toggle(item.itemId)}
                />
                <span className="text-foreground">{item.testName}</span>
              </label>
            )}
            <span dir="ltr" className="tabular-nums text-muted-foreground">
              {item.price}
            </span>
            {item.isPaid && (
              <span className="rounded bg-success/15 px-1.5 py-0.5 text-xs text-success">
                {t('labCharges.paid')}
              </span>
            )}
          </li>
        ))}
      </ul>

      {mayPay && unpaid.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label={t('labCharges.method')}
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className="h-9 w-36"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`labCharges.methods.${m}`)}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            size="sm"
            disabled={chosen.length === 0 || pay.isPending}
            onClick={() =>
              pay.mutate({ itemIds: chosen.map((i) => i.itemId), method })
            }
          >
            <Wallet className="size-4" aria-hidden />
            {pay.isPending
              ? t('labCharges.collecting')
              : t('labCharges.collect', { amount: totalDue.toFixed(2) })}
          </Button>
          {pay.isError && (
            <span className="text-xs text-destructive">
              {pay.error instanceof ApiError && typeof pay.error.body === 'object'
                ? ((pay.error.body as { message?: string }).message ?? t('labCharges.failed'))
                : t('labCharges.failed')}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
