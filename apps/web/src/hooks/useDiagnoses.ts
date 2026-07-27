import { useMutation, useQuery } from '@tanstack/react-query'
import {
  diagnosisListResponseSchema,
  diagnosisSchema,
  type RecordDiagnosisRequest,
  type UpdateDiagnosisRequest,
} from '@redmars/shared'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'

/** Task 4.5 — every conclusion reached during this visit, primary first. */
export function useDiagnoses(visitId: string | undefined) {
  return useQuery({
    queryKey: ['visits', 'diagnoses', visitId],
    queryFn: () => apiGet(`/visits/${visitId}/diagnoses`, diagnosisListResponseSchema),
    enabled: Boolean(visitId),
  })
}

/**
 * All three writers invalidate the whole visit tree, not just this list: adding or
 * updating a primary diagnosis takes the flag off another one, and (task 6b.4) a first
 * diagnosis on an `arrived` visit starts it server-side, which the header needs to hear.
 */
export function useDiagnosisWriters(visitId: string) {
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['visits'] })

  const add = useMutation({
    mutationFn: (input: RecordDiagnosisRequest) =>
      apiPost(`/visits/${visitId}/diagnoses`, input, diagnosisSchema),
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDiagnosisRequest }) =>
      apiPatch(`/visits/${visitId}/diagnoses/${id}`, input, diagnosisSchema),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    // Returns the remaining list, per this codebase's DELETE convention — and here for a
    // second reason: removing a primary diagnosis changes which one is primary.
    mutationFn: (id: string) =>
      apiDelete(`/visits/${visitId}/diagnoses/${id}`, diagnosisListResponseSchema),
    onSuccess: invalidate,
  })

  return { add, update, remove }
}
