import { useTranslation } from 'react-i18next'
import type { CheckInResponse } from '@redmars/shared'
import { amountInWords } from '@/lib/amountInWords'

/**
 * The out-patient bill (task 3.6, reshaped to Farhat's Medi-Pro layout).
 *
 * Modelled on the paper the hospital has handed out for years: a centred letterhead, a
 * two-column block of who-and-when, the charges, the total in figures and then in words,
 * and the hospital's own address, signature line and run time at the foot. The fields
 * their old system had but this one does not — token number, OPD card number, a separate
 * registration number — are simply left out rather than printed blank.
 *
 * NOT a `<header>`/`<footer>`: the print stylesheet hides those as page chrome (they are
 * the app's top bar and nav), which is exactly why the hospital name vanished on the first
 * printed copy. Plain divs survive.
 *
 * Prints A5 landscape to save paper — see `.receipt-bill` / `@page` in index.css. Dates
 * render in the hospital's zone with Latin digits; a bill dated to the wrong day, or in
 * numerals half the staff misread, is a bill nobody trusts.
 */
export function CheckInReceipt({ result }: { result: CheckInResponse }) {
  const { t, i18n } = useTranslation()
  const { facility, patient, visit, invoice } = result

  const localName =
    i18n.language === 'ps'
      ? (facility.nameLocalPs ?? facility.nameLocalPrs)
      : (facility.nameLocalPrs ?? facility.nameLocalPs)

  const dateTime = (iso: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kabul',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso))

  const sexLetter = t(`reception.receipt.sex.${patient.gender}`, {
    defaultValue: patient.gender.charAt(0).toUpperCase(),
  })
  const ageSex =
    patient.ageYears != null
      ? `${patient.ageYears} ${t('reception.receipt.yrs')} / ${sexLetter}`
      : sexLetter

  const currencyWord = CURRENCY_WORDS[invoice.currency] ?? invoice.currency
  const doctor = visit.practitionerName ?? visit.departmentName

  return (
    <div className="receipt-bill space-y-3 text-sm text-foreground">
      {/* Letterhead */}
      <div className="text-center">
        <h2 className="text-lg font-bold">{facility.name}</h2>
        {localName && localName !== facility.name && <p className="text-base">{localName}</p>}
        <p className="font-semibold uppercase tracking-wide">{t('reception.receipt.billTitle')}</p>
      </div>

      <hr className="border-border" />

      {/* The six short fields across ONE row, so a bill with many charge lines still has
          them side by side rather than stacked down half the page. Address and mobile —
          the long ones — go beneath, on their own lines where they have room to run. */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 md:grid-cols-6">
        <Cell label={t('reception.receipt.receiptNo')} value={invoice.invoiceNo} mono />
        <Cell label={t('reception.receipt.patientId')} value={patient.mrn} mono />
        <Cell label={t('reception.receipt.name')} value={patient.name} />
        <Cell label={t('reception.receipt.ageSex')} value={ageSex} />
        <Cell label={t('reception.receipt.receiptDate')} value={dateTime(visit.startedAt)} />
        <Cell label={t('reception.receipt.doctor')} value={doctor} />
      </div>

      <div className="space-y-0.5">
        <BillLine label={t('patients.fields.address')} value={patient.address} />
        <BillLine label={t('reception.receipt.mobile')} value={patient.phone} mono />
      </div>

      <hr className="border-border" />

      {/* Charges */}
      <table className="w-full">
        <thead className="border-b border-border text-muted-foreground">
          <tr>
            <th className="py-1 text-start font-medium">{t('reception.receipt.description')}</th>
            <th className="py-1 text-end font-medium">{t('reception.receipt.qty')}</th>
            <th className="py-1 text-end font-medium">{t('reception.receipt.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => (
            <tr key={item.id}>
              <td className="py-1">{item.description}</td>
              <td className="py-1 text-end text-muted-foreground" dir="ltr">
                {item.quantity}
              </td>
              <td className="py-1 text-end font-mono" dir="ltr">
                {item.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals, aligned right like the old bill's TOTAL / PAID block. */}
      <div className="ms-auto max-w-xs space-y-1 border-t border-border pt-2">
        {invoice.discount !== '0.00' && (
          <TotalLine
            label={
              invoice.discountReason
                ? `${t('reception.bill.discount')} — ${invoice.discountReason}`
                : t('reception.bill.discount')
            }
            value={`−${invoice.discount}`}
            currency={invoice.currency}
          />
        )}
        <TotalLine
          label={t('reception.receipt.total')}
          value={invoice.total}
          currency={invoice.currency}
          strong
        />
        <TotalLine
          label={t('reception.receipt.paid')}
          value={invoice.paidAmount}
          currency={invoice.currency}
        />
      </div>

      {/* In words, then how it was settled. */}
      <div className="space-y-0.5 border-t border-border pt-2">
        <p>
          {t('reception.receipt.receivedFrom', {
            name: patient.name,
            currency: currencyWord,
            words: amountInWords(invoice.paidAmount),
          })}
        </p>
        <p className="uppercase">
          {invoice.paymentMethod
            ? t('reception.receipt.paymentBy', {
                method: t(`reception.payment.method.${invoice.paymentMethod}`),
              })
            : t('reception.receipt.nothingDue')}
        </p>
      </div>

      {/* The hospital's own footer: address, contact, signature, and when this was run. */}
      <div className="space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
        {facility.address && <p>{facility.address}</p>}
        {(facility.phone || facility.email) && (
          <p dir="ltr">
            {[
              facility.phone && `${t('reception.receipt.mobile')}: ${facility.phone}`,
              facility.email && `${t('reception.receipt.email')}: ${facility.email}`,
            ]
              .filter(Boolean)
              .join('   ')}
          </p>
        )}
        <div className="flex items-end justify-between pt-3">
          <span>
            {t('reception.receipt.runDate')} {dateTime(new Date().toISOString())}
          </span>
          <span className="text-foreground">{t('reception.receipt.authSign')}</span>
        </div>
      </div>
    </div>
  )
}

/** English currency words for the "a sum of …" line. Falls back to the code. */
const CURRENCY_WORDS: Record<string, string> = {
  AFN: 'Afghani',
  USD: 'Dollars',
  PKR: 'Rupees',
  EUR: 'Euros',
}

/** One field of the top row: a small caption above its value. Blank values keep the caption. */
function Cell({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={mono ? 'font-mono break-words' : 'break-words'} dir={mono ? 'ltr' : undefined}>
        {value || '—'}
      </div>
    </div>
  )
}

/** One "Label : value" detail row. Blank values still print the label, as the old bill did. */
function BillLine({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono' : undefined} dir={mono ? 'ltr' : undefined}>
        : {value || ''}
      </span>
    </div>
  )
}

function TotalLine({
  label,
  value,
  currency,
  strong,
}: {
  label: string
  value: string
  currency: string
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={strong ? 'font-semibold' : 'text-muted-foreground'}>{label}</dt>
      <dd
        className={strong ? 'font-mono text-base font-bold' : 'font-mono'}
        dir="ltr"
      >
        {value} {currency}
      </dd>
    </div>
  )
}
