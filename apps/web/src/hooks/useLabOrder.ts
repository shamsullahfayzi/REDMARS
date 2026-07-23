import { useMutation, useQuery } from '@tanstack/react-query'
import {
  labOrderResponseSchema,
  labTestListResponseSchema,
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['visits', 'lab-order', visitId] }),
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
