import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { CalendarDays } from 'lucide-react'
import type { AppointmentSummary, VisitDepartmentOption } from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useAppointments, useCloseAppointment } from '@/hooks/useAppointments'
import { useVisitOptions } from '@/hooks/useVisits'
import { cn } from '@/lib/utils'

/**
 * Task 3.10 — the appointment book.
 *
 * Two questions, and the toggle between them is the whole screen: "who is expected
 * today" (the desk, every morning) and "what is coming" (a doctor glancing ahead).
 *
 * Booking is NOT here. It happens on the patient's record, where the doctor already is
 * when they say "come back on the fifth" — see BookFollowUp.
 */
export function AppointmentsPage() {
  const { t, i18n } = useTranslation()
  const { roles } = useAuth()
  const [upcoming, setUpcoming] = useState(false)
  const [date, setDate] = useState('')
  const [departmentId, setDepartmentId] = useState('')

  const optionsQuery = useVisitOptions()
  const book = useAppointments({
    upcoming,
    date: date || undefined,
    departmentId: departmentId || undefined,
  })

  const appointments = book.data?.appointments ?? []
  const departments = optionsQuery.data?.departments ?? []
  const canClose = roles.includes('admin') || roles.includes('receptionist')

  function departmentName(department: VisitDepartmentOption): string {
    if (i18n.language === 'prs' && department.nameLocalPrs) return department.nameLocalPrs
    if (i18n.language === 'ps' && department.nameLocalPs) return department.nameLocalPs
    return department.name
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.appointments')} description={t('appointments.subtitle')} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={upcoming ? 'outline' : 'default'}
            onClick={() => setUpcoming(false)}
          >
            {t('appointments.oneDay')}
          </Button>
          <Button
            type="button"
            variant={upcoming ? 'default' : 'outline'}
            onClick={() => setUpcoming(true)}
          >
            {t('appointments.upcoming')}
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="apptFrom">
            {upcoming ? t('appointments.from') : t('appointments.fields.date')}
          </Label>
          <Input
            id="apptFrom"
            type="date"
            dir="ltr"
            value={date || (book.data?.date ?? '')}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="apptDept">{t('visits.fields.department')}</Label>
          <Select
            id="apptDept"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">{t('queue.allDepartments')}</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {departmentName(department)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {book.isError && <p className="text-sm text-destructive">{t('appointments.error')}</p>}

      {!book.isError && appointments.length === 0 && !book.isPending ? (
        <Card className="p-8 text-center">
          <CalendarDays className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-muted-foreground">{t('appointments.empty')}</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {appointments.map((appointment) => (
            <AppointmentRow
              key={appointment.id}
              appointment={appointment}
              canClose={canClose}
              showDate={upcoming}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function AppointmentRow({
  appointment,
  canClose,
  showDate,
}: {
  appointment: AppointmentSummary
  canClose: boolean
  showDate: boolean
}) {
  const { t } = useTranslation()
  const close = useCloseAppointment(appointment.id)
  const open = appointment.status === 'booked' || appointment.status === 'arrived'

  return (
    <li>
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <div className="min-w-48 flex-1">
          <Link
            to={`/patients/${appointment.patientId}`}
            className="font-semibold text-foreground hover:underline"
          >
            {appointment.patientName}
          </Link>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <span dir="ltr" className="font-mono">
              {appointment.patientMrn}
            </span>
            {appointment.patientPhone && (
              <>
                {' · '}
                <span dir="ltr">{appointment.patientPhone}</span>
              </>
            )}
          </p>
          {appointment.reason && (
            <p className="mt-1 text-sm text-foreground">{appointment.reason}</p>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          {showDate && (
            <p dir="ltr" className="font-medium text-foreground">
              {appointment.scheduledOn}
            </p>
          )}
          <p>
            {appointment.departmentName}
            {appointment.practitionerName
              ? ` · ${appointment.practitionerName}`
              : ` · ${t('appointments.book.anyDoctor')}`}
          </p>
        </div>

        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-medium',
            appointment.status === 'fulfilled'
              ? 'bg-success/15 text-success'
              : appointment.status === 'no_show'
                ? 'bg-destructive/10 text-destructive'
                : appointment.status === 'cancelled'
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-primary/10 text-primary',
          )}
        >
          {t(`appointments.status.${appointment.status}`)}
        </span>

        {/* Once it became a visit, the visit number is the answer to "did they come?" */}
        {appointment.visitNo && (
          <span dir="ltr" className="font-mono text-xs text-muted-foreground">
            {appointment.visitNo}
          </span>
        )}

        {canClose && open && (
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={close.isPending}
                onClick={() => close.mutate({ status: 'no_show', reason: null })}
              >
                {t('appointments.action.no_show')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={close.isPending}
                onClick={() => close.mutate({ status: 'cancelled', reason: null })}
              >
                {t('appointments.action.cancelled')}
              </Button>
            </div>
            {close.isError && (
              <p className="text-xs text-destructive">{t('appointments.action.failed')}</p>
            )}
          </div>
        )}
      </Card>
    </li>
  )
}
