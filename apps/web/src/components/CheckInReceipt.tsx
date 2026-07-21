import { useTranslation } from 'react-i18next'
import type { CheckInResponse } from '@redmars/shared'

/**
 * The slip the patient walks away with (task 3.6).
 *
 * Three numbers matter and they are the three the patient will be asked for later: the
 * MRN that finds them next time, the visit number the queue is called from, and the
 * invoice number that proves they paid. Everything else on the page is context.
 *
 * Styled for paper as well as screen — see the `print:` utilities and the @media print
 * block in index.css. A receipt that only exists on a monitor is not a receipt.
 */
export function CheckInReceipt({ result }: { result: CheckInResponse }) {
  const { t } = useTranslation()
  const { patient, visit, invoice } = result

  return (
    <div className="space-y-5 print:space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label={t('patients.create.mrn')} value={patient.mrn} />
        <Figure label={t('visits.fields.visitNo')} value={visit.visitNo} />
        <Figure label={t('reception.receipt.invoiceNo')} value={invoice.invoiceNo} />
      </div>

      <div className="text-sm">
        <p className="text-base font-semibold text-foreground">{patient.name}</p>
        <p className="text-muted-foreground">
          {visit.departmentName}
          {visit.practitionerName ? ` · ${visit.practitionerName}` : ''}
        </p>
      </div>

      <table className="w-full text-sm">
        <thead className="border-b border-border text-muted-foreground">
          <tr>
            <th className="py-2 text-start font-medium">{t('reception.receipt.item')}</th>
            <th className="py-2 text-end font-medium">{t('reception.receipt.qty')}</th>
            <th className="py-2 text-end font-medium">{t('reception.receipt.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => (
            <tr key={item.id} className="border-b border-border last:border-0">
              <td className="py-2 text-foreground">{item.description}</td>
              <td className="py-2 text-end text-muted-foreground" dir="ltr">
                {item.quantity}
              </td>
              <td className="py-2 text-end font-mono text-foreground" dir="ltr">
                {item.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="space-y-1 text-sm">
        <Row label={t('reception.bill.subtotal')} value={invoice.subtotal} />
        {invoice.discount !== '0.00' && (
          <Row
            label={
              invoice.discountReason
                ? `${t('reception.bill.discount')} — ${invoice.discountReason}`
                : t('reception.bill.discount')
            }
            value={`−${invoice.discount}`}
          />
        )}
        <div className="flex items-baseline justify-between border-t border-border pt-2">
          <dt className="font-semibold text-foreground">{t('reception.bill.total')}</dt>
          <dd className="font-mono text-lg font-bold text-foreground" dir="ltr">
            {invoice.total} {invoice.currency}
          </dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-muted-foreground">{t('reception.payment.paid')}</dt>
          <dd className="text-foreground">
            {invoice.paymentMethod
              ? t(`reception.payment.method.${invoice.paymentMethod}`)
              : t('reception.receipt.nothingDue')}
          </dd>
        </div>
      </dl>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-3 print:bg-transparent print:p-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {/* Always LTR: an identifier reads left-to-right even on an RTL page. */}
      <p dir="ltr" className="font-mono text-lg font-bold text-foreground">
        {value}
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-foreground" dir="ltr">
        {value}
      </dd>
    </div>
  )
}
