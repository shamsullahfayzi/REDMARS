import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { GUARDIAN_RELATIONS } from '@redmars/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toWesternDigits, type PatientFormValues } from '@/hooks/usePatientForm'

/**
 * The patient field set, shared by registration (3.1) and edit (3.4).
 *
 * The layout is the speed decision: the fields the desk actually asks — name, gender,
 * age, phone, address — up front, and the rest behind a disclosure. Optional fields you
 * must tab past cost time on every single registration; optional fields behind a toggle
 * cost nothing.
 *
 * Age is three boxes — years, months, days — after Farhat ran a real day and asked for it:
 * a child is "1 year 2 months", and forcing that through a single number and a unit toggle
 * loses half of it. Any box left blank stays blank; only what is typed is sent.
 */

const GENDERS = ['male', 'female', 'other', 'unknown'] as const

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
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

/** One small age box: a tiny caption above a narrow numeric input. Digits only. */
function AgeBox({
  id,
  label,
  value,
  invalid,
  onChange,
}: {
  id: string
  label: string
  value: string
  invalid?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs text-muted-foreground">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        inputMode="numeric"
        dir="ltr"
        className="w-16 text-center"
        autoComplete="off"
        aria-invalid={invalid}
        onChange={(e) => onChange(toWesternDigits(e.target.value).replace(/[^\d]/g, ''))}
      />
    </div>
  )
}

interface PatientFormFieldsProps {
  values: PatientFormValues
  set: <K extends keyof PatientFormValues>(key: K, value: PatientFormValues[K]) => void
  errors: Record<string, string>
  /** Rendered under the phone field — the duplicate notice belongs where it is caused. */
  belowPhone?: ReactNode
  autoFocus?: boolean
  /** Open the drawer from the start, e.g. when editing a record that uses those fields. */
  defaultShowMore?: boolean
}

