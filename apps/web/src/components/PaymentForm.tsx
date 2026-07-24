import { type FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PAYMENT_TENDERS, type PaymentTender, type RecordPaymentResponse } from '@redmars/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { serverMessage } from '@/lib/api'
import { useRecordPayment } from '@/hooks/useInvoices'

/**
 * Take a payment against a bill (task 6.3), cash in full or an instalment. Defaults to the
 * whole balance (the common case is settling in one go), but the amount is editable down to
 * a part-payment; it is clamped client-side to what is owed and clamped again on the server,
 * which is the one that counts. Shared by the reception/billing register and the pharmacy
 * till (6.10) — the same money, taken the same way. Screen only, never printed.
 */
export function PaymentForm({
  invoiceId,
  outstanding,
  currency,
  onPaid,
}: {
  invoiceId: string
  outstanding: string
  currency: string
  onPaid: (result: RecordPaymentResponse) => void
}) {
  const { t } = useTranslation()
  const record = useRecordPayment(invoiceId)
  const [amount, setAmount] = useState(outstanding)
  const [method, setMethod] = useState<PaymentTender>('cash')
  const [reference, setReference] = useState('')

  // When the balance changes under us — a partial payment landed, or a sibling window took
  // money — snap the amount back to what is now owed rather than leave a stale figure.
  useEffect(() => {
    setAmount(outstanding)
  }, [outstanding])

  const owed = Number(outstanding)
  const value = Number(amount)
  const valid = amount.trim() !== '' && value > 0 && value <= owed

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || record.isPending) return
    record.mutate(
      { amount, method, reference: reference.trim() || undefined },
      {
        onSuccess: (result) => {
          onPaid(result)
          setReference('')
        },
      },
    )
  }

  return (
    <Card className="max-w-2xl space-y-3 p-4 print:hidden">
      <p className="text-sm font-medium text-foreground">{t('payments.title')}</p>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="pay-amount">
            {t('payments.amount')}
          </label>
          <Input
            id="pay-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="w-36 font-mono"
            dir="ltr"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="pay-method">
            {t('payments.method')}
          </label>
          <Select
            id="pay-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentTender)}
            className="w-40"
          >
            {PAYMENT_TENDERS.map((m) => (
              <option key={m} value={m}>
                {t(`payments.methodLabel.${m}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-48 flex-1">
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="pay-reference">
            {t('payments.reference')}
          </label>
          <Input
            id="pay-reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={t('payments.referencePlaceholder')}
          />
        </div>
        <Button type="submit" disabled={!valid || record.isPending}>
          {record.isPending ? t('payments.submitting') : t('payments.submit')}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        {t('payments.owedHint', { amount: outstanding, currency })}
      </p>
      {record.isError && (
        <p className="text-sm text-destructive">
          {serverMessage(record.error) ?? t('payments.error')}
        </p>
      )}
    </Card>
  )
}
