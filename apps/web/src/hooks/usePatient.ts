import { useMutation, useQuery } from '@tanstack/react-query'
import {
  duplicateCheckResponseSchema,
  patientSummarySchema,
  type CreatePatientRequest,
  type DuplicateMatch,
} from '@redmars/shared'
import { ApiError, apiGet, apiPost } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'

export const PATIENT_KEY = ['patients']

/**
 * Register a patient (task 3.1). The third argument to apiPost is the RESPONSE schema —
 * what comes back is a summary carrying the server-issued MRN, not the request body.
 */
export function useCreatePatient() {
  return useMutation({
    mutationFn: (input: CreatePatientRequest) => apiPost('/patients', input, patientSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PATIENT_KEY }),
  })
}

/**
 * The duplicates the server refused to register over (task 3.3), pulled out of a 409.
 * Returns null for every other failure, so the caller can tell "this needs a decision"
 * apart from "this broke".
 */
export function duplicateMatchesFromError(error: unknown): DuplicateMatch[] | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  const parsed = duplicateCheckResponseSchema.safeParse(error.body)
  return parsed.success ? parsed.data.matches : null
}

/**
 * The advisory check, run while the receptionist is still typing (task 3.3). This is the
 * courtesy half — it shows what is probably already there. The create endpoint is the
 * control: it refuses a high-confidence duplicate whether or not this ever ran.
 */
export function useDuplicateCheck(firstName: string, lastName: string, phone: string) {
  const name = firstName.trim()
  const digits = phone.replace(/\D/g, '')
  // Not worth asking until there is enough to match on.
  const enabled = name.length >= 2 && digits.length >= 7

  return useQuery({
    queryKey: ['patients', 'duplicates', name, lastName.trim(), digits],
    queryFn: () => {
      const params = new URLSearchParams({ firstName: name })
      if (lastName.trim()) params.set('lastName', lastName.trim())
      if (digits) params.set('phone', digits)
      return apiGet(`/patients/duplicates?${params.toString()}`, duplicateCheckResponseSchema)
    },
    enabled,
  })
}