export function PatientFormFields({
  values,
  set,
  errors,
  belowPhone,
  autoFocus = false,
  defaultShowMore = false,
}: PatientFormFieldsProps) {
  const { t } = useTranslation()
  const [showMore, setShowMore] = useState(defaultShowMore)
  const ageError =
    errors.estimatedAgeYears ?? errors.estimatedAgeMonths ?? errors.estimatedAgeDays

  // A fault inside the drawer cannot be corrected while the drawer is shut.
  if (errors.dateOfBirth && !showMore) setShowMore(true)

  return (
    <>
      <Field id="firstName" label={t('patients.fields.firstName')} error={errors.firstName} required>
        <Input
          id="firstName"
          value={values.firstName}
          autoFocus={autoFocus}
          autoComplete="off"
          aria-invalid={Boolean(errors.firstName)}
          onChange={(e) => set('firstName', e.target.value)}
        />
      </Field>

      <Field id="lastName" label={t('patients.fields.lastName')} error={errors.lastName}>
        <Input
          id="lastName"
          value={values.lastName}
          autoComplete="off"
          onChange={(e) => set('lastName', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t('patients.create.lastNameHint')}</p>
      </Field>

      {/* Segmented, not a dropdown: four visible options cost one keypress. */}
      <Field id="gender" label={t('patients.fields.gender')} error={errors.gender} required>
        <div className="flex flex-wrap gap-1.5" role="group">
          {GENDERS.map((value) => (
            <Button
              key={value}
              type="button"
              variant={values.gender === value ? 'default' : 'outline'}
              aria-pressed={values.gender === value}
              onClick={() => set('gender', value)}
            >
              {t(`patients.gender.${value}`)}
            </Button>
          ))}
        </div>
      </Field>

      {/* Three boxes in a fixed year-month-day order (dir="ltr" holds it under RTL). One
          label and one error for the group — an age is one fact told in three parts. */}
      <Field id="ageYears" label={t('patients.fields.age')} error={ageError} required>
        <div className="flex items-end gap-2" dir="ltr">
          <AgeBox
            id="ageYears"
            label={t('patients.ageUnit.years')}
            value={values.ageYears}
            invalid={Boolean(ageError)}
            onChange={(value) => set('ageYears', value)}
          />
          <AgeBox
            id="ageMonths"
            label={t('patients.ageUnit.months')}
            value={values.ageMonths}
            invalid={Boolean(ageError)}
            onChange={(value) => set('ageMonths', value)}
          />
          <AgeBox
            id="ageDays"
            label={t('patients.ageUnit.days')}
            value={values.ageDays}
            invalid={Boolean(ageError)}
            onChange={(value) => set('ageDays', value)}
          />
        </div>
      </Field>

      <Field id="phone" label={t('patients.fields.phone')} error={errors.phone} required>
        {/* dir="ltr" even under RTL — a phone number renders scrambled otherwise. */}
        <Input
          id="phone"
          value={values.phone}
          inputMode="numeric"
          dir="ltr"
          autoComplete="off"
          placeholder="07XX XXX XXX"
          aria-invalid={Boolean(errors.phone)}
          onChange={(e) => set('phone', toWesternDigits(e.target.value))}
        />
        {belowPhone}
      </Field>

      {/* Up front, not in the drawer — Farhat's desk asks for it on every registration. */}
      <Field id="address" label={t('patients.fields.address')} error={errors.address}>
        <Input
          id="address"
          value={values.address}
          autoComplete="off"
          onChange={(e) => set('address', e.target.value)}
        />
      </Field>

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
                value={values.prefix}
                autoComplete="off"
                onChange={(e) => set('prefix', e.target.value)}
              />
            </Field>

            <Field id="dateOfBirth" label={t('patients.fields.dateOfBirth')} error={errors.dateOfBirth}>
              <Input
                id="dateOfBirth"
                type="date"
                value={values.dateOfBirth}
                dir="ltr"
                onChange={(e) => set('dateOfBirth', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('patients.create.dobHint')}</p>
            </Field>

            <Field id="guardianName" label={t('patients.fields.guardianName')}>
              <Input
                id="guardianName"
                value={values.guardianName}
                autoComplete="off"
                onChange={(e) => set('guardianName', e.target.value)}
              />
            </Field>

            <Field id="guardianRelation" label={t('patients.fields.guardianRelation')}>
              <select
                id="guardianRelation"
                value={values.guardianRelation}
                onChange={(e) => set('guardianRelation', e.target.value)}
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
                value={values.altPhone}
                inputMode="numeric"
                dir="ltr"
                autoComplete="off"
                onChange={(e) => set('altPhone', toWesternDigits(e.target.value))}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="district" label={t('patients.fields.district')}>
                <Input
                  id="district"
                  value={values.district}
                  autoComplete="off"
                  onChange={(e) => set('district', e.target.value)}
                />
              </Field>
              <Field id="province" label={t('patients.fields.province')}>
                <Input
                  id="province"
                  value={values.province}
                  autoComplete="off"
                  onChange={(e) => set('province', e.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="nationalId" label={t('patients.fields.nationalId')}>
                <Input
                  id="nationalId"
                  value={values.nationalId}
                  dir="ltr"
                  autoComplete="off"
                  onChange={(e) => set('nationalId', e.target.value)}
                />
              </Field>
              <Field id="passportNo" label={t('patients.fields.passportNo')}>
                <Input
                  id="passportNo"
                  value={values.passportNo}
                  dir="ltr"
                  autoComplete="off"
                  onChange={(e) => set('passportNo', e.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="occupation" label={t('patients.fields.occupation')}>
                <Input
                  id="occupation"
                  value={values.occupation}
                  autoComplete="off"
                  onChange={(e) => set('occupation', e.target.value)}
                />
              </Field>
              <Field id="nationality" label={t('patients.fields.nationality')}>
                <Input
                  id="nationality"
                  value={values.nationality}
                  autoComplete="off"
                  onChange={(e) => set('nationality', e.target.value)}
                />
              </Field>
            </div>

            <Field id="bloodGroup" label={t('patients.fields.bloodGroup')}>
              <Input
                id="bloodGroup"
                value={values.bloodGroup}
                dir="ltr"
                className="w-28"
                autoComplete="off"
                onChange={(e) => set('bloodGroup', e.target.value)}
              />
            </Field>
          </div>
        )}
      </div>
    </>
  )
}
