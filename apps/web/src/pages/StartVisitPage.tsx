import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Check, ChevronDown, ChevronRight, Stethoscope } from 'lucide-react'
import {
  VISIT_CREATE_TYPES,
  createVisitRequestSchema,
  currentAgeYears,
  type CreateVisitRequest,
  type VisitCreateType,
  type VisitDepartmentOption,
} from '@redmars/shared'
import { PageHeader } from '@/components/PageHeader'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { usePatientDetail } from '@/hooks/usePatient'
import { openVisitsFromError, useCreateVisit, useVisitOptions } from '@/hooks/useVisits'
import { cn } from '@/lib/utils'

/**
 * Task 3.5 — start a visit for a patient who is standing at the window.
 *
 * A patient is registered once and visits many times, so this screen begins from a
 * patient who already exists. The only field the receptionist really composes is the
 * chief complaint; everything above it is a choice between things the facility already
 * has, which is why they are pickers and why the complaint gets the focus.
 *
 * Task 3.6 folds this into one screen with registration, billing and payment. It is
 * built as a step rather than a dead end so that merge is a move, not a rewrite.
 */
export function StartVisitPage() {
  const { t, i18n } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const patientQuery = usePatientDetail(id)
  const optionsQuery = useVisitOptions()
  const createVisit = useCreateVisit()

  const [type, setType] = useState<VisitCreateType>('opd_consult')
  const [departmentId, setDepartmentId] = useState('')
  const [practitionerId, setPractitionerId] = useState('')
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [referredBy, setReferredBy] = useState('')
  const [referralSource, setReferralSource] = useState('')
  const [showReferral, setShowReferral] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patient = patientQuery.data
  const departments = optionsQuery.data?.departments ?? []
  const practitioners = optionsQuery.data?.practitioners ?? []

  // Only the doctors who actually work in the chosen department. The server refuses the
  // rest anyway (a visit filed outside a doctor's department never reaches his queue);
  // this just means the desk is never offered the wrong answer.
  const available = practitioners.filter((p) => p.departmentIds.includes(departmentId))

  // One department is the common case at a forty-bed hospital — choose it for her.
  // Keyed on the query data, not on the derived array: `departments` is a fresh `[]`
  // on every render while the request is in flight, which would re-run this forever.
  useEffect(() => {
    const list = optionsQuery.data?.departments
    if (!departmentId && list?.length === 1) setDepartmentId(list[0].id)
  }, [optionsQuery.data, departmentId])

  // A doctor is cleared where the department CHANGES, not in an effect watching the
  // filtered list. The chosen doctor may not work in the new department, and a stale
  // selection is the one thing the server would reject after she has stopped looking.
  function chooseDepartment(next: string) {
    setDepartmentId(next)
    setPractitionerId('')
  }

  const openVisits = openVisitsFromError(createVisit.error)

  function submit(acknowledgeOpenVisit: boolean) {
    setError(null)
    const parsed = createVisitRequestSchema.safeParse({
      patientId: id,
      type,
      departmentId,
      practitionerId: practitionerId || null,
      chiefComplaint: chiefComplaint.trim() || null,
      referredBy: referredBy.trim() || null,
      referralSource: referralSource.trim() || null,
      acknowledgeOpenVisit,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('visits.create.invalid'))
      return // never fall through to mutate with undefined data
    }
    createVisit.mutate(parsed.data as CreateVisitRequest)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    submit(false)
  }

  /** Departments carry Dari and Pashto names; show the one the interface is speaking. */
  function departmentName(department: VisitDepartmentOption): string {
    if (i18n.language === 'prs' && department.nameLocalPrs) return department.nameLocalPrs
    if (i18n.language === 'ps' && department.nameLocalPs) return department.nameLocalPs
    return department.name
  }

  const visit = createVisit.data

  // --- Success: the visit number is the receipt --------------------------------------
  if (visit) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('visits.create.title')} />
        <Card className="max-w-lg space-y-5 p-6">
          <div className="flex items-center gap-2 text-success">
            <Check className="size-5" aria-hidden />
            <p className="font-medium">{t('visits.create.started')}</p>
          </div>

          <p className="text-lg font-semibold text-foreground">{visit.patientName}</p>

          <div className="rounded-lg bg-muted p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('visits.fields.visitNo')}
            </p>
            {/* Always LTR: an identifier reads left-to-right even on an RTL page. */}
            <span dir="ltr" className="font-mono text-2xl font-bold text-foreground">
              {visit.visitNo}
            </span>
            <p className="mt-2 text-sm text-muted-foreground">
              {visit.departmentName}
              {visit.practitionerName ? ` · ${visit.practitionerName}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link to="/patients" className={cn(buttonVariants())}>
              {t('visits.create.nextPatient')}
            </Link>
            <Link
              to={`/patients/${visit.patientId}`}
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              {t('visits.create.backToPatient')}
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  // --- The form ---------------------------------------------------------------------
  const age = patient ? currentAgeYears(patient) : null

  return (
    <div className="space-y-6">
      <Link
        to={id ? `/patients/${id}` : '/patients'}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t('visits.create.back')}
      </Link>

      <PageHeader title={t('visits.create.title')} description={t('visits.create.subtitle')} />

      {/* Who this is. She is about to file a clinical record against a person — the name
          and the MRN are here so the wrong one is visible before it is saved. */}
      {patient && (
        <Card className="max-w-lg p-4">
          <p className="font-semibold text-foreground">
            {[patient.prefix, patient.firstName, patient.lastName].filter(Boolean).join(' ')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            <span dir="ltr" className="font-mono">
              {patient.mrn}
            </span>
            {' · '}
            {t(`patients.gender.${patient.gender}`)}
            {age != null && ` · ${t('patients.search.years', { count: age })}`}
          </p>
        </Card>
      )}

      <Card className="max-w-lg p-6">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <div className="space-y-1.5">
            <Label>{t('visits.fields.type')}</Label>
            {/* Segmented rather than a dropdown: five fixed choices, one tap each, and
                the current one stays visible. */}
            <div className="flex flex-wrap gap-2">
              {VISIT_CREATE_TYPES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={type === option}
                  onClick={() => setType(option)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    type === option
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background text-foreground hover:bg-muted',
                  )}
                >
                  {t(`visits.type.${option}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="departmentId">
              {t('visits.fields.department')}
              <span className="ms-0.5 text-destructive">*</span>
            </Label>
            <Select
              id="departmentId"
              value={departmentId}
              onChange={(e) => chooseDepartment(e.target.value)}
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
            <Label htmlFor="practitionerId">{t('visits.fields.practitioner')}</Label>
            <Select
              id="practitionerId"
              value={practitionerId}
              disabled={!departmentId}
              onChange={(e) => setPractitionerId(e.target.value)}
            >
              <option value="">{t('visits.create.noDoctor')}</option>
              {available.map((practitioner) => (
                <option key={practitioner.id} value={practitioner.id}>
                  {practitioner.name}
                  {practitioner.specialityName ? ` — ${practitioner.specialityName}` : ''}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              {departmentId && available.length === 0
                ? t('visits.create.noDoctorsHere')
                : t('visits.create.doctorHint')}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="chiefComplaint">{t('visits.fields.chiefComplaint')}</Label>
            {/* The one field she composes rather than picks, so it gets the focus. */}
            <Textarea
              id="chiefComplaint"
              rows={3}
              autoFocus
              value={chiefComplaint}
              placeholder={t('visits.create.complaintPlaceholder')}
              onChange={(e) => setChiefComplaint(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('visits.create.complaintHint')}</p>
          </div>

          {/* Referral is real data — it is how the hospital learns who sends it patients —
              but it applies to a minority of arrivals, so it does not cost a tab stop. */}
          <div className="border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setShowReferral((open) => !open)}
              className="flex w-full items-center gap-1.5 text-sm font-medium text-foreground"
              aria-expanded={showReferral}
            >
              {showReferral ? (
                <ChevronDown className="size-4" aria-hidden />
              ) : (
                <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
              )}
              {t('visits.create.referral')}
            </button>

            {showReferral && (
              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="referredBy">{t('visits.fields.referredBy')}</Label>
                  <Input
                    id="referredBy"
                    value={referredBy}
                    autoComplete="off"
                    onChange={(e) => setReferredBy(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="referralSource">{t('visits.fields.referralSource')}</Label>
                  <Input
                    id="referralSource"
                    value={referralSource}
                    autoComplete="off"
                    onChange={(e) => setReferralSource(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* The server refused. Show the visit she already has and let her decide —
              never a dead end, same as the duplicate-patient guard. */}
          {openVisits && openVisits.length > 0 && (
            <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
              <p className="text-sm font-medium text-foreground">{t('visits.open.title')}</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {openVisits.map((open) => (
                  <li key={open.id}>
                    <span dir="ltr" className="font-mono">
                      {open.visitNo}
                    </span>
                    {' · '}
                    {open.departmentName}
                    {' · '}
                    {t(`visits.status.${open.status}`)}
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                onClick={() => submit(true)}
                disabled={createVisit.isPending}
              >
                {t('visits.open.startAnyway')}
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {createVisit.isError && !openVisits && (
            <p className="text-sm text-destructive">{t('visits.create.error')}</p>
          )}
          {optionsQuery.isError && (
            <p className="text-sm text-destructive">{t('visits.create.optionsError')}</p>
          )}

          <div className="flex items-center gap-3 border-t border-border pt-4">
            <Button type="submit" disabled={createVisit.isPending || !departmentId}>
              <Stethoscope className="size-4" aria-hidden />
              {createVisit.isPending ? t('visits.create.saving') : t('visits.create.submit')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
