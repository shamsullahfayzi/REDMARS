import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarPlus, Check } from 'lucide-react'
import {
  createAppointmentRequestSchema,
  type CreateAppointmentRequest,
  type VisitDepartmentOption,
} from '@redmars/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useCreateAppointment } from '@/hooks/useAppointments'
import { useVisitOptions } from '@/hooks/useVisits'

/**
 * "Come back on the fifth" (task 3.10).
 *
 * Lives on the patient's record rather than on a booking screen, because that is where
 * the sentence is actually said — the doctor has the patient in front of them and the
 * chart already open. Sending them to a separate screen to find the same patient again
 * is how a follow-up ends up existing only as something the patient was told.
 *
 * A day, not a time. Farhat does not run slots, and a booking that promises 10:15 the
 * clinic has no way to honour is worse than a date the patient can be sure of.
 */
export function BookFollowUp({ patientId }: { patientId: string }) {
  const { t, i18n } = useTranslation()
  const optionsQuery = useVisitOptions()
  const create = useCreateAppointment()

  const [departmentId, setDepartmentId] = useState('')
  const [practitionerId, setPractitionerId] = useState('')
  const [scheduledOn, setScheduledOn] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const departments = optionsQuery.data?.departments ?? []
  const practitioners = optionsQuery.data?.practitioners ?? []
  const available = practitioners.filter((p) => p.departmentIds.includes(departmentId))

  function departmentName(department: VisitDepartmentOption): string {
    if (i18n.language === 'prs' && department.nameLocalPrs) return department.nameLocalPrs
    if (i18n.language === 'ps' && department.nameLocalPs) return department.nameLocalPs
    return department.name
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const parsed = createAppointmentRequestSchema.safeParse({
      patientId,
      departmentId,
      practitionerId: practitionerId || null,
      scheduledOn,
      reason: reason.trim() || null,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('appointments.invalid'))
      return // never fall through to mutate with undefined data
    }
    create.mutate(parsed.data as CreateAppointmentRequest, {
      onSuccess: () => {
        setReason('')
        setScheduledOn('')
      },
    })
  }

  return (
    <Card className="max-w-lg space-y-4 p-6">
      <div className="flex items-center gap-2">
        <CalendarPlus className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="font-medium text-foreground">{t('appointments.book.title')}</h2>
      </div>
      <p className="text-sm text-muted-foreground">{t('appointments.book.hint')}</p>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="apptDate">
            {t('appointments.fields.date')}
            <span className="ms-0.5 text-destructive">*</span>
          </Label>
          <Input
            id="apptDate"
            type="date"
            dir="ltr"
            value={scheduledOn}
            onChange={(e) => setScheduledOn(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="apptDepartment">
            {t('visits.fields.department')}
            <span className="ms-0.5 text-destructive">*</span>
          </Label>
          <Select
            id="apptDepartment"
            value={departmentId}
            onChange={(e) => {
              setDepartmentId(e.target.value)
              setPractitionerId('')
            }}
          >
            <option value="">{t('visits.create.chooseDepartment')}</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {departmentName(department)}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="apptPractitioner">{t('visits.fields.practitioner')}</Label>
          <Select
            id="apptPractitioner"
            value={practitionerId}
            disabled={!departmentId}
            onChange={(e) => setPractitionerId(e.target.value)}
          >
            {/* A follow-up with whoever is on that day is a real answer, not a gap. */}
            <option value="">{t('appointments.book.anyDoctor')}</option>
            {available.map((practitioner) => (
              <option key={practitioner.id} value={practitioner.id}>
                {practitioner.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="apptReason">{t('appointments.fields.reason')}</Label>
          <Input
            id="apptReason"
            value={reason}
            placeholder={t('appointments.book.reasonPlaceholder')}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {create.isError && !error && (
          <p className="text-sm text-destructive">{t('appointments.book.error')}</p>
        )}
        {create.isSuccess && !create.isPending && (
          <p className="flex items-center gap-1.5 text-sm text-success">
            <Check className="size-4" aria-hidden />
            {t('appointments.book.saved', { date: create.data.scheduledOn })}
          </p>
        )}

        <Button type="submit" disabled={create.isPending || !scheduledOn || !departmentId}>
          {create.isPending ? t('appointments.book.saving') : t('appointments.book.submit')}
        </Button>
      </form>
    </Card>
  )
}
