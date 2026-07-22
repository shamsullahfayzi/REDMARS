import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity } from 'lucide-react'
import {
  VITAL_BOUNDS,
  bmiFrom,
  isVisitOpen,
  recordVitalsRequestSchema,
  type VisitSummary,
  type VitalField,
  type VitalsReading,
} from '@redmars/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useConsultSaver } from '@/hooks/useConsultSave'
import { useRecordVitals, useVitals } from '@/hooks/useVitals'

/**
 * Task 4.3 — vitals, and the first tab to plug into task 4.2's keys.
 *
 * OPTIONAL, and the screen says so rather than implying it. Farhat has no nurse taking
 * observations; the doctor records what they measured and leaves the rest blank, and a
 * psychiatric follow-up where nothing physical was measured is a complete consultation.
 *
 * Every box empty is not a form with errors, it is a form with nothing in it — so it
 * reports nothing, registers as clean, and F9 finishes the visit without complaint.
 *
 * BMI is shown and never sent. The schema says it is derived and must not be stored, and
 * `bmiFrom` in the shared package is the one formula, so the number under the height box
 * and any number a report computes later cannot disagree.
 */

/** Display order is the order they are taken in, so the tab key follows the cuff. */
const FIELDS: ReadonlyArray<{ field: VitalField; unit: string; step?: string }> = [
  { field: 'systolicBp', unit: 'mmHg' },
  { field: 'diastolicBp', unit: 'mmHg' },
  { field: 'pulse', unit: '/min' },
  { field: 'temperatureC', unit: '°C', step: '0.1' },
  { field: 'respiratory', unit: '/min' },
  { field: 'spo2', unit: '%' },
  { field: 'weightKg', unit: 'kg', step: '0.1' },
  { field: 'heightCm', unit: 'cm', step: '0.5' },
]

type Values = Record<VitalField, string>

const EMPTY: Values = {
  systolicBp: '',
  diastolicBp: '',
  pulse: '',
  temperatureC: '',
  respiratory: '',
  spo2: '',
  weightKg: '',
  heightCm: '',
}

export function VitalsTab({ visit }: { visit: VisitSummary }) {
  const { t } = useTranslation()
  const [values, setValues] = useState<Values>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const listQuery = useVitals(visit.id)
  const record = useRecordVitals(visit.id)

  const open = isVisitOpen(visit.status)
  // Anything typed is unsaved work. An untouched form is not.
  const isDirty = useMemo(() => Object.values(values).some((value) => value.trim() !== ''), [values])

  const save = useCallback(async () => {
    const parsed = recordVitalsRequestSchema.safeParse(values)
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      // Thrown, not swallowed. F9 must not finish a visit over a reading the doctor can
      // still see on screen and believes was saved.
      throw new Error('invalid vitals')
    }

    setErrors({})
    await record.mutateAsync(parsed.data)
    // Cleared, because the next reading is a NEW reading — the saved one is now in the
    // list below and re-saving the same numbers would append a duplicate.
    setValues(EMPTY)
  }, [values, record])

  // This is how the tab joins F2 / F4 / F9 (task 4.2).
  useConsultSaver('vitals', { isDirty, save })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    // Enter is a reflex in a row of number boxes; it does what F2 does.
    void save().catch(() => undefined)
  }

  const bmi = bmiFrom(values.weightKg || null, values.heightCm || null)

  return (
    <div className="space-y-4">
      {open && (
        <Card className="p-4">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {FIELDS.map(({ field, unit, step }) => {
                const [min, max] = VITAL_BOUNDS[field]
                return (
                  <div key={field} className="space-y-1.5">
                    <Label htmlFor={`vitals-${field}`}>
                      {t(`vitals.fields.${field}`)}{' '}
                      <span className="text-muted-foreground" dir="ltr">
                        ({unit})
                      </span>
                    </Label>
                    <Input
                      id={`vitals-${field}`}
                      type="number"
                      dir="ltr"
                      inputMode="decimal"
                      step={step ?? '1'}
                      min={min}
                      max={max}
                      value={values[field]}
                      aria-invalid={Boolean(errors[field])}
                      onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
                    />
                    {errors[field] && (
                      <p className="text-xs text-destructive">{errors[field]}</p>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <Button type="submit" disabled={!isDirty || record.isPending}>
                {record.isPending ? t('vitals.saving') : t('vitals.record')}
              </Button>
              {/* Derived, never stored — and only shown once both numbers exist, because a
                  BMI from a guessed height is a number that looks like a measurement. */}
              {bmi != null && (
                <p className="text-sm text-muted-foreground">
                  {t('vitals.bmi')}{' '}
                  <span className="font-semibold text-foreground tabular-nums" dir="ltr">
                    {bmi}
                  </span>
                </p>
              )}
              {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
              {record.isError && <p className="text-sm text-destructive">{t('vitals.failed')}</p>}
            </div>

            <p className="text-xs text-muted-foreground">{t('vitals.optional')}</p>
          </form>
        </Card>
      )}

      <ReadingList readings={listQuery.data?.readings ?? []} loading={listQuery.isPending} />
    </div>
  )
}

/**
 * Every reading taken this visit, newest first.
 *
 * The list is the point of appending rather than editing: a cuff that read 168/104 and
 * then 142/90 twenty minutes later is telling the doctor something that one editable row
 * would have erased.
 */
function ReadingList({ readings, loading }: { readings: VitalsReading[]; loading: boolean }) {
  const { t } = useTranslation()

  if (loading) return <p className="text-sm text-muted-foreground">{t('vitals.loading')}</p>

  if (readings.length === 0) {
    return (
      <Card className="p-6 text-center">
        <Activity className="mx-auto size-6 text-muted-foreground" aria-hidden />
        <p className="mt-2 text-sm text-muted-foreground">{t('vitals.none')}</p>
      </Card>
    )
  }

  return (
    <ul className="space-y-2">
      {readings.map((reading) => {
        const bmi = bmiFrom(reading.weightKg, reading.heightCm)
        return (
          <li key={reading.id}>
            <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-3 text-sm">
              <span className="text-muted-foreground tabular-nums" dir="ltr">
                {new Date(reading.recordedAt).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {reading.systolicBp != null && (
                <Measure label={t('vitals.fields.bp')} value={`${reading.systolicBp}/${reading.diastolicBp}`} />
              )}
              {reading.pulse != null && (
                <Measure label={t('vitals.fields.pulse')} value={String(reading.pulse)} />
              )}
              {reading.temperatureC != null && (
                <Measure label={t('vitals.fields.temperatureC')} value={reading.temperatureC} />
              )}
              {reading.respiratory != null && (
                <Measure label={t('vitals.fields.respiratory')} value={String(reading.respiratory)} />
              )}
              {reading.spo2 != null && (
                <Measure label={t('vitals.fields.spo2')} value={`${reading.spo2}%`} />
              )}
              {reading.weightKg != null && (
                <Measure label={t('vitals.fields.weightKg')} value={reading.weightKg} />
              )}
              {reading.heightCm != null && (
                <Measure label={t('vitals.fields.heightCm')} value={reading.heightCm} />
              )}
              {bmi != null && <Measure label={t('vitals.bmi')} value={String(bmi)} />}
              {reading.recordedByName && (
                <span className="ms-auto text-xs text-muted-foreground">
                  {reading.recordedByName}
                </span>
              )}
            </Card>
          </li>
        )
      })}
    </ul>
  )
}

function Measure({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-muted-foreground">{label} </span>
      <span className="font-semibold text-foreground tabular-nums" dir="ltr">
        {value}
      </span>
    </span>
  )
}
