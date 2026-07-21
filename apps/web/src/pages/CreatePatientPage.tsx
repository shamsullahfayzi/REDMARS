import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Copy, Check, UserPlus } from 'lucide-react'
import {
  AGE_UNITS,
  GUARDIAN_RELATIONS,
  createPatientRequestSchema,
  type AgeUnit,
  type CreatePatientRequest,
} from '@redmars/shared'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreatePatient } from '@/hooks/usePatient'
import { cn } from '@/lib/utils'

/**
 * Task 3.1 — patient registration.
 *
 * The design constraint is a number, not a feeling: the receptionist is the bottleneck
 * at Farhat, and she registers a walk-in while he is standing at the window. So the
 * screen shows the FOUR fields she actually asks (name, gender, age, phone) and hides
 * the other twelve behind a disclosure. Optional fields you must tab past cost time on
 * every single registration; optional fields behind a toggle cost nothing.
 *
 * Age is one number plus a unit, never three boxes — she is told "thirty" or "six
 * months". The server maps that onto estimatedAgeYears/Months and stamps the anchor.
 *
 * The MRN is never typed. It comes back from the server (task 2.10) and is the receipt.
 */

const GENDERS = ['male', 'female', 'other', 'unknown'] as const

/** Arabic-Indic and Persian digits normalised to Western, so 30 is 30 in every locale. */
function toWesternDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
}

/** Blank optional text becomes null rather than "" — one empty value, not two. */
function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

interface FieldProps {
  id: string
  label: string
  error?: string
  required?: boolean
  children: ReactNode
}

