import { useQuery } from '@tanstack/react-query'
import { tillReportResponseSchema } from '@redmars/shared'
import { apiGet } from '@/lib/api'

/**
 * The till reconciliation (task 6.12). `mine` is the operator's own drawer; `all` is every
 * till, for oversight. Kept fresh (staleTime 0) — a reconciliation read at closing must
 * reflect the last payment taken, not a cached figure.
 */
export function useTillReport(scope: 'mine' | 'all', date: string | undefined) {
  const path = scope === 'mine' ? '/reports/till/mine' : '/reports/till'
  const search = date ? `?date=${date}` : ''
  return useQuery({
    queryKey: ['till', scope, date ?? 'today'],
    queryFn: () => apiGet(`${path}${search}`, tillReportResponseSchema),
    staleTime: 0,
  })
}
