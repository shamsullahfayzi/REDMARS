import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { icdSearchResponseSchema, MIN_ICD_QUERY_LENGTH } from '@redmars/shared'
import { apiGet } from '@/lib/api'

/**
 * Typeahead over the ICD-10 catalog. Fires only once the query reaches the server's
 * minimum length (two characters) — a shorter query would 400 — and keeps the last
 * results on screen while the next ones load, so the list does not flicker empty
 * between keystrokes. Debouncing the input is the caller's job.
 */
export function useIcdSearch(query: string) {
  const q = query.trim()
  const enabled = q.length >= MIN_ICD_QUERY_LENGTH
  return useQuery({
    queryKey: ['icd', q],
    queryFn: () =>
      apiGet(`/icd?q=${encodeURIComponent(q)}`, icdSearchResponseSchema),
    enabled,
    placeholderData: keepPreviousData,
  })
}
