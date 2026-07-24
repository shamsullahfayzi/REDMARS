import { useMutation, useQuery } from '@tanstack/react-query'
import {
  type ApplyDiscountRequest,
  applyDiscountResponseSchema,
  invoiceDetailSchema,
  invoiceListResponseSchema,
  type RecordPaymentRequest,
  recordPaymentResponseSchema,
  type RefundPaymentRequest,
  refundPaymentResponseSchema,
  visitBillsResponseSchema,
} from '@redmars/shared'
import { apiGet, apiPost } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'

export interface InvoiceListParams {
  q?: string
  date?: string
  patientId?: string
  status?: string
  page: number
}

/**
 * The invoice register (task 6.1). Kept fresh (staleTime 0) — a bill raised at the next
 * window over should appear when the desk looks, not after a cache lag.
 */
export function useInvoiceList(params: InvoiceListParams) {
  const search = new URLSearchParams()
  if (params.q?.trim()) search.set('q', params.q.trim())
  if (params.date) search.set('date', params.date)
  if (params.patientId) search.set('patientId', params.patientId)
  if (params.status) search.set('status', params.status)
  search.set('page', String(params.page))

  return useQuery({
    queryKey: ['invoices', params],
    queryFn: () => apiGet(`/invoices?${search.toString()}`, invoiceListResponseSchema),
    staleTime: 0,
  })
}

/** One invoice in full, for the reprint. Only fetched once an invoice is opened. */
export function useInvoiceDetail(invoiceId: string | null) {
  return useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => apiGet(`/invoices/${invoiceId}`, invoiceDetailSchema),
    enabled: !!invoiceId,
    staleTime: 30_000,
  })
}

/**
 * Every bill one visit carries, across the three tills (task 6.2). Fetched only when an
 * invoice tied to a visit is open, so the desk can see its siblings and the running total.
 */
export function useVisitBills(visitId: string | null) {
  return useQuery({
    queryKey: ['visit-bills', visitId],
    queryFn: () => apiGet(`/invoices/by-visit/${visitId}`, visitBillsResponseSchema),
    enabled: !!visitId,
    staleTime: 0,
  })
}

/**
 * Take a payment against a bill (task 6.3) — cash in full, or an instalment. On success the
 * bill's balance, its sibling visit bills and the register all change, so all three caches
 * are dropped; the resolved value carries the receipt number for the slip.
 */
export function useRecordPayment(invoiceId: string) {
  return useMutation({
    mutationFn: (input: RecordPaymentRequest) =>
      apiPost(`/invoices/${invoiceId}/payments`, input, recordPaymentResponseSchema),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
      void queryClient.invalidateQueries({ queryKey: ['visit-bills'] })
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

/**
 * Refund one payment on a bill (task 6.6, Rule R5). Reverses the row and reshapes the
 * balance, so the same three caches drop; the resolved value carries the refund receipt.
 */
export function useRefundPayment(invoiceId: string) {
  return useMutation({
    mutationFn: ({ paymentId, input }: { paymentId: string; input: RefundPaymentRequest }) =>
      apiPost(
        `/invoices/${invoiceId}/payments/${paymentId}/refund`,
        input,
        refundPaymentResponseSchema,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
      void queryClient.invalidateQueries({ queryKey: ['visit-bills'] })
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

/**
 * Apply a discount to a bill (task 6.4, Rule R10). Reshapes the total, so the same three
 * caches drop as a payment does — the detail, the visit's bills, and the register.
 */
export function useApplyDiscount(invoiceId: string) {
  return useMutation({
    mutationFn: (input: ApplyDiscountRequest) =>
      apiPost(`/invoices/${invoiceId}/discount`, input, applyDiscountResponseSchema),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
      void queryClient.invalidateQueries({ queryKey: ['visit-bills'] })
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}
