import { useTranslation } from 'react-i18next'
import { Pill } from 'lucide-react'
import type { PharmacyQueueItem } from '@redmars/shared'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'
import { usePharmacyQueue } from '@/hooks/usePharmacy'

const WAIT_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kabul',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Task 6.8 — the pharmacy queue: the doctor's orders waiting to be dispensed.
 *
 * The pharmacist's home screen. Oldest first, so the longest wait is at the top. A row
 * shows who the patient is, who prescribed, when, and the drugs at a glance; opening one
 * (6.9) shows the full sheet — drugs and allergies, nothing else clinical.
 */
export function PharmacyPage() {
  const { t } = useTranslation()
  const query = usePharmacyQueue()
  const items = query.data?.items ?? []

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.pharmacy')} description={t('pharmacy.subtitle')} />

      {query.isError && <p className="text-sm text-destructive">{t('pharmacy.error')}</p>}

      {!query.isError &&
        (items.length === 0 && !query.isPending ? (
          <Card className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
            <Pill className="size-8" aria-hidden />
            <p>{t('pharmacy.empty')}</p>
          </Card>
        ) : (
          <section className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('pharmacy.waiting', { count: items.length })}
            </p>
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('pharmacy.col.ordered')}</th>
                    <th className="p-3 text-start font-medium">{t('pharmacy.col.patient')}</th>
                    <th className="p-3 text-start font-medium">{t('pharmacy.col.drugs')}</th>
                    <th className="p-3 text-start font-medium">{t('pharmacy.col.prescriber')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <QueueRow key={item.prescriptionId} item={item} />
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        ))}
    </div>
  )
}

function QueueRow({ item }: { item: PharmacyQueueItem }) {
  const { t } = useTranslation()
  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-3 whitespace-nowrap text-muted-foreground" dir="ltr">
        {WAIT_TIME.format(new Date(item.orderedAt))}
      </td>
      <td className="p-3">
        <span className="font-medium text-foreground">{item.patientName}</span>
        <span className="ms-2 font-mono text-xs text-muted-foreground" dir="ltr">
          {item.patientMrn}
        </span>
        {item.ageYears != null && (
          <span className="ms-2 text-xs text-muted-foreground">
            {t('patients.search.years', { count: item.ageYears })}
          </span>
        )}
      </td>
      <td className="p-3 text-foreground">
        {item.summary || '—'}
        {item.itemCount > 0 && (
          <span className="ms-2 text-xs text-muted-foreground">
            {t('pharmacy.itemCount', { count: item.itemCount })}
          </span>
        )}
      </td>
      <td className="p-3 text-muted-foreground">{item.practitionerName}</td>
    </tr>
  )
}
