import { useQuery } from '@tanstack/react-query'
import { collectionsListResponseSchema } from '@redmars/shared'
import { apiGet } from '@/lib/api'

/**
 * Task 6b.7 — every unpaid lab or pharmacy bill, across the whole facility. Kept fresh
 * (staleTime 0, like the invoice register) and polled every 30s so a bill raised at the lab
 * or pharmacy counter shows up here — and clears the sidebar badge's count — without the
 * desk having to refresh.
 */
export function useCollectionsList() {
  return useQuery({
    queryKey: ['collections'],
    queryFn: () => apiGet('/collections', collectionsListResponseSchema),
    staleTime: 0,
    refetchInterval: 30_000,
  })
}
