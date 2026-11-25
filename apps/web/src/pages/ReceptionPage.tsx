import './reception-desk.css'
import { BookFollowUp } from '@/components/BookFollowUp'
import { useAuth } from '@/auth/authContext'
import { useCreatePatient, duplicateMatchesFromError } from '@/hooks/usePatient'
import { moneyDecimal, parseMoneyInput } from '@redmars/shared'
import { PatientIdCard } from '@/components/PatientIdCard'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDebounced } from '@/hooks/useDebounced'
import { useDiscountCeiling } from '@/hooks/useDiscountCeiling'
import { usePatientSearch } from '@/hooks/usePatientSearch'
import { toPayload, usePatientForm } from '@/hooks/usePatientForm'
import { conflictFromError, useCheckIn } from '@/hooks/useReception'
import { useVisitOptions } from '@/hooks/useVisits'
import { printTarget } from '@/lib/print'
import { cn } from '@/lib/utils'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  createPatientRequestSchema,
  checkInRequestSchema,
  currentAgeYears,
  DISCOUNT_MAX_PERCENT_DEFAULT,
  PATIENT_SEARCH_MIN,
  PAYMENT_METHODS,
  VISIT_CREATE_TYPES,
  type CheckInRequest,
  type PatientSummary,
  type PaymentMethod,
  type VisitCreateType,
  type VisitDepartmentOption,
  type VisitPractitionerOption,
} from '@redmars/shared'
import { useTranslation } from 'react-i18next'
import { CheckInReceipt } from '@/components/CheckInReceipt'
import { DuplicateNotice } from '@/components/DuplicateNotice'
import { PageHeader } from '@/components/PageHeader'
import { PatientFormFields } from '@/components/PatientFormFields'
import { Check, Printer, CreditCard, UserPlus, Search, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'

export function ReceptionPage() {
  const { t, i18n } = useTranslation()
  const { roles } = useAuth()
  const [booking, setBooking] = useState(false)
  const register = useCreatePatient()
  const registrationMatches = duplicateMatchesFromError(register.error)
  const [searchParams] = useSearchParams()
  const optionsQuery = useVisitOptions()
  const checkIn = useCheckIn()
  const ceilingQuery = useDiscountCeiling()
  const maxDiscountPercent = ceilingQuery.data?.maxPercent ?? DISCOUNT_MAX_PERCENT_DEFAULT

  // --- Step 1: who ---------------------------------------------------------------
  const [mode, setMode] = useState<'search' | 'new'>('new')
  const [term, setTerm] = useState('')
  const [chosen, setChosen] = useState<PatientSummary | null>(null)
  const search = usePatientSearch(useDebounced(term, 250), 1)
  const patientForm = usePatientForm()

  // --- Step 2: why ---------------------------------------------------------------
  const requestedType = searchParams.get('type')
  const [visitType, setVisitType] = useState<VisitCreateType>(
    requestedType === 'emergency' ? 'emergency' : 'opd_consult',
  )
  const [departmentId, setDepartmentId] = useState('')
  const [departmentSearch, setDepartmentSearch] = useState('')
  const [showDepartmentDropdown, setShowDepartmentDropdown] = useState(false)
  const [practitionerId, setPractitionerId] = useState('')
  const [doctorSearch, setDoctorSearch] = useState('')
  const [showDoctorDropdown, setShowDoctorDropdown] = useState(false)

  // --- Step 3: what it costs -----------------------------------------------------
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [serviceSearch, setServiceSearch] = useState('')
  const [discount, setDiscount] = useState('')
  const [discountPercentText, setDiscountPercentText] = useState('')
  const [discountReason, setDiscountReason] = useState('')

  // --- Step 4: how they paid -----------------------------------------------------
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paymentReference, setPaymentReference] = useState('')

  const [formError, setFormError] = useState<string | null>(null)

  const departmentRef = useRef<HTMLDivElement>(null)
  const doctorRef = useRef<HTMLDivElement>(null)
  const patientSearchInputRef = useRef<HTMLInputElement>(null)
  const departmentInputRef = useRef<HTMLInputElement>(null)
  const doctorInputRef = useRef<HTMLInputElement>(null)
  const serviceSearchInputRef = useRef<HTMLInputElement>(null)

  const departments = optionsQuery.data?.departments ?? []
  const practitioners = optionsQuery.data?.practitioners ?? []
  const services = optionsQuery.data?.services ?? []

  const availableDoctors = practitioners.filter((p) => p.departmentIds.includes(departmentId))
  const departmentServices = services.filter((s) => s.departmentId === departmentId)
  const otherServices = services.filter((s) => s.departmentId !== departmentId)

  // Department search: code first (a receptionist typing "OPD" means the code, not
  // the localized display name), name as a fallback for browsing — same reasoning as
  // the doctor search just below.
  const filteredDepartments = departments.filter((d) => {
    const q = departmentSearch.trim().toLowerCase()
    if (!q) return true
    return d.code.toLowerCase().includes(q) || departmentName(d).toLowerCase().includes(q)
  })

  // Doctor search: code first (a receptionist typing "01" means the code, not four
  // letters of a name), name as a fallback for browsing.
  const filteredDoctors = availableDoctors.filter((p) => {
    const q = doctorSearch.trim().toLowerCase()
    if (!q) return true
    return p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
  })

  // Filter services based on search
  const filteredDeptServices = departmentServices.filter((s) =>
    s.name.toLowerCase().includes(serviceSearch.toLowerCase()),
  )
  const filteredOtherServices = otherServices.filter((s) =>
    s.name.toLowerCase().includes(serviceSearch.toLowerCase()),
  )

  useEffect(() => {
    const list = optionsQuery.data?.departments
    if (!departmentId && list?.length === 1) setDepartmentId(list[0].id)
  }, [optionsQuery.data, departmentId])

  // Close department/doctor dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (departmentRef.current && !departmentRef.current.contains(e.target as Node)) {
        setShowDepartmentDropdown(false)
      }
      if (doctorRef.current && !doctorRef.current.contains(e.target as Node)) {
        setShowDoctorDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const chosenServices = services.filter((s) => (quantities[s.id] ?? 0) > 0)
  const subtotalAmount = chosenServices.reduce(
    (sum, service) => sum.add(moneyDecimal(service.fee).mul(String(quantities[service.id]))),
    moneyDecimal('0'),
  )
  const discountAmount = parseMoneyInput(discount) ?? moneyDecimal('0')
  const ceilingAmount = subtotalAmount.mul(String(maxDiscountPercent)).div('100').toDecimalPlaces(2, 1)
  const overCeiling = discountAmount.gt(ceilingAmount)
  const totalAmount = subtotalAmount.gt(discountAmount)
    ? subtotalAmount.sub(discountAmount)
    : moneyDecimal('0')

  const selectedDepartment = departments.find((d) => d.id === departmentId)
  const conflict = conflictFromError(checkIn.error)

  function setQuantity(serviceId: string, quantity: number) {
    setQuantities((prev) => ({ ...prev, [serviceId]: Math.max(0, quantity) }))
  }

  function chooseDepartment(dept: VisitDepartmentOption) {
    setDepartmentId(dept.id)
    setDepartmentSearch('')
    setShowDepartmentDropdown(false)
    setPractitionerId('')
    setDoctorSearch('')

    // A department can BE a service too — Axon's "OPD" department carries a same-named
    // "OPD" consultation fee. Auto-apply it instead of making the receptionist find and
    // click the very thing they just chose, a second time, in a list on the other side of
    // the screen. Matched against the department's CODE or base name, never the localized
    // display name — service names aren't translated, so "OPD" only ever matches "OPD".
    // Only when exactly one service matches: Medi-Pro data has several "OPD" services at
    // different fees, and silently picking the first would bill the wrong one.
    const sameNameMatches = services.filter(
      (s) =>
        s.departmentId === dept.id &&
        (s.name.trim().toLowerCase() === dept.code.trim().toLowerCase() ||
          s.name.trim().toLowerCase() === dept.name.trim().toLowerCase()),
    )
    setQuantities(sameNameMatches.length === 1 ? { [sameNameMatches[0].id]: 1 } : {})
  }

  function chooseDoctor(doctor: VisitPractitionerOption) {
    setPractitionerId(doctor.id)
    setDoctorSearch('')
    setShowDoctorDropdown(false)
  }

  /**
   * Same fast path as the doctor field below, one step earlier: type "OPD" and the
   * department is chosen the instant it's the only code match, no click needed. Safe for
   * the same reason a wrong doctor is — a wrong department here is a one-click fix
   * (`chooseDepartment` clears the doctor/services it would otherwise mismatch) before the
   * patient leaves the desk, not a clinical decision made at speed.
   */
  function onDepartmentSearchChange(value: string) {
    setDepartmentSearch(value)
    setShowDepartmentDropdown(true)
    const needle = value.trim().toLowerCase()
    if (!needle) return
    const exact = departments.filter((d) => d.code.toLowerCase() === needle)
    if (exact.length === 1) chooseDepartment(exact[0])
  }

  /**
   * Speed over safety, on purpose — this is a doctor row on a bill, not a drug order. A
   * receptionist typing a code should never have to look up from the keyboard: as soon as
   * what's typed exactly matches exactly one available doctor's code, it's chosen. This is
   * NOT the pattern for the prescription drug picker (`PrescriptionTab.tsx`'s `DrugPicker`),
   * which stays a deliberate list — a wrong drug picked at speed is a dosing error, a wrong
   * doctor on a reception bill is a one-click fix before the patient leaves the desk.
   */
  function onDoctorSearchChange(value: string) {
    setDoctorSearch(value)
    setShowDoctorDropdown(true)
    const needle = value.trim().toLowerCase()
    if (!needle) return
    const exact = availableDoctors.filter((p) => p.code.toLowerCase() === needle)
    if (exact.length === 1) chooseDoctor(exact[0])
  }

  // Everything on this screen lives in one <form>, so an Enter pressed anywhere would
  // otherwise submit the whole check-in from whatever partial state it caught — a
  // receptionist typing a service name and pressing Enter out of habit could check a
  // patient in against the wrong bill. This is the one place that rule is enforced: Enter
  // only ever does the thing each field's own handler below says it does, never a submit
  // it wasn't asked for.
  function onFormKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target
    if (!(target instanceof HTMLElement)) return

    if (event.key === 'Escape' && (showDepartmentDropdown || showDoctorDropdown)) {
      setShowDepartmentDropdown(false)
      setShowDoctorDropdown(false)
      return
    }

    if (event.key !== 'Enter') return
    if (
      target.tagName === 'TEXTAREA' ||
      target instanceof HTMLButtonElement ||
      target instanceof HTMLSelectElement
    )
      return
    event.preventDefault()

    if (target === patientSearchInputRef.current) {
      const top = search.data?.patients[0]
      if (top) setChosen(top)
      return
    }

    if (target === departmentInputRef.current && showDepartmentDropdown) {
      if (filteredDepartments.length === 1) chooseDepartment(filteredDepartments[0])
      return
    }

    // Falls back to name-browse: typing enough of a name to narrow to one doctor and
    // pressing Enter selects them, same as the department field above. The instant
    // code match in `onDoctorSearchChange` already covers the fast path.
    if (target === doctorInputRef.current && showDoctorDropdown) {
      if (filteredDoctors.length === 1) chooseDoctor(filteredDoctors[0])
      return
    }

    if (target === serviceSearchInputRef.current) {
      const matches = [...filteredDeptServices, ...filteredOtherServices]
      if (matches.length === 1) {
        const match = matches[0]
        setQuantity(match.id, (quantities[match.id] ?? 0) + 1)
        setServiceSearch('')
      }
    }
  }

  // Amount and percentage are two windows on the one number the server ever sees — the
  // request carries only `discount` (task 6b.1's second field is UI convenience, not a
  // second source of truth; the server still computes off the catalog subtotal).
  function onDiscountAmountChange(text: string) {
    setDiscount(text)
    const minor = parseMoneyInput(text) ?? moneyDecimal('0')
    setDiscountPercentText(subtotalAmount.gt('0') ? minor.div(subtotalAmount).mul('100').toFixed(2) : '')
  }

  function onDiscountPercentChange(text: string) {
    setDiscountPercentText(text)
    if (text.trim() === '') {
      setDiscount('')
      return
    }
    const pct = parseMoneyInput(text)
    if (!pct) return
    setDiscount(subtotalAmount.mul(pct).div('100').toFixed(2))
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
        chiefComplaint: null,
        referredBy: null,
        referralSource: null,
      },
      items: chosenServices.map((service) => ({
        serviceId: service.id,
        quantity: quantities[service.id],
      })),
      discount: discountAmount.gt('0') ? discountAmount.toFixed(2) : '0',
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
      return
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
    setQuantities({})
    setDiscount('')
    setDiscountPercentText('')
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
      <div className="space-y-4 p-4">
        <div className="print:hidden">
          <PageHeader title={t('reception.done.title')} />
        </div>
        <Card className="max-w-2xl p-4 print:max-w-none print:border-0 print:p-0 print:shadow-none">
          <div className="mb-3 flex items-center gap-2 text-success print:hidden">
            <Check className="size-4" aria-hidden />
            <p className="text-sm font-medium">{t('reception.done.saved')}</p>
          </div>
          <CheckInReceipt result={checkIn.data} />
          {checkIn.data.patient.isNew && <PatientIdCard result={checkIn.data} />}
          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            <Button type="button" size="sm" onClick={() => window.print()}>
              <Printer className="size-3" aria-hidden />
              {t('reception.done.print')}
            </Button>
            {checkIn.data.patient.isNew && (
              <Button type="button" size="sm" variant="outline" onClick={() => printTarget('id-card')}>
                <CreditCard className="size-3" aria-hidden />
                {t('reception.done.printIdCard')}
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" onClick={startAnother}>
              <UserPlus className="size-3" aria-hidden />
              {t('reception.done.next')}
            </Button>
            <Link
              to={`/patients/${checkIn.data.patient.id}`}
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
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

  function registerForBooking(acknowledgeDuplicate = false) {
    const parsed = createPatientRequestSchema.safeParse(toPayload(patientForm.values, acknowledgeDuplicate))
    if (!parsed.success) {
      patientForm.setErrors(
        Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])),
      )
      return
    }
    register.mutate(parsed.data, {
      onSuccess: (patient) => {
        setChosen(patient)
        setMode('search')
        patientForm.reset()
      },
    })
  }

  const patientPanel = (
    <div className="desk-panel desk-patient">
      <h3 className="mb-2 flex items-center gap-2.5 text-sm font-semibold">
        <StepBadge n={1} />
        {t('reception.steps.patient')}
      </h3>
      {mode === 'search' ? (
        <div className="space-y-2">
          {chosen ? (
            <ChosenPatient patient={chosen} onClear={() => setChosen(null)} />
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label={t('patients.search.placeholder')}
                  ref={patientSearchInputRef}
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder={t('patients.search.placeholder')}
                  className="h-8 ps-9 text-sm"
                  autoFocus
                />
              </div>
              {term.trim().length >= PATIENT_SEARCH_MIN && (
                <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-xl border text-sm">
                  {(search.data?.patients ?? []).map((patient) => (
                    <li key={patient.id}>
                      <button
                        type="button"
                        onClick={() => setChosen(patient)}
                        className="flex w-full cursor-pointer items-baseline justify-between gap-2 p-3 text-start hover:bg-muted"
                      >
                        <span className="text-sm font-medium">
                          {[patient.prefix, patient.firstName, patient.lastName].filter(Boolean).join(' ')}
                        </span>
                        <span dir="ltr" className="text-xs font-mono text-muted-foreground">
                          {patient.mrn}
                        </span>
                      </button>
                    </li>
                  ))}
                  {search.data?.patients.length === 0 && (
                    <li className="p-2 text-xs text-muted-foreground">{t('patients.search.empty')}</li>
                  )}
                </ul>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  register.reset()
                  setChosen(null)
                  setMode('new')
                }}
              >
                <UserPlus className="size-3" aria-hidden />
                {t('reception.newPatient')}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              register.reset()
              setMode('search')
            }}
          >
            {t('reception.searchInstead')}
          </Button>
          <PatientFormFields
            values={patientForm.values}
            set={(field, value) => {
              if (register.isError) register.reset()
              patientForm.set(field, value)
            }}
            errors={patientForm.errors}
            compact
            autoFocus
          />

        </div>
      )}
      {booking && mode === 'new' && (
        <div className="mt-2 space-y-2">
          {registrationMatches && <DuplicateNotice matches={registrationMatches} tone="blocking" />}
          {register.isError && !registrationMatches && <p role="alert">{t('reception.registrationError')}</p>}
          <Button
            type="button"
            disabled={register.isPending}
            onClick={() => registerForBooking(!!registrationMatches)}
          >
            {registrationMatches ? t('patients.duplicates.registerAnyway') : t('reception.newPatient')}
          </Button>
        </div>
      )}
    </div>
  )

  return (
    <div className="reception-desk">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{t('reception.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {roles.includes('receptionist') && (
            <div className="flex rounded-lg border bg-card p-0.5">
              <Button
                type="button"
                size="sm"
                aria-pressed={!booking}
                variant={!booking ? 'default' : 'ghost'}
                disabled={register.isPending || checkIn.isPending}
                onClick={() => setBooking(false)}
              >
                {t('reception.checkInMode')}
              </Button>
              <Button
                type="button"
                size="sm"
                aria-pressed={booking}
                variant={booking ? 'default' : 'ghost'}
                disabled={register.isPending || checkIn.isPending}
                onClick={() => setBooking(true)}
              >
                {t('appointments.book.submit')}
              </Button>
            </div>
          )}
          <Link className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} to="/reception/operations">
            {t('nav.receptionOps')}
          </Link>
        </div>
      </header>
      {booking ? (
        <div className="desk-booking">
          <fieldset disabled={register.isPending} className="min-h-0 min-w-0" onKeyDown={onFormKeyDown}>
            {patientPanel}
          </fieldset>
          <BookFollowUp key={chosen?.id ?? 'new'} patientId={chosen?.id} compact />
        </div>
      ) : (
        <form onSubmit={onSubmit} onKeyDown={onFormKeyDown} className="desk-grid" noValidate>
          {patientPanel}
          <div className="desk-clinical">
            {/* Step 2: Visit */}
            <div className="desk-panel">
              <h3 className="mb-2 flex items-center gap-2.5 text-sm font-semibold">
                <StepBadge n={2} />
                {t('reception.steps.visit')}
              </h3>
              <div className="space-y-2">
                <select
                  aria-label={t('reception.steps.visit')}
                  value={visitType}
                  onChange={(e) => setVisitType(e.target.value as VisitCreateType)}
                  className="desk-select"
                >
                  {VISIT_CREATE_TYPES.map((option) => (
                    <option key={option} value={option}>
                      {t(`visits.type.${option}`)}
                    </option>
                  ))}
                </select>
                <div className="grid gap-2">
                  {/* Searchable Department Select */}
                  <div
                    ref={departmentRef}
                    onBlur={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget)) setShowDepartmentDropdown(false)
                    }}
                    className="relative"
                  >
                    <Label htmlFor="departmentId" className="mb-1 block text-sm">
                      {t('visits.fields.department')}
                      <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="departmentId"
                        ref={departmentInputRef}
                        value={
                          showDepartmentDropdown
                            ? departmentSearch
                            : selectedDepartment
                              ? departmentName(selectedDepartment)
                              : ''
                        }
                        onChange={(e) => onDepartmentSearchChange(e.target.value)}
                        onFocus={() => {
                          setShowDepartmentDropdown(true)
                          setDepartmentSearch('')
                        }}
                        placeholder={t('visits.create.chooseDepartment')}
                        className="h-8 ps-8 text-sm"
                      />
                      {departmentId && !showDepartmentDropdown && (
                        <button
                          type="button"
                          aria-label={t('reception.clearDepartment')}
                          onClick={() => {
                            setDepartmentId('')
                            setPractitionerId('')
                            setQuantities({})
                          }}
                          className="absolute end-2 top-1/2 -translate-y-1/2"
                        >
                          <X className="size-3 text-muted-foreground hover:text-foreground" />
                        </button>
                      )}
                    </div>
                    {showDepartmentDropdown && (
                      <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded border bg-popover shadow-lg">
                        {filteredDepartments.map((dept) => (
                          <li key={dept.id}>
                            <button
                              type="button"
                              onClick={() => chooseDepartment(dept)}
                              className={cn(
                                'flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm hover:bg-accent',
                                dept.id === departmentId && 'bg-accent',
                              )}
                            >
                              <span
                                dir="ltr"
                                className="rounded bg-muted px-1 font-mono text-xs text-muted-foreground"
                              >
                                {dept.code}
                              </span>
                              {departmentName(dept)}
                            </button>
                          </li>
                        ))}
                        {filteredDepartments.length === 0 && (
                          <li className="px-3 py-2 text-xs text-muted-foreground">No departments found</li>
                        )}
                      </ul>
                    )}
                  </div>

                  {/* Code-first doctor search — type "01" and it's chosen, no list to scan
                  (see onDoctorSearchChange's comment on why this differs from the drug
                  picker's deliberately list-driven UX). */}
                  <div
                    ref={doctorRef}
                    onBlur={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget)) setShowDoctorDropdown(false)
                    }}
                    className="relative"
                  >
                    <Label className="mb-1.5 block text-sm" htmlFor="practitionerId">
                      {t('visits.fields.practitioner')}
                    </Label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="practitionerId"
                        ref={doctorInputRef}
                        disabled={!departmentId}
                        value={
                          showDoctorDropdown
                            ? doctorSearch
                            : practitionerId
                              ? (practitioners.find((p) => p.id === practitionerId)?.name ?? '')
                              : ''
                        }
                        onChange={(e) => onDoctorSearchChange(e.target.value)}
                        onFocus={() => {
                          setShowDoctorDropdown(true)
                          setDoctorSearch('')
                        }}
                        placeholder={t('visits.create.noDoctor')}
                        className="h-8 ps-8 text-sm"
                      />
                      {practitionerId && !showDoctorDropdown && (
                        <button
                          type="button"
                          aria-label={t('reception.clearDoctor')}
                          onClick={() => setPractitionerId('')}
                          className="absolute end-2 top-1/2 -translate-y-1/2"
                        >
                          <X className="size-3 text-muted-foreground hover:text-foreground" />
                        </button>
                      )}
                    </div>
                    {showDoctorDropdown && (
                      <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded border bg-popover shadow-lg">
                        {filteredDoctors.map((doctor) => (
                          <li key={doctor.id}>
                            <button
                              type="button"
                              onClick={() => chooseDoctor(doctor)}
                              className={cn(
                                'flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm hover:bg-accent',
                                doctor.id === practitionerId && 'bg-accent',
                              )}
                            >
                              <span
                                dir="ltr"
                                className="rounded bg-muted px-1 font-mono text-xs text-muted-foreground"
                              >
                                {doctor.code}
                              </span>
                              {doctor.name}
                            </button>
                          </li>
                        ))}
                        {filteredDoctors.length === 0 && (
                          <li className="px-3 py-2 text-xs text-muted-foreground">
                            {t('visits.create.noDoctor')}
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3: Services */}
            <div className="desk-panel desk-services">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-2.5 text-sm font-semibold">
                  <StepBadge n={3} />
                  {t('reception.steps.bill')}
                </h3>
                {chosenServices.length > 0 && (
                  <span className="text-xs text-muted-foreground">{chosenServices.length} selected</span>
                )}
              </div>

              {!departmentId ? (
                <p className="text-xs text-muted-foreground">{t('reception.bill.chooseFirst')}</p>
              ) : (
                <>
                  <div className="relative mb-2">
                    <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={serviceSearchInputRef}
                      value={serviceSearch}
                      onChange={(e) => setServiceSearch(e.target.value)}
                      aria-label={t('reception.searchServices')}
                      placeholder={t('reception.searchServices')}
                      className="h-8 ps-9 text-sm"
                    />
                  </div>

                  <a href="#desk-payment" className="sr-only focus:not-sr-only">{t('reception.steps.payment')}</a>
                    <div className="desk-service-list space-y-2 pe-1">
                    {filteredDeptServices.length > 0 && (
                      <div className="mb-2">
                        <p className="mb-2 text-xs font-semibold text-muted-foreground">
                          {selectedDepartment && departmentName(selectedDepartment)}
                        </p>
                        <ServiceGrid
                          services={filteredDeptServices}
                          quantities={quantities}
                          setQuantity={setQuantity}
                        />
                      </div>
                    )}

                    {filteredOtherServices.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold text-muted-foreground">
                          {t('reception.bill.moreServices')}
                        </p>
                        <ServiceGrid
                          services={filteredOtherServices}
                          quantities={quantities}
                          setQuantity={setQuantity}
                        />
                      </div>
                    )}

                    {filteredDeptServices.length === 0 && filteredOtherServices.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        {serviceSearch ? 'No matching services' : 'No services available'}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <aside className="desk-summary desk-panel">
            <div className="desk-review">
              <div>
                <h3 className="mb-2 flex items-center gap-2.5 text-sm font-semibold">
                  <StepBadge n={4} />
                  {t('reception.summary')}
                </h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t('reception.steps.patient')}</dt>
                    <dd className="truncate font-medium">
                      {mode === 'search'
                        ? chosen
                          ? [chosen.firstName, chosen.lastName].filter(Boolean).join(' ')
                          : '—'
                        : patientForm.values.firstName.trim() || 'New patient'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t('visits.fields.department')}</dt>
                    <dd className="truncate font-medium">
                      {selectedDepartment ? departmentName(selectedDepartment) : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t('visits.fields.practitioner')}</dt>
                    <dd className="truncate font-medium">
                      {practitioners.find((x) => x.id === practitionerId)?.name ?? '—'}
                    </dd>
                  </div>
                </dl>

                <div className="my-2 border-t" />

                {chosenServices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No services selected yet.</p>
                ) : (
                  <ul className="max-h-24 overflow-auto space-y-1 text-sm">
                    {chosenServices.map((service) => (
                      <li key={service.id} className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate">
                          {service.name}
                          {(quantities[service.id] ?? 0) > 1 && (
                            <span className="text-muted-foreground"> × {quantities[service.id]}</span>
                          )}
                        </span>
                        <span dir="ltr" className="font-mono text-muted-foreground">
                          {moneyDecimal(service.fee).mul(String(quantities[service.id])).toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {departmentId && (
                  <div className="mt-2 space-y-2 border-t pt-2">
                    <div>
                      <div className="mb-2 grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs" htmlFor="discountPercent">
                            {t('reception.bill.discount')} %
                          </Label>
                          <Input
                            id="discountPercent"
                            dir="ltr"
                            inputMode="decimal"
                            value={discountPercentText}
                            onChange={(e) => onDiscountPercentChange(e.target.value)}
                            className="h-9 text-sm"
                            aria-invalid={overCeiling}
                          />
                        </div>
                        <div>
                          <Label className="text-xs" htmlFor="discount">
                            {t('reception.bill.discount')}
                          </Label>
                          <Input
                            id="discount"
                            dir="ltr"
                            inputMode="decimal"
                            value={discount}
                            onChange={(e) => onDiscountAmountChange(e.target.value)}
                            className="h-9 text-sm"
                            aria-invalid={overCeiling}
                          />
                          {overCeiling && (
                            <p className="mt-0.5 text-[10px] text-destructive">
                              Max {maxDiscountPercent}% ({ceilingAmount.toFixed(2)})
                            </p>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs" htmlFor="discountReason">
                            {t('reception.bill.reason')}
                          </Label>
                          <Input
                            id="discountReason"
                            value={discountReason}
                            disabled={discountAmount.lte('0')}
                            onChange={(e) => setDiscountReason(e.target.value)}
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>

                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-muted-foreground">{t('reception.bill.subtotal')}</span>
                        <span className="font-mono">{subtotalAmount.toFixed(2)}</span>
                      </div>
                      {discountAmount.gt('0') && (
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="text-muted-foreground">Discount</span>
                          <span className="font-mono text-destructive">−{discountAmount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="mt-1 flex items-baseline justify-between border-t pt-1">
                        <span className="font-semibold">{t('reception.bill.total')}</span>
                        <span className="text-lg font-bold font-mono">{totalAmount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment remains adjacent to confirmation. */}
              <div className="pt-2">
                <h3 className="mb-3 text-sm font-semibold">{t('reception.steps.payment')}</h3>
                <div className="space-y-4">
                  <div>
                    <select
                      id="desk-payment" aria-label={t('reception.steps.payment')}
                      className="desk-select"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {t(`reception.payment.method.${method}`)}
                        </option>
                      ))}
                    </select>

                    {paymentMethod !== 'cash' && (
                      <div>
                        <Label className="text-xs" htmlFor="paymentReference">
                          {t('reception.payment.reference')}
                        </Label>
                        <Input
                          id="paymentReference"
                          dir="ltr"
                          value={paymentReference}
                          onChange={(e) => setPaymentReference(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                    )}
                  </div>
                </div>
                {/* Conflicts + Errors */}
                {conflict?.kind === 'duplicate' && (
                  <div className="mt-2 rounded border border-warning/40 bg-warning/10 p-2">
                    <DuplicateNotice matches={conflict.matches} tone="blocking" />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-1"
                      onClick={() => submit({ acknowledgeDuplicate: true })}
                      disabled={checkIn.isPending}
                    >
                      {t('patients.duplicates.registerAnyway')}
                    </Button>
                  </div>
                )}

                {conflict?.kind === 'openVisit' && (
                  <div className="mt-2 rounded border border-warning/40 bg-warning/10 p-2">
                    <p className="text-xs font-medium">{t('visits.open.title')}</p>
                    <ul className="mt-1 text-xs text-muted-foreground">
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
                      size="sm"
                      className="mt-1"
                      onClick={() => submit({ acknowledgeOpenVisit: true })}
                      disabled={checkIn.isPending}
                    >
                      {t('visits.open.startAnyway')}
                    </Button>
                  </div>
                )}

                {formError && (
                  <p role="alert" className="mt-2 text-xs text-destructive">
                    {formError}
                  </p>
                )}
                {checkIn.isError && !conflict && (
                  <p className="mt-2 text-xs text-destructive">{t('reception.error')}</p>
                )}
              </div>
            </div>
            <div className="desk-confirm">
              <Button
                type="submit"
                size="lg"
                className="h-10 w-full text-sm"
                disabled={checkIn.isPending || !patientReady || !departmentId || chosenServices.length === 0}
              >
                {checkIn.isPending
                  ? t('reception.saving')
                  : t('reception.submit', { amount: totalAmount.toFixed(2) })}
              </Button>
            </div>
          </aside>
        </form>
      )}
    </div>
  )
}

// Compact service grid with quantity controls
function ServiceGrid({
  services,
  quantities,
  setQuantity,
}: {
  services: readonly { id: string; name: string; fee: string }[]
  quantities: Record<string, number>
  setQuantity: (serviceId: string, quantity: number) => void
}) {
  return (
    <div className="grid gap-1">
      {services.map((service) => {
        const quantity = quantities[service.id] ?? 0
        const selected = quantity > 0
        return (
          <div
            key={service.id}
            className={cn(
              'flex items-center gap-2.5 rounded-xl border p-2.5 transition-colors',
              'hover:border-primary/50',
              selected ? 'border-primary bg-primary/5' : 'border-border',
            )}
          >
            <button
              type="button"
              aria-label={service.name}
              aria-pressed={selected}
              onClick={() => setQuantity(service.id, selected ? 0 : 1)}
              className={cn(
                'flex size-5 flex-shrink-0 cursor-pointer items-center justify-center rounded-md border text-[10px] font-bold transition-colors',
                selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30',
              )}
            >
              {selected && <Check className="size-2.5" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">{service.name}</p>
              <p dir="ltr" className="font-mono text-xs text-muted-foreground">
                {service.fee}
              </p>
            </div>
            {selected && (
              <div className="flex flex-shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setQuantity(service.id, Math.max(1, quantity - 1))
                  }}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-md border text-sm hover:bg-muted"
                >
                  −
                </button>
                <span className="w-5 text-center text-xs font-mono font-bold">{quantity}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setQuantity(service.id, Math.min(99, quantity + 1))
                  }}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-md border text-sm hover:bg-muted"
                >
                  +
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StepBadge({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
    >
      {n}
    </span>
  )
}

// Chosen patient card
function ChosenPatient({ patient, onClear }: { patient: PatientSummary; onClear: () => void }) {
  const { t } = useTranslation()
  const age = currentAgeYears(patient)

  return (
    <div className="flex items-start justify-between gap-2 rounded-xl border bg-primary/5 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">
          {[patient.prefix, patient.firstName, patient.lastName].filter(Boolean).join(' ')}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span dir="ltr" className="font-mono">
            {patient.mrn}
          </span>
          {' · '}
          {t(`patients.gender.${patient.gender}`)}
          {age != null && ` · ${age}y`}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onClear}
        aria-label={t('reception.clearPatient')}
      >
        <X className="size-3" />
      </Button>
    </div>
  )
}
