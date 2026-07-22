import { useMutation, useQuery } from '@tanstack/react-query'
import {
  allergyConflictResponseSchema,
  drugListResponseSchema,
  interactionWarningResponseSchema,
  prescriptionResponseSchema,
  type AllergyConflict,
  type InteractionWarning,
  type SavePrescriptionRequest,
} from '@redmars/shared'
import { ApiError, apiGet, apiPut } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'

/**
 * Task 4.8 — the allergy conflicts the server refused on, pulled out of a 409.
 *
 * Returns null for every other failure, so the screen can tell "this needs a decision"
 * from "this broke" — the same shape as openVisitsFromError and duplicateMatchesFromError.
 */
export function allergyConflictsFromError(error: unknown): AllergyConflict[] | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  const parsed = allergyConflictResponseSchema.safeParse(error.body)
  return parsed.success ? parsed.data.conflicts : null
}

/**
 * Task 4.9 — the same shape for the interaction 409.
 *
 * Both refusals are 409s, and each is parsed by its own schema, so a body of the wrong
 * kind falls through to null rather than being rendered as the other one.
 */
export function interactionWarningsFromError(error: unknown): InteractionWarning[] | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  const parsed = interactionWarningResponseSchema.safeParse(error.body)
  return parsed.success ? parsed.data.interactions : null
}

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
