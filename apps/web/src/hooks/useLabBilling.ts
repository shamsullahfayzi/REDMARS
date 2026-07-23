import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  labChargesResponseSchema,
  payLabChargesResponseSchema,
  type PayLabChargesRequest,
} from '@redmars/shared'
import { apiGet, apiPost } from '@/lib/api'

/**
 * A patient's outstanding lab charges, for the reception window. Unpaid orders only by
 * default — the desk is here to collect, not to browse history.
 */
export function useLabCharges(patientId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['lab-charges', patientId],
    queryFn: () =>
      apiGet(`/lab-charges?patientId=${patientId}`, labChargesResponseSchema),
    enabled: enabled && !!patientId,
    staleTime: 0,
  })
}

/**
 * Taking payment for a set of lab lines. The amount is the server's sum; on success both the
 * charges list and the lab queue refresh, since a paid line frees its test for the bench.
 */
export function usePayLabCharges(patientId: string | undefined) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: PayLabChargesRequest) =>
      apiPost('/lab-charges/pay', body, payLabChargesResponseSchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['lab-charges', patientId] })
      void client.invalidateQueries({ queryKey: ['lab-queue'] })
    },
  })
}
