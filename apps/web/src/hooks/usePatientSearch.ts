import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { PATIENT_SEARCH_MIN, patientSearchResponseSchema } from '@redmars/shared'
import { apiGet } from '@/lib/api'

/**
 * The patient register (tasks 3.2, 3.3).
 *
 * With no term this lists everyone, paged — an empty search box shows patients rather
 * than an empty screen. With a term it searches name, MRN and phone at once. Previous
 * results stay on screen while the next load so the list does not flicker between
 * keystrokes at the desk. Debouncing the input is the caller's job.
 */
export function usePatientSearch(query: string, page = 1) {
  const q = query.trim()
  // A single character would 400; treat it as "not searching yet" and keep listing.
  const term = q.length >= PATIENT_SEARCH_MIN ? q : ''

  return useQuery({
    queryKey: ['patients', 'search', term, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) })
      if (term) params.set('q', term)
      return apiGet(`/patients?${params.toString()}`, patientSearchResponseSchema)
    },
    placeholderData: keepPreviousData,
  })
}
