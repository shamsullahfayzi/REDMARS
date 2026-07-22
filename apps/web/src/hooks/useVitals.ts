import { useMutation, useQuery } from '@tanstack/react-query'
import {
  vitalsListResponseSchema,
  vitalsReadingSchema,
  type RecordVitalsRequest,
} from '@redmars/shared'
import { apiGet, apiPost } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'

/** Task 4.3 — every reading taken during this visit, newest first. */
export function useVitals(visitId: string | undefined) {
  return useQuery({
    queryKey: ['visits', 'vitals', visitId],
    queryFn: () => apiGet(`/visits/${visitId}/vitals`, vitalsListResponseSchema),
    enabled: Boolean(visitId),
  })
}

/**
 * Recording appends. There is no update mutation because there is no update endpoint —
 * a re-taken blood pressure is a second reading, not an edit of the first.
 */
export function useRecordVitals(visitId: string) {
  return useMutation({
    mutationFn: (input: RecordVitalsRequest) =>
      apiPost(`/visits/${visitId}/vitals`, input, vitalsReadingSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['visits', 'vitals', visitId] }),
  })
}
