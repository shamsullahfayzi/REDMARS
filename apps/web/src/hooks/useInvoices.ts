import { useQuery } from '@tanstack/react-query'
import { invoiceDetailSchema, invoiceListResponseSchema } from '@redmars/shared'
import { apiGet } from '@/lib/api'

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
