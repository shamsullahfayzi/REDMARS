import { useMutation } from '@tanstack/react-query'
import { patientSummarySchema, type CreatePatientRequest } from '@redmars/shared'
import { apiPost } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'

export const PATIENT_KEY = ['patients']

/**
 * Register a patient (task 3.1). The third argument to apiPost is the RESPONSE schema —
 * what comes back is a summary carrying the server-issued MRN, not the request body.
 */
export function useCreatePatient() {
  return useMutation({
    mutationFn: (input: CreatePatientRequest) =>
      apiPost('/patients', input, patientSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PATIENT_KEY }),
  })
}
