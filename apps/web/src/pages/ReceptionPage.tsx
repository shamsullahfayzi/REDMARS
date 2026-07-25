import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Check, ChevronDown, ChevronRight, Printer, Search, UserPlus, X } from 'lucide-react'
import {
  DISCOUNT_CEILING_PCT,
  PATIENT_SEARCH_MIN,
  PAYMENT_METHODS,
  VISIT_CREATE_TYPES,
  checkInRequestSchema,
  currentAgeYears,
  type CheckInRequest,
  type PaymentMethod,
  type PatientSummary,
  type VisitCreateType,
  type VisitDepartmentOption,
} from '@redmars/shared'
import { CheckInReceipt } from '@/components/CheckInReceipt'
import { DuplicateNotice } from '@/components/DuplicateNotice'
import { PageHeader } from '@/components/PageHeader'
import { PatientFormFields } from '@/components/PatientFormFields'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useDebounced } from '@/hooks/useDebounced'
import { usePatientSearch } from '@/hooks/usePatientSearch'
import { toPayload, usePatientForm } from '@/hooks/usePatientForm'
import { conflictFromError, fromMinor, toMinor, useCheckIn } from '@/hooks/useReception'
import { useVisitOptions } from '@/hooks/useVisits'
import { cn } from '@/lib/utils'

/**
 * Task 3.6 — the reception desk. Not four screens. One.
 *
 * A patient arrives once and is dealt with once: found or registered, put in the queue,
 * billed, and paid for. Splitting that across four screens would split one conversation
 * into four, and every state in between is wrong — a visit with no bill, a bill with no
 * cash. So the four steps are four sections of a single form with a single Save.
 *
 * The layout is the argument. Who and why on the left, what it costs and how they paid
 * on the right, the total and the one button always in view. The receptionist should be
 * able to work top-left to bottom-right without going looking for anything.
 */
