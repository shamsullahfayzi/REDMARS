import { useCallback, useState } from 'react'
import type { PatientDetail } from '@redmars/shared'

/**
 * The registration/edit form's state, in one place.
 *
 * Extracted at the SECOND use rather than the third, against the usual rule, and
 * deliberately: this is a twenty-field clinical form, and two copies means every future
 * field — or every change to how age is mapped — has to be made twice and will eventually
 * be made once. The rule guards against speculative abstraction of small things; this is
 * neither speculative nor small.
 */
export interface PatientFormValues {
  firstName: string
  lastName: string
  prefix: string
  gender: 'male' | 'female' | 'other' | 'unknown'
  // Age as three separate boxes — years, months, days — filled in as far as it is known.
  // Farhat asked for this after running a real day: an infant is "1 year 2 months", not a
  // single number behind a unit toggle. The wire has always carried all three columns.
  ageYears: string
  ageMonths: string
  ageDays: string
  phone: string
  dateOfBirth: string
  guardianName: string
  guardianRelation: string
  altPhone: string
  address: string
  district: string
  province: string
  nationalId: string
  passportNo: string
  occupation: string
  nationality: string
  bloodGroup: string
}

const EMPTY: PatientFormValues = {
  firstName: '',
  lastName: '',
  prefix: '',
  gender: 'male',
  ageYears: '',
  ageMonths: '',
  ageDays: '',
  phone: '',
  dateOfBirth: '',
  guardianName: '',
  guardianRelation: '',
  altPhone: '',
  address: '',
  district: '',
  province: '',
  nationalId: '',
  passportNo: '',
  occupation: '',
  nationality: '',
  bloodGroup: '',
}

/** Blank optional text becomes null rather than "" — one empty value, not two. */
function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Arabic-Indic and Persian digits normalised to Western, so 30 is 30 in every locale. */
export function toWesternDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
}

/** A box holding whole digits, or null when blank. */
function orNumber(value: string): number | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : Number(trimmed)
}

/** Form values -> the wire contract. The three age boxes map straight to their columns. */
export function toPayload(values: PatientFormValues, acknowledgeDuplicate = false) {
  return {
    firstName: values.firstName.trim(),
    lastName: orNull(values.lastName),
    prefix: orNull(values.prefix),
    gender: values.gender,
    phone: values.phone.trim(),
    altPhone: orNull(values.altPhone),
    dateOfBirth: orNull(values.dateOfBirth),
    estimatedAgeYears: orNumber(values.ageYears),
    estimatedAgeMonths: orNumber(values.ageMonths),
    estimatedAgeDays: orNumber(values.ageDays),
    guardianName: orNull(values.guardianName),
    guardianRelation: orNull(values.guardianRelation),
    address: orNull(values.address),
    district: orNull(values.district),
    province: orNull(values.province),
    nationalId: orNull(values.nationalId),
    passportNo: orNull(values.passportNo),
    occupation: orNull(values.occupation),
    nationality: orNull(values.nationality),
    bloodGroup: orNull(values.bloodGroup),
    acknowledgeDuplicate,
  }
}

/** A saved patient -> form values, for repopulating the edit form. */
export function fromDetail(patient: PatientDetail): PatientFormValues {
  // Each box shows exactly what the record holds — a blank column stays a blank box.
  const box = (value: number | null) => (value == null ? '' : String(value))
  return {
    firstName: patient.firstName,
    lastName: patient.lastName ?? '',
    prefix: patient.prefix ?? '',
    gender: patient.gender,
    ageYears: box(patient.estimatedAgeYears),
    ageMonths: box(patient.estimatedAgeMonths),
    ageDays: box(patient.estimatedAgeDays),
    phone: patient.phone ?? '',
    dateOfBirth: patient.dateOfBirth ?? '',
    guardianName: patient.guardianName ?? '',
    guardianRelation: patient.guardianRelation ?? '',
    altPhone: patient.altPhone ?? '',
    address: patient.address ?? '',
    district: patient.district ?? '',
    province: patient.province ?? '',
    nationalId: patient.nationalId ?? '',
    passportNo: patient.passportNo ?? '',
    occupation: patient.occupation ?? '',
    nationality: patient.nationality ?? '',
    bloodGroup: patient.bloodGroup ?? '',
  }
}

export function usePatientForm(initial: PatientFormValues = EMPTY) {
  const [values, setValues] = useState<PatientFormValues>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = useCallback(<K extends keyof PatientFormValues>(key: K, value: PatientFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    // Clearing on change, not on blur: she is fixing exactly this field right now.
    setErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key as string]
      return next
    })
  }, [])

  const reset = useCallback((to: PatientFormValues = EMPTY) => {
    setValues(to)
    setErrors({})
  }, [])

  return { values, set, reset, errors, setErrors }
}

export { EMPTY as EMPTY_PATIENT_FORM }
