import { useQuery } from '@tanstack/react-query'
import { collectionsListResponseSchema } from '@redmars/shared'
import { apiGet } from '@/lib/api'

interface CollectionsListParams {
  /** Optional narrowing, not a default — absent means every open bill, oldest debt included. */
  from?: string
  to?: string
  q?: string
  page: number
}

/**
 * Task 6b.7 — every unpaid lab or pharmacy bill, across the whole facility. Kept fresh
 * (staleTime 0, like the invoice register) and polled every 30s so a bill raised at the lab
 * or pharmacy counter shows up here — and clears the sidebar badge's count — without the
 * desk having to refresh.
 *
 * Paginated (like the invoice register), but with NO default date filter — this worklist's
 * whole point is surfacing a bill still owed, however old, so hiding one behind a "today"
 * default would work against the reason it exists.
 */
export function useCollectionsList(params: CollectionsListParams) {
  const search = new URLSearchParams()
  if (params.from) search.set('from', params.from)
  if (params.to) search.set('to', params.to)
  if (params.q?.trim()) search.set('q', params.q.trim())
  search.set('page', String(params.page))

  return useQuery({
    queryKey: ['collections', params],
    queryFn: () => apiGet(`/collections?${search.toString()}`, collectionsListResponseSchema),
    staleTime: 0,
    refetchInterval: 30_000,
  })
}
