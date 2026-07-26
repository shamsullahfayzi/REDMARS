import { useEffect, useState, useRef, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Check, Printer, Search, UserPlus, X } from 'lucide-react'
import {
  DISCOUNT_MAX_PERCENT_DEFAULT,
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
import { useDiscountCeiling } from '@/hooks/useDiscountCeiling'
import { usePatientSearch } from '@/hooks/usePatientSearch'
import { toPayload, usePatientForm } from '@/hooks/usePatientForm'
import { conflictFromError, fromMinor, toMinor, useCheckIn } from '@/hooks/useReception'
import { useVisitOptions } from '@/hooks/useVisits'
import { cn } from '@/lib/utils'

export function ReceptionPage() {
  const { t, i18n } = useTranslation()
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
  const [visitType, setVisitType] = useState<VisitCreateType>('opd_consult')
  const [departmentId, setDepartmentId] = useState('')
  const [departmentSearch, setDepartmentSearch] = useState('')
  const [showDepartmentDropdown, setShowDepartmentDropdown] = useState(false)
  const [practitionerId, setPractitionerId] = useState('')
  const [chiefComplaint, setChiefComplaint] = useState('')

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
  const patientSearchInputRef = useRef<HTMLInputElement>(null)
  const departmentInputRef = useRef<HTMLInputElement>(null)
  const serviceSearchInputRef = useRef<HTMLInputElement>(null)

  const departments = optionsQuery.data?.departments ?? []
  const practitioners = optionsQuery.data?.practitioners ?? []
  const services = optionsQuery.data?.services ?? []

  const availableDoctors = practitioners.filter((p) => p.departmentIds.includes(departmentId))
  const departmentServices = services.filter((s) => s.departmentId === departmentId)
  const otherServices = services.filter((s) => s.departmentId !== departmentId)

  // Filter departments based on search
  const filteredDepartments = departments.filter((d) => {
    const name = departmentName(d).toLowerCase()
    return name.includes(departmentSearch.toLowerCase())
  })

  // Filter services based on search
  const filteredDeptServices = departmentServices.filter((s) =>
    s.name.toLowerCase().includes(serviceSearch.toLowerCase())
  )
  const filteredOtherServices = otherServices.filter((s) =>
    s.name.toLowerCase().includes(serviceSearch.toLowerCase())
  )

  useEffect(() => {
    const list = optionsQuery.data?.departments
    if (!departmentId && list?.length === 1) setDepartmentId(list[0].id)
  }, [optionsQuery.data, departmentId])

  // Close department dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (departmentRef.current && !departmentRef.current.contains(e.target as Node)) {
        setShowDepartmentDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const chosenServices = services.filter((s) => (quantities[s.id] ?? 0) > 0)
  const subtotalMinor = chosenServices.reduce(
    (sum, service) => sum + toMinor(service.fee) * quantities[service.id],
    0,
  )
  const discountMinor = discount.trim() === '' ? 0 : toMinor(discount.trim())
  const ceilingMinor = Math.floor((subtotalMinor * maxDiscountPercent) / 100)
  const overCeiling = discountMinor > ceilingMinor
  const totalMinor = Math.max(0, subtotalMinor - discountMinor)

  const conflict = conflictFromError(checkIn.error)

  function setQuantity(serviceId: string, quantity: number) {
    setQuantities((prev) => ({ ...prev, [serviceId]: Math.max(0, quantity) }))
  }

  function chooseDepartment(dept: VisitDepartmentOption) {
    setDepartmentId(dept.id)
    setDepartmentSearch('')
    setShowDepartmentDropdown(false)
    setPractitionerId('')
    setQuantities({})
  }

  // Everything on this screen lives in one <form>, so an Enter pressed anywhere would
  // otherwise submit the whole check-in from whatever partial state it caught — a
  // receptionist typing a service name and pressing Enter out of habit could check a
  // patient in against the wrong bill. This is the one place that rule is enforced: Enter
  // only ever does the thing each field's own handler below says it does, never a submit
  // it wasn't asked for.
  function onFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    const target = event.target
    if (!(target instanceof HTMLElement)) return

    if (event.key === 'Escape' && showDepartmentDropdown) {
      setShowDepartmentDropdown(false)
      return
    }

    if (event.key !== 'Enter') return
    if (target.tagName === 'TEXTAREA' || target instanceof HTMLButtonElement) return
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
    const minor = text.trim() === '' ? 0 : toMinor(text.trim())
    setDiscountPercentText(
      subtotalMinor > 0 ? String(Math.round((minor / subtotalMinor) * 10000) / 100) : '',
    )
  }

  function onDiscountPercentChange(text: string) {
    setDiscountPercentText(text)
    if (text.trim() === '') {
      setDiscount('')
      return
    }
    const pct = Number(text)
    if (!Number.isFinite(pct)) return
    setDiscount(fromMinor(Math.round((subtotalMinor * pct) / 100)))
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
    setChiefComplaint('')
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
          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            <Button type="button" size="sm" onClick={() => window.print()}>
              <Printer className="size-3" aria-hidden />
              {t('reception.done.print')}
            </Button>
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

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="border-b px-4 py-2">
        <PageHeader title={t('reception.title')} />
      </div>

      <form
        onSubmit={onSubmit}
        onKeyDown={onFormKeyDown}
        className="flex flex-1 gap-3 overflow-hidden p-3"
        noValidate
      >
        {/* Left column: Patient + Visit details */}
        <div className="flex w-[35%] flex-col gap-3 overflow-y-auto">
          {/* Step 1: Patient */}
          <div className="rounded-lg border bg-card p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                        ref={patientSearchInputRef}
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                        placeholder={t('patients.search.placeholder')}
                        className="h-8 ps-8 text-sm"
                        autoFocus
                      />
                    </div>
                    {term.trim().length >= PATIENT_SEARCH_MIN && (
                      <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded border text-sm">
                        {(search.data?.patients ?? []).map((patient) => (
                          <li key={patient.id}>
                            <button
                              type="button"
                              onClick={() => setChosen(patient)}
                              className="flex w-full items-baseline justify-between gap-2 p-2 text-start hover:bg-muted"
                            >
                              <span className="text-sm font-medium">
                                {[patient.prefix, patient.firstName, patient.lastName]
                                  .filter(Boolean)
                                  .join(' ')}
                              </span>
                              <span dir="ltr" className="text-xs font-mono text-muted-foreground">
                                {patient.mrn}
                              </span>
                            </button>
                          </li>
                        ))}
                        {search.data?.patients.length === 0 && (
                          <li className="p-2 text-xs text-muted-foreground">
                            {t('patients.search.empty')}
                          </li>
                        )}
                      </ul>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setMode('new')}
                    >
                      <UserPlus className="size-3" aria-hidden />
                      {t('reception.newPatient')}
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <PatientFormFields
                  values={patientForm.values}
                  set={patientForm.set}
                  errors={patientForm.errors}
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMode('search')}
                >
                  {t('reception.searchInstead')}
                </Button>
              </div>
            )}
          </div>

          {/* Step 2: Visit */}
          <div className="rounded-lg border bg-card p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('reception.steps.visit')}
            </h3>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {VISIT_CREATE_TYPES.map((option) => (
                  <Chip
                    key={option}
                    active={visitType === option}
                    onClick={() => setVisitType(option)}
                    label={t(`visits.type.${option}`)}
                  />
                ))}
              </div>

              {/* Searchable Department Select */}
              <div ref={departmentRef} className="relative">
                <Label className="text-xs">
                  {t('visits.fields.department')}
                  <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute start-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={departmentInputRef}
                    value={
                      showDepartmentDropdown
                        ? departmentSearch
                        : departmentId
                          ? departmentName(departments.find((d) => d.id === departmentId)!)
                          : ''
                    }
                    onChange={(e) => {
                      setDepartmentSearch(e.target.value)
                      setShowDepartmentDropdown(true)
                    }}
                    onFocus={() => {
                      setShowDepartmentDropdown(true)
                      setDepartmentSearch('')
                    }}
                    placeholder={t('visits.create.chooseDepartment')}
                    className="h-8 ps-7 text-sm"
                  />
                  {departmentId && !showDepartmentDropdown && (
                    <button
                      type="button"
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
                            'w-full px-3 py-1.5 text-start text-sm hover:bg-accent',
                            dept.id === departmentId && 'bg-accent'
                          )}
                        >
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

              <div>
                <Label className="text-xs" htmlFor="practitionerId">
                  {t('visits.fields.practitioner')}
                </Label>
                <Select
                  id="practitionerId"
                  value={practitionerId}
                  disabled={!departmentId}
                  onChange={(e) => setPractitionerId(e.target.value)}
                  className="h-8 text-sm"
                >
                  <option value="">{t('visits.create.noDoctor')}</option>
                  {availableDoctors.map((practitioner) => (
                    <option key={practitioner.id} value={practitioner.id}>
                      {practitioner.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label className="text-xs" htmlFor="chiefComplaint">
                  {t('visits.fields.chiefComplaint')}
                </Label>
                <Textarea
                  id="chiefComplaint"
                  rows={2}
                  value={chiefComplaint}
                  placeholder={t('visits.create.complaintPlaceholder')}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  className="resize-none text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Services + Payment */}
        <div className="flex w-[65%] flex-col gap-3">
          {/* Step 3: Services */}
          <div className="flex-1 rounded-lg border bg-card p-3 overflow-hidden flex flex-col">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('reception.steps.bill')}
              </h3>
              {chosenServices.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {chosenServices.length} selected
                </span>
              )}
            </div>

            {!departmentId ? (
              <p className="text-xs text-muted-foreground">{t('reception.bill.chooseFirst')}</p>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute start-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={serviceSearchInputRef}
                    value={serviceSearch}
                    onChange={(e) => setServiceSearch(e.target.value)}
                    placeholder="Search services..."
                    className="h-7 ps-7 text-xs"
                  />
                </div>

                <div className="flex-1 overflow-y-auto -mx-3 px-3">
                  {filteredDeptServices.length > 0 && (
                    <div className="mb-2">
                      <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">
                        Department Services
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
                      <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">
                        Other Services
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

                {/* Discount + Total */}
                <div className="mt-2 border-t pt-2">
                  <div className="mb-2 grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px]" htmlFor="discountPercent">
                        Discount %
                      </Label>
                      <Input
                        id="discountPercent"
                        dir="ltr"
                        inputMode="decimal"
                        value={discountPercentText}
                        onChange={(e) => onDiscountPercentChange(e.target.value)}
                        className="h-7 text-xs"
                        aria-invalid={overCeiling}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]" htmlFor="discount">
                        Discount
                      </Label>
                      <Input
                        id="discount"
                        dir="ltr"
                        inputMode="decimal"
                        value={discount}
                        onChange={(e) => onDiscountAmountChange(e.target.value)}
                        className="h-7 text-xs"
                        aria-invalid={overCeiling}
                      />
                      {overCeiling && (
                        <p className="mt-0.5 text-[10px] text-destructive">
                          Max {maxDiscountPercent}% ({fromMinor(ceilingMinor)})
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-[10px]" htmlFor="discountReason">
                        Reason
                      </Label>
                      <Input
                        id="discountReason"
                        value={discountReason}
                        disabled={discountMinor <= 0}
                        onChange={(e) => setDiscountReason(e.target.value)}
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-mono">{fromMinor(subtotalMinor)}</span>
                  </div>
                  {discountMinor > 0 && (
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-muted-foreground">Discount</span>
                      <span className="font-mono text-destructive">−{fromMinor(discountMinor)}</span>
                    </div>
                  )}
                  <div className="mt-1 flex items-baseline justify-between border-t pt-1">
                    <span className="font-semibold">Total</span>
                    <span className="text-lg font-bold font-mono">{fromMinor(totalMinor)}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Step 4: Payment + Submit */}
          <div className="rounded-lg border bg-card p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('reception.steps.payment')}
            </h3>
            <div className="flex items-end justify-between gap-4">
              <div className="flex-1">
                <div className="mb-2 flex flex-wrap gap-1">
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
                  <div>
                    <Label className="text-[10px]" htmlFor="paymentReference">
                      Reference
                    </Label>
                    <Input
                      id="paymentReference"
                      dir="ltr"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                )}
              </div>

              <Button
                type="submit"
                size="lg"
                className="h-12 px-8 text-base"
                disabled={
                  checkIn.isPending || !patientReady || !departmentId || chosenServices.length === 0
                }
              >
                {checkIn.isPending ? t('reception.saving') : t('reception.submit', { amount: fromMinor(totalMinor) })}
              </Button>
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
                      <span dir="ltr" className="font-mono">{visit.visitNo}</span>
                      {' · '}{visit.departmentName}
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

            {formError && <p className="mt-2 text-xs text-destructive">{formError}</p>}
            {checkIn.isError && !conflict && (
              <p className="mt-2 text-xs text-destructive">{t('reception.error')}</p>
            )}
          </div>
        </div>
      </form>
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
    <div className="grid grid-cols-3 gap-1">
      {services.map((service) => {
        const quantity = quantities[service.id] ?? 0
        const selected = quantity > 0
        return (
          <div
            key={service.id}
            className={cn(
              'flex items-center gap-1 rounded border p-1.5 transition-colors',
              'hover:border-primary/50',
              selected ? 'border-primary bg-primary/5' : 'border-border'
            )}
          >
            <button
              type="button"
              onClick={() => setQuantity(service.id, selected ? 0 : 1)}
              className={cn(
                'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[10px] font-bold transition-colors',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted-foreground/30'
              )}
            >
              {selected && <Check className="size-2.5" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium leading-tight">{service.name}</p>
              <p className="text-[10px] font-mono text-muted-foreground">{service.fee}</p>
            </div>
            {selected && (
              <div className="flex flex-shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setQuantity(service.id, Math.max(1, quantity - 1))
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded border text-xs hover:bg-muted"
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
                  className="flex h-5 w-5 items-center justify-center rounded border text-xs hover:bg-muted"
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

// Reusable chip component
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
        'rounded-md border px-2 py-1 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-background hover:bg-muted'
      )}
    >
      {label}
    </button>
  )
}

// Chosen patient card
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
    <div className="flex items-start justify-between gap-2 rounded border bg-muted/50 p-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">
          {[patient.prefix, patient.firstName, patient.lastName].filter(Boolean).join(' ')}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span dir="ltr" className="font-mono">{patient.mrn}</span>
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