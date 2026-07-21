import { useCallback, useState } from 'react'
import type { AgeUnit, PatientDetail } from '@redmars/shared'

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
  ageValue: string
  ageUnit: AgeUnit
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
  ageValue: '',
  ageUnit: 'years',
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

/** Form values -> the wire contract. One number and a unit become the right column. */
export function toPayload(values: PatientFormValues, acknowledgeDuplicate = false) {
  const age = values.ageValue.trim() === '' ? null : Number(values.ageValue)
  return {
    firstName: values.firstName.trim(),
    lastName: orNull(values.lastName),
    prefix: orNull(values.prefix),
    gender: values.gender,
    phone: values.phone.trim(),
    altPhone: orNull(values.altPhone),
    dateOfBirth: orNull(values.dateOfBirth),
    estimatedAgeYears: values.ageUnit === 'years' ? age : null,
    estimatedAgeMonths: values.ageUnit === 'months' ? age : null,
    estimatedAgeDays: null,
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
  // Months only when there is no year — the form shows one number, so pick the one the
  // record was actually stated in.
  const useMonths = patient.estimatedAgeYears == null && patient.estimatedAgeMonths != null
  return {
    firstName: patient.firstName,
    lastName: patient.lastName ?? '',
    prefix: patient.prefix ?? '',
    gender: patient.gender,
    ageValue: useMonths
      ? String(patient.estimatedAgeMonths)
      : patient.estimatedAgeYears != null
        ? String(patient.estimatedAgeYears)
        : '',
    ageUnit: useMonths ? 'months' : 'years',
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
