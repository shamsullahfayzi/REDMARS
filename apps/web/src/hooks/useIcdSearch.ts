import { useQuery } from '@tanstack/react-query'
import { icdSearchResponseSchema, MIN_ICD_QUERY_LENGTH } from '@redmars/shared'
import { apiGet } from '@/lib/api'

export function useIcdSearch(query: string, page: number, enabled = true) {
  const q = query.trim()
  const params = new URLSearchParams({ page: String(page) })
  if (q) params.set('q', q)
  return useQuery({
    queryKey: ['icd', q, page],
    queryFn: () => apiGet(`/icd?${params}`, icdSearchResponseSchema),
    enabled: enabled && (!q || q.length >= MIN_ICD_QUERY_LENGTH),
  })
}
