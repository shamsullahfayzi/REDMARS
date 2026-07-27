import { useMutation, useQuery } from '@tanstack/react-query'
import {
  labOrderResponseSchema,
  labTestListResponseSchema,
  visitLabResultsResponseSchema,
  type SaveLabOrderRequest,
} from '@redmars/shared'
import { apiGet, apiPut } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'

/** This visit's lab order, or null. Null is a normal answer — most visits order nothing. */
export function useLabOrder(visitId: string | undefined) {
  return useQuery({
    queryKey: ['visits', 'lab-order', visitId],
    queryFn: () => apiGet(`/visits/${visitId}/lab-order`, labOrderResponseSchema),
    enabled: Boolean(visitId),
  })
}

/** PUT, not POST: the whole order at once, and saving twice leaves one order (and one bill). */
export function useSaveLabOrder(visitId: string) {
  return useMutation({
    mutationFn: (input: SaveLabOrderRequest) =>
      apiPut(`/visits/${visitId}/lab-order`, input, labOrderResponseSchema),
    // Task 6b.4 — ordering a test on an `arrived` visit starts it server-side, so the whole
    // visit tree is invalidated rather than just this tab's own slice.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['visits'] }),
  })
}

/**
 * The visit's lab results, read back by the doctor — verified values come home here. Kept a
 * little fresh (30s) so a result signed off while the doctor has the visit open appears
 * without a manual reload.
 */
export function useVisitLabResults(visitId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['visits', 'lab-results', visitId],
    queryFn: () => apiGet(`/visits/${visitId}/lab-results`, visitLabResultsResponseSchema),
    enabled: enabled && Boolean(visitId),
    staleTime: 30 * 1000,
  })
}

/**
 * The catalog the doctor may order from — active tests only, gated on the doctor's own
 * `lab_order.create` rather than the catalog-management right. Fetched once and filtered in
 * the browser, like the formulary: a request per keystroke is latency the picker cannot
 * afford. `enabled` keeps it from firing on a closed visit or a facility without the lab.
 */
export function useOrderableTests(enabled: boolean) {
  return useQuery({
    queryKey: ['lab-tests', 'orderable'],
    queryFn: () => apiGet('/lab-tests/orderable', labTestListResponseSchema),
    staleTime: 10 * 60 * 1000,
    enabled,
  })
}