export function ReceptionPage() {
  const { t, i18n } = useTranslation()
  const optionsQuery = useVisitOptions()
  const checkIn = useCheckIn()

  // --- Step 1: who ---------------------------------------------------------------
  const [mode, setMode] = useState<'search' | 'new'>('new')
  const [term, setTerm] = useState('')
  const [chosen, setChosen] = useState<PatientSummary | null>(null)
  const search = usePatientSearch(useDebounced(term, 250), 1)
  const patientForm = usePatientForm()

  // --- Step 2: why ---------------------------------------------------------------
  const [visitType, setVisitType] = useState<VisitCreateType>('opd_consult')
  const [departmentId, setDepartmentId] = useState('')
  const [practitionerId, setPractitionerId] = useState('')
  const [chiefComplaint, setChiefComplaint] = useState('')

  // --- Step 3: what it costs -----------------------------------------------------
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [showAllServices, setShowAllServices] = useState(false)
  const [discount, setDiscount] = useState('')
  const [discountReason, setDiscountReason] = useState('')

  // --- Step 4: how they paid -----------------------------------------------------
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paymentReference, setPaymentReference] = useState('')

  const [formError, setFormError] = useState<string | null>(null)

  const departments = optionsQuery.data?.departments ?? []
  const practitioners = optionsQuery.data?.practitioners ?? []
  const services = optionsQuery.data?.services ?? []

  const availableDoctors = practitioners.filter((p) => p.departmentIds.includes(departmentId))
  const departmentServices = services.filter((s) => s.departmentId === departmentId)
  // The chosen department's prices first; the rest behind a toggle. A registration fee
  // often lives under administration, so "the rest" has to be reachable — just not in
  // the way on every single check-in.
  const otherServices = services.filter((s) => s.departmentId !== departmentId)

  useEffect(() => {
    const list = optionsQuery.data?.departments
    if (!departmentId && list?.length === 1) setDepartmentId(list[0].id)
  }, [optionsQuery.data, departmentId])

  const chosenServices = services.filter((s) => (quantities[s.id] ?? 0) > 0)
  const subtotalMinor = chosenServices.reduce(
    (sum, service) => sum + toMinor(service.fee) * quantities[service.id],
    0,
  )
  const discountMinor = discount.trim() === '' ? 0 : toMinor(discount.trim())
  // R10's ceiling, shown at the same number the server refuses at, so the desk is never
  // invited to type something that will bounce.
  const ceilingMinor = Math.floor((subtotalMinor * DISCOUNT_CEILING_PCT) / 100)
  const overCeiling = discountMinor > ceilingMinor
  const totalMinor = Math.max(0, subtotalMinor - discountMinor)

  const conflict = conflictFromError(checkIn.error)

  function setQuantity(serviceId: string, quantity: number) {
    setQuantities((prev) => ({ ...prev, [serviceId]: Math.max(0, quantity) }))
  }

  function buildPayload(overrides: Partial<CheckInRequest> = {}) {
    const patientHalf =
      mode === 'new'
        ? { patient: toPayload(patientForm.values), patientId: null }
        : { patient: null, patientId: chosen?.id ?? null }

    return {
      ...patientHalf,
      visit: {
        type: visitType,
        departmentId,
        practitionerId: practitionerId || null,
        chiefComplaint: chiefComplaint.trim() || null,
        referredBy: null,
        referralSource: null,
      },
      items: chosenServices.map((service) => ({
        serviceId: service.id,
        quantity: quantities[service.id],
      })),
      discount: discountMinor > 0 ? fromMinor(discountMinor) : '0',
      discountReason: discountReason.trim() || null,
      paymentMethod,
      paymentReference: paymentReference.trim() || null,
      acknowledgeDuplicate: false,
      acknowledgeOpenVisit: false,
      ...overrides,
    }
  }

  function submit(overrides: Partial<CheckInRequest> = {}) {
    setFormError(null)
    const parsed = checkInRequestSchema.safeParse(buildPayload(overrides))
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? t('reception.invalid'))
      return // never fall through to mutate with undefined data
    }
    checkIn.mutate(parsed.data as CheckInRequest)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    submit()
  }

  function startAnother() {
    checkIn.reset()
    setMode('search')
    setTerm('')
    setChosen(null)
    patientForm.reset()
    setChiefComplaint('')
    setQuantities({})
    setDiscount('')
    setDiscountReason('')
    setPaymentReference('')
    setFormError(null)
  }

  function departmentName(department: VisitDepartmentOption): string {
    if (i18n.language === 'prs' && department.nameLocalPrs) return department.nameLocalPrs
    if (i18n.language === 'ps' && department.nameLocalPs) return department.nameLocalPs
    return department.name
  }

  // --- Done: the slip ------------------------------------------------------------
  if (checkIn.data) {
    return (
      <div className="space-y-6">
        <div className="print:hidden">
          <PageHeader title={t('reception.done.title')} />
        </div>

        <Card className="max-w-2xl p-6 print:max-w-none print:border-0 print:p-0 print:shadow-none">
          <div className="mb-4 flex items-center gap-2 text-success print:hidden">
            <Check className="size-5" aria-hidden />
            <p className="font-medium">{t('reception.done.saved')}</p>
          </div>

          <CheckInReceipt result={checkIn.data} />

          <div className="mt-6 flex flex-wrap gap-3 print:hidden">
            <Button type="button" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden />
              {t('reception.done.print')}
            </Button>
            {/* Primary in practice: there is a queue at the window. */}
            <Button type="button" variant="outline" onClick={startAnother}>
              <UserPlus className="size-4" aria-hidden />
              {t('reception.done.next')}
            </Button>
            <Link
              to={`/patients/${checkIn.data.patient.id}`}
              className={cn(buttonVariants({ variant: 'ghost' }))}
            >
              {t('reception.done.openRecord')}
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  // --- The desk ------------------------------------------------------------------
  const patientReady = mode === 'new' ? patientForm.values.firstName.trim().length > 0 : chosen != null

  return (
    <div className="space-y-6">
      <PageHeader title={t('reception.title')} description={t('reception.subtitle')} />

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-2" noValidate>
        {/* Left: who, and why they came. */}
        <div className="space-y-6">
          <Section step={1} title={t('reception.steps.patient')}>
            {mode === 'search' ? (
              <div className="space-y-3">
                {chosen ? (
                  <ChosenPatient patient={chosen} onClear={() => setChosen(null)} />
                ) : (
                  <>
                    <div className="relative">
                      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                        placeholder={t('patients.search.placeholder')}
                        className="ps-9"
                        autoFocus
                      />
                    </div>
                    {term.trim().length >= PATIENT_SEARCH_MIN && (
                      <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                        {(search.data?.patients ?? []).map((patient) => (
                          <li key={patient.id}>
                            <button
                              type="button"
                              onClick={() => setChosen(patient)}
                              className="flex w-full items-baseline justify-between gap-3 p-3 text-start text-sm hover:bg-muted"
                            >
                              <span className="font-medium text-foreground">
                                {[patient.prefix, patient.firstName, patient.lastName]
                                  .filter(Boolean)
                                  .join(' ')}
                              </span>
                              <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                                {patient.mrn}
                                {patient.phone ? ` · ${patient.phone}` : ''}
                              </span>
                            </button>
                          </li>
                        ))}
                        {search.data?.patients.length === 0 && (
                          <li className="p-3 text-sm text-muted-foreground">
                            {t('patients.search.empty')}
                          </li>
                        )}
                      </ul>
                    )}
                    <Button type="button" variant="outline" onClick={() => setMode('new')}>
                      <UserPlus className="size-4" aria-hidden />
                      {t('reception.newPatient')}
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                <PatientFormFields
                  values={patientForm.values}
                  set={patientForm.set}
                  errors={patientForm.errors}
                  autoFocus
                />
                <Button type="button" variant="ghost" onClick={() => setMode('search')}>
                  {t('reception.searchInstead')}
                </Button>
              </div>
            )}
          </Section>

          <Section step={2} title={t('reception.steps.visit')}>
            <div className="space-y-1.5">
              <Label>{t('visits.fields.type')}</Label>
              <div className="flex flex-wrap gap-2">
                {VISIT_CREATE_TYPES.map((option) => (
                  <Chip
                    key={option}
                    active={visitType === option}
                    onClick={() => setVisitType(option)}
                    label={t(`visits.type.${option}`)}
                  />
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
                onChange={(e) => {
                  setDepartmentId(e.target.value)
                  // The doctor and the prices both belong to the old department.
                  setPractitionerId('')
                  setQuantities({})
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
              <Label htmlFor="practitionerId">{t('visits.fields.practitioner')}</Label>
              <Select
                id="practitionerId"
                value={practitionerId}
                disabled={!departmentId}
                onChange={(e) => setPractitionerId(e.target.value)}
              >
                <option value="">{t('visits.create.noDoctor')}</option>
                {availableDoctors.map((practitioner) => (
                  <option key={practitioner.id} value={practitioner.id}>
                    {practitioner.name}
                    {practitioner.specialityName ? ` — ${practitioner.specialityName}` : ''}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="chiefComplaint">{t('visits.fields.chiefComplaint')}</Label>
              <Textarea
                id="chiefComplaint"
                rows={2}
                value={chiefComplaint}
                placeholder={t('visits.create.complaintPlaceholder')}
                onChange={(e) => setChiefComplaint(e.target.value)}
              />
            </div>
          </Section>
        </div>

        {/* Right: the money, and the one button. */}
        <div className="space-y-6">
          <Section step={3} title={t('reception.steps.bill')}>
            {!departmentId ? (
              <p className="text-sm text-muted-foreground">{t('reception.bill.chooseFirst')}</p>
            ) : (
              <>
                <ServiceList
                  services={departmentServices}
                  quantities={quantities}
                  setQuantity={setQuantity}
                  emptyLabel={t('reception.bill.noneHere')}
                />

                {otherServices.length > 0 && (
                  <div className="border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => setShowAllServices((open) => !open)}
                      className="flex items-center gap-1.5 text-sm font-medium text-foreground"
                      aria-expanded={showAllServices}
                    >
                      {showAllServices ? (
                        <ChevronDown className="size-4" aria-hidden />
                      ) : (
                        <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
                      )}
                      {t('reception.bill.moreServices')}
                    </button>
                    {showAllServices && (
                      <div className="mt-3">
                        <ServiceList
                          services={otherServices}
                          quantities={quantities}
                          setQuantity={setQuantity}
                          emptyLabel=""
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-3 border-t border-border pt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="discount">{t('reception.bill.discount')}</Label>
                      <Input
                        id="discount"
                        dir="ltr"
                        inputMode="decimal"
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value)}
                        aria-invalid={overCeiling}
                      />
                      <p
                        className={cn(
                          'text-xs',
                          overCeiling ? 'text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {t('reception.bill.ceiling', {
                          pct: DISCOUNT_CEILING_PCT,
                          max: fromMinor(ceilingMinor),
                        })}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="discountReason">{t('reception.bill.reason')}</Label>
                      <Input
                        id="discountReason"
                        value={discountReason}
                        disabled={discountMinor <= 0}
                        onChange={(e) => setDiscountReason(e.target.value)}
                      />
                    </div>
                  </div>

                  <dl className="space-y-1 text-sm">
                    <div className="flex items-baseline justify-between">
                      <dt className="text-muted-foreground">{t('reception.bill.subtotal')}</dt>
                      <dd className="font-mono text-foreground" dir="ltr">
                        {fromMinor(subtotalMinor)}
                      </dd>
                    </div>
                    {discountMinor > 0 && (
                      <div className="flex items-baseline justify-between">
                        <dt className="text-muted-foreground">{t('reception.bill.discount')}</dt>
                        <dd className="font-mono text-foreground" dir="ltr">
                          −{fromMinor(discountMinor)}
                        </dd>
                      </div>
                    )}
                    <div className="flex items-baseline justify-between border-t border-border pt-2">
                      <dt className="font-semibold text-foreground">{t('reception.bill.total')}</dt>
                      <dd className="font-mono text-xl font-bold text-foreground" dir="ltr">
                        {fromMinor(totalMinor)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </>
            )}
          </Section>

          <Section step={4} title={t('reception.steps.payment')}>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((method) => (
                <Chip
                  key={method}
                  active={paymentMethod === method}
                  onClick={() => setPaymentMethod(method)}
                  label={t(`reception.payment.method.${method}`)}
                />
              ))}
            </div>

            {paymentMethod !== 'cash' && (
              <div className="space-y-1.5">
                <Label htmlFor="paymentReference">{t('reception.payment.reference')}</Label>
                <Input
                  id="paymentReference"
                  dir="ltr"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                />
              </div>
            )}
          </Section>

          {/* The server refused and named what it found. Never a dead end. */}
          {conflict?.kind === 'duplicate' && (
            <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
              <DuplicateNotice matches={conflict.matches} tone="blocking" />
              <Button
                type="button"
                variant="outline"
                onClick={() => submit({ acknowledgeDuplicate: true })}
                disabled={checkIn.isPending}
              >
                {t('patients.duplicates.registerAnyway')}
              </Button>
            </div>
          )}

          {conflict?.kind === 'openVisit' && (
            <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
              <p className="text-sm font-medium text-foreground">{t('visits.open.title')}</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {conflict.visits.map((visit) => (
                  <li key={visit.id}>
                    <span dir="ltr" className="font-mono">
                      {visit.visitNo}
                    </span>
                    {' · '}
                    {visit.departmentName}
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                onClick={() => submit({ acknowledgeOpenVisit: true })}
                disabled={checkIn.isPending}
              >
                {t('visits.open.startAnyway')}
              </Button>
            </div>
          )}

          {formError && <p className="text-sm text-destructive">{formError}</p>}
          {checkIn.isError && !conflict && (
            <p className="text-sm text-destructive">{t('reception.error')}</p>
          )}
          {optionsQuery.isError && (
            <p className="text-sm text-destructive">{t('visits.create.optionsError')}</p>
          )}

          <Card className="p-4">
            <Button
              type="submit"
              className="w-full"
              disabled={
                checkIn.isPending || !patientReady || !departmentId || chosenServices.length === 0
              }
            >
              {checkIn.isPending
                ? t('reception.saving')
                : t('reception.submit', { amount: fromMinor(totalMinor) })}
            </Button>
            {/* Says out loud what the one button is about to do, because it does four things. */}
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {t('reception.submitHint')}
            </p>
          </Card>
        </div>
      </form>
    </div>
  )
}

function Section({
  step,
  title,
  children,
}: {
  step: number
  title: string
  children: React.ReactNode
}) {
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        {/* Numbered because these ARE a sequence — the desk works through them in order,
            and step 3 cannot be answered before step 2 names a department. */}
        <span
          className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
          aria-hidden
        >
          {step}
        </span>
        <h2 className="font-medium text-foreground">{title}</h2>
      </div>
      {children}
    </Card>
  )
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-lg border px-3 py-2 text-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-background text-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  )
}

function ChosenPatient({
  patient,
  onClear,
}: {
  patient: PatientSummary
  onClear: () => void
}) {
  const { t } = useTranslation()
  const age = currentAgeYears(patient)

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/50 p-3">
      <div>
        <p className="font-semibold text-foreground">
          {[patient.prefix, patient.firstName, patient.lastName].filter(Boolean).join(' ')}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          <span dir="ltr" className="font-mono">
            {patient.mrn}
          </span>
          {' · '}
          {t(`patients.gender.${patient.gender}`)}
          {age != null && ` · ${t('patients.search.years', { count: age })}`}
        </p>
      </div>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onClear} aria-label={t('reception.clearPatient')}>
        <X className="size-4" />
      </Button>
    </div>
  )
}

function ServiceList({
  services,
  quantities,
  setQuantity,
  emptyLabel,
}: {
  services: readonly { id: string; name: string; fee: string }[]
  quantities: Record<string, number>
  setQuantity: (serviceId: string, quantity: number) => void
  emptyLabel: string
}) {
  if (services.length === 0) {
    return emptyLabel ? <p className="text-sm text-muted-foreground">{emptyLabel}</p> : null
  }

  return (
    <ul className="space-y-1">
      {services.map((service) => {
        const quantity = quantities[service.id] ?? 0
        const picked = quantity > 0
        return (
          <li key={service.id} className="flex items-center gap-3">
            <label className="flex flex-1 cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-muted">
              <input
                type="checkbox"
                checked={picked}
                onChange={(e) => setQuantity(service.id, e.target.checked ? 1 : 0)}
                className="size-4 accent-primary"
              />
              <span className="flex-1 text-sm text-foreground">{service.name}</span>
              <span dir="ltr" className="font-mono text-sm text-muted-foreground">
                {service.fee}
              </span>
            </label>
            {/* The quantity box only exists once the line does — an input that does
                nothing is an input to skip past on every registration. */}
            {picked && (
              <Input
                type="number"
                min={1}
                max={99}
                dir="ltr"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(service.id, Number(e.target.value))}
                className="w-16"
                aria-label={`${service.name} quantity`}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}