function Field({ id, label, error, required, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ms-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {/* Beside the field, not in a summary at the top — she fixes what she is looking at. */}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export function CreatePatientPage() {
  const { t } = useTranslation()
  const createPatient = useCreatePatient()
  const firstNameRef = useRef<HTMLInputElement>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [gender, setGender] = useState<(typeof GENDERS)[number]>('male')
  const [ageValue, setAgeValue] = useState('')
  const [ageUnit, setAgeUnit] = useState<AgeUnit>('years')
  const [phone, setPhone] = useState('')

  const [prefix, setPrefix] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [guardianRelation, setGuardianRelation] = useState('')
  const [altPhone, setAltPhone] = useState('')
  const [address, setAddress] = useState('')
  const [district, setDistrict] = useState('')
  const [province, setProvince] = useState('')
  const [nationalId, setNationalId] = useState('')
  const [passportNo, setPassportNo] = useState('')
  const [occupation, setOccupation] = useState('')
  const [nationality, setNationality] = useState('')
  const [bloodGroup, setBloodGroup] = useState('')

  const [showMore, setShowMore] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)

  function clearError(field: string) {
    setErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function resetForm() {
    setFirstName('')
    setLastName('')
    setGender('male')
    setAgeValue('')
    setAgeUnit('years')
    setPhone('')
    setPrefix('')
    setDateOfBirth('')
    setGuardianName('')
    setGuardianRelation('')
    setAltPhone('')
    setAddress('')
    setDistrict('')
    setProvince('')
    setNationalId('')
    setPassportNo('')
    setOccupation('')
    setNationality('')
    setBloodGroup('')
    setErrors({})
    setShowMore(false)
  }

  function registerAnother() {
    createPatient.reset()
    resetForm()
    firstNameRef.current?.focus()
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setErrors({})

    const age = ageValue.trim() === '' ? null : Number(ageValue)
    const candidate = {
      firstName: firstName.trim(),
      lastName: orNull(lastName),
      prefix: orNull(prefix),
      gender,
      phone: phone.trim(),
      altPhone: orNull(altPhone),
      dateOfBirth: orNull(dateOfBirth),
      estimatedAgeYears: ageUnit === 'years' ? age : null,
      estimatedAgeMonths: ageUnit === 'months' ? age : null,
      estimatedAgeDays: null,
      guardianName: orNull(guardianName),
      guardianRelation: orNull(guardianRelation),
      address: orNull(address),
      district: orNull(district),
      province: orNull(province),
      nationalId: orNull(nationalId),
      passportNo: orNull(passportNo),
      occupation: orNull(occupation),
      nationality: orNull(nationality),
      bloodGroup: orNull(bloodGroup),
    }

    const parsed = createPatientRequestSchema.safeParse(candidate)
    if (!parsed.success) {
      // Map each issue onto its field so it renders next to the input that caused it.
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      // A hidden field cannot be corrected — open the drawer if that is where the fault is.
      if (fieldErrors.dateOfBirth) setShowMore(true)
      return // never fall through to mutate with undefined data
    }

    createPatient.mutate(parsed.data as CreatePatientRequest)
  }

  async function copyMrn(mrn: string) {
    await navigator.clipboard.writeText(mrn)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const patient = createPatient.data

  // --- Success: the MRN is the receipt, and the desk keeps moving -----------------
  if (patient) {
    const fullName = [patient.prefix, patient.firstName, patient.lastName]
      .filter(Boolean)
      .join(' ')

    return (
      <div className="space-y-6">
        <PageHeader title={t('patients.create.title')} />
        <Card className="max-w-lg space-y-5 p-6">
          <div className="flex items-center gap-2 text-success">
            <Check className="size-5" aria-hidden />
            <p className="font-medium">{t('patients.create.registered')}</p>
          </div>

          <p className="text-lg font-semibold text-foreground">{fullName}</p>

          <div className="rounded-lg bg-muted p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('patients.create.mrn')}
            </p>
            <div className="mt-1 flex items-center gap-2">
              {/* Always LTR: an identifier reads left-to-right even on an RTL page. */}
              <span dir="ltr" className="font-mono text-2xl font-bold text-foreground">
                {patient.mrn}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void copyMrn(patient.mrn)}
                aria-label={t('patients.create.copyMrn')}
              >
                {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Primary, because there is a queue at the window. */}
            <Button type="button" onClick={registerAnother}>
              <UserPlus className="size-4" aria-hidden />
              {t('patients.create.registerAnother')}
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  // --- The form ------------------------------------------------------------------
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('patients.create.title')}
        description={t('patients.create.subtitle')}
      />

      <Card className="max-w-lg p-6">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <Field
            id="firstName"
            label={t('patients.fields.firstName')}
            error={errors.firstName}
            required
          >
            <Input
              id="firstName"
              ref={firstNameRef}
              value={firstName}
              autoFocus
              autoComplete="off"
              aria-invalid={Boolean(errors.firstName)}
              onChange={(e) => {
                setFirstName(e.target.value)
                clearError('firstName')
              }}
            />
          </Field>

          <Field id="lastName" label={t('patients.fields.lastName')} error={errors.lastName}>
            <Input
              id="lastName"
              value={lastName}
              autoComplete="off"
              onChange={(e) => {
                setLastName(e.target.value)
                clearError('lastName')
              }}
            />
            <p className="text-xs text-muted-foreground">{t('patients.create.lastNameHint')}</p>
          </Field>

          {/* Segmented, not a dropdown: four visible options cost one keypress. */}
          <Field id="gender" label={t('patients.fields.gender')} error={errors.gender} required>
            <div className="flex flex-wrap gap-1.5" role="group" id="gender">
              {GENDERS.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={gender === value ? 'default' : 'outline'}
                  aria-pressed={gender === value}
                  onClick={() => {
                    setGender(value)
                    clearError('gender')
                  }}
                >
                  {t(`patients.gender.${value}`)}
                </Button>
              ))}
            </div>
          </Field>

          {/* One number and a unit — she is told "thirty" or "six months", never three boxes. */}
          <Field
            id="age"
            label={t('patients.fields.age')}
            error={errors.estimatedAgeYears ?? errors.estimatedAgeMonths}
            required
          >
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="age"
                value={ageValue}
                inputMode="numeric"
                dir="ltr"
                className="w-24"
                autoComplete="off"
                aria-invalid={Boolean(errors.estimatedAgeYears ?? errors.estimatedAgeMonths)}
                onChange={(e) => {
                  setAgeValue(toWesternDigits(e.target.value).replace(/[^\d]/g, ''))
                  clearError('estimatedAgeYears')
                  clearError('estimatedAgeMonths')
                }}
              />
              <div className="flex gap-1.5" role="group">
                {AGE_UNITS.map((unit) => (
                  <Button
                    key={unit}
                    type="button"
                    variant={ageUnit === unit ? 'default' : 'outline'}
                    aria-pressed={ageUnit === unit}
                    onClick={() => setAgeUnit(unit)}
                  >
                    {t(`patients.ageUnit.${unit}`)}
                  </Button>
                ))}
              </div>
            </div>
          </Field>

          <Field id="phone" label={t('patients.fields.phone')} error={errors.phone} required>
            {/* dir="ltr" even under RTL — a phone number renders scrambled otherwise. */}
            <Input
              id="phone"
              value={phone}
              inputMode="numeric"
              dir="ltr"
              autoComplete="off"
              placeholder="07XX XXX XXX"
              aria-invalid={Boolean(errors.phone)}
              onChange={(e) => {
                setPhone(toWesternDigits(e.target.value))
                clearError('phone')
              }}
            />
            {/* Duplicate detection (task 3.3) lands here, under the phone. */}
          </Field>

          {/* Everything the patient may or may not volunteer, out of the way by default. */}
          <div className="border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setShowMore((open) => !open)}
              aria-expanded={showMore}
              className="flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {showMore ? (
                <ChevronDown className="size-4" aria-hidden />
              ) : (
                <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
              )}
              {t('patients.create.moreDetails')}
            </button>

            {showMore && (
              <div className="mt-4 space-y-5">
                <Field id="prefix" label={t('patients.fields.prefix')}>
                  <Input
                    id="prefix"
                    value={prefix}
                    autoComplete="off"
                    onChange={(e) => setPrefix(e.target.value)}
                  />
                </Field>

                <Field
                  id="dateOfBirth"
                  label={t('patients.fields.dateOfBirth')}
                  error={errors.dateOfBirth}
                >
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={dateOfBirth}
                    dir="ltr"
                    onChange={(e) => {
                      setDateOfBirth(e.target.value)
                      clearError('dateOfBirth')
                    }}
                  />
                  <p className="text-xs text-muted-foreground">{t('patients.create.dobHint')}</p>
                </Field>

                <Field id="guardianName" label={t('patients.fields.guardianName')}>
                  <Input
                    id="guardianName"
                    value={guardianName}
                    autoComplete="off"
                    onChange={(e) => setGuardianName(e.target.value)}
                  />
                </Field>

                <Field id="guardianRelation" label={t('patients.fields.guardianRelation')}>
                  <select
                    id="guardianRelation"
                    value={guardianRelation}
                    onChange={(e) => setGuardianRelation(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="">{t('patients.create.notSpecified')}</option>
                    {GUARDIAN_RELATIONS.map((relation) => (
                      <option key={relation} value={relation}>
                        {t(`patients.guardianRelation.${relation}`)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field id="altPhone" label={t('patients.fields.altPhone')}>
                  <Input
                    id="altPhone"
                    value={altPhone}
                    inputMode="numeric"
                    dir="ltr"
                    autoComplete="off"
                    onChange={(e) => setAltPhone(toWesternDigits(e.target.value))}
                  />
                </Field>

                <Field id="address" label={t('patients.fields.address')}>
                  <Input
                    id="address"
                    value={address}
                    autoComplete="off"
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </Field>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="district" label={t('patients.fields.district')}>
                    <Input
                      id="district"
                      value={district}
                      autoComplete="off"
                      onChange={(e) => setDistrict(e.target.value)}
                    />
                  </Field>
                  <Field id="province" label={t('patients.fields.province')}>
                    <Input
                      id="province"
                      value={province}
                      autoComplete="off"
                      onChange={(e) => setProvince(e.target.value)}
                    />
                  </Field>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="nationalId" label={t('patients.fields.nationalId')}>
                    <Input
                      id="nationalId"
                      value={nationalId}
                      dir="ltr"
                      autoComplete="off"
                      onChange={(e) => setNationalId(e.target.value)}
                    />
                  </Field>
                  <Field id="passportNo" label={t('patients.fields.passportNo')}>
                    <Input
                      id="passportNo"
                      value={passportNo}
                      dir="ltr"
                      autoComplete="off"
                      onChange={(e) => setPassportNo(e.target.value)}
                    />
                  </Field>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="occupation" label={t('patients.fields.occupation')}>
                    <Input
                      id="occupation"
                      value={occupation}
                      autoComplete="off"
                      onChange={(e) => setOccupation(e.target.value)}
                    />
                  </Field>
                  <Field id="nationality" label={t('patients.fields.nationality')}>
                    <Input
                      id="nationality"
                      value={nationality}
                      autoComplete="off"
                      onChange={(e) => setNationality(e.target.value)}
                    />
                  </Field>
                </div>

                <Field id="bloodGroup" label={t('patients.fields.bloodGroup')}>
                  <Input
                    id="bloodGroup"
                    value={bloodGroup}
                    dir="ltr"
                    className="w-28"
                    autoComplete="off"
                    onChange={(e) => setBloodGroup(e.target.value)}
                  />
                </Field>
              </div>
            )}
          </div>

          {createPatient.isError && (
            <p className="text-sm text-destructive">{t('patients.create.error')}</p>
          )}

          <div className="flex items-center gap-3 border-t border-border pt-4">
            <Button type="submit" disabled={createPatient.isPending}>
              {createPatient.isPending
                ? t('patients.create.saving')
                : t('patients.create.submit')}
            </Button>
            <span className={cn('text-xs text-muted-foreground')}>
              {t('patients.create.enterHint')}
            </span>
          </div>
        </form>
      </Card>
    </div>
  )
}
