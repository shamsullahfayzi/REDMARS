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
    // Task 6b.4 — the first reading of an `arrived` visit starts it server-side, so the
    // whole visit tree is invalidated (same as useUpdateComplaint) rather than just this
    // tab's own slice, and the header's badge and Start button hear about it too.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['visits'] }),
  })
}
