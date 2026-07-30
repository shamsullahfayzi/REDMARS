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
 * Taking payment for a set of lab lines. The amount is the server's sum; on success the
 * charges list, the lab queue, the doctor's own order tab and its results ALL refresh — a
 * paid line frees its test for the bench, and every one of those screens reads that same
 * per-line `isPaid`. Missing any of them was the bug: a line paid here kept reading
 * "unsettled" wherever the invalidation did not reach, because `isPaid` lives on the
 * invoice item, not on the invoice as a whole, and nothing else in the app updates it.
 *
 * `invoiceId` is optional — InvoiceDetailView (opened from Collections or the register) has
 * one and wants its own cache dropped too; LabChargesCard, reached from the patient's own
 * page, has no single invoice in view and passes nothing.
 */
export function usePayLabCharges(patientId: string | undefined, invoiceId?: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: PayLabChargesRequest) =>
      apiPost('/lab-charges/pay', body, payLabChargesResponseSchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['lab-charges', patientId] })
      void client.invalidateQueries({ queryKey: ['lab-queue'] })
      void client.invalidateQueries({ queryKey: ['visits', 'lab-order'] })
      void client.invalidateQueries({ queryKey: ['visits', 'lab-results'] })
      void client.invalidateQueries({ queryKey: ['invoices'] })
      void client.invalidateQueries({ queryKey: ['collections'] })
      if (invoiceId) void client.invalidateQueries({ queryKey: ['invoice', invoiceId] })
    },
  })
}
