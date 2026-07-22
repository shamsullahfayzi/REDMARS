import { useMutation, useQuery } from '@tanstack/react-query'
import {
  drugListResponseSchema,
  prescriptionResponseSchema,
  type SavePrescriptionRequest,
} from '@redmars/shared'
import { apiGet, apiPut } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'

/** Task 4.7 — this visit's prescription, or null. Null is a normal answer. */
export function usePrescription(visitId: string | undefined) {
  return useQuery({
    queryKey: ['visits', 'prescription', visitId],
    queryFn: () => apiGet(`/visits/${visitId}/prescription`, prescriptionResponseSchema),
    enabled: Boolean(visitId),
  })
}

/** PUT, not POST: the whole sheet at once, and saving twice leaves one prescription. */
export function useSavePrescription(visitId: string) {
  return useMutation({
    mutationFn: (input: SavePrescriptionRequest) =>
      apiPut(`/visits/${visitId}/prescription`, input, prescriptionResponseSchema),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['visits', 'prescription', visitId] }),
  })
}

/**
 * The formulary, for the autocomplete. Gated on `drug.read` since task 4.7 — the doctor
 * could not read it before, which is the one thing the catalogue exists for.
 *
 * The whole list, cached hard: a hospital formulary is a few hundred rows that change when
 * an admin edits them, and filtering in the browser is instant where a request per keystroke
 * is not. "Four drugs in under 30 seconds" is a latency budget.
 */
export function useFormulary() {
  return useQuery({
    queryKey: ['drugs', 'formulary'],
    queryFn: () => apiGet('/drugs', drugListResponseSchema),
    staleTime: 10 * 60 * 1000,
  })
}
