import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { PATIENT_SEARCH_MIN, patientSearchResponseSchema } from '@redmars/shared'
import { apiGet } from '@/lib/api'

/**
 * One box over name, MRN and phone (task 3.2). Fires only once the term reaches the
 * server's minimum — a shorter one would 400 — and keeps the previous results on screen
 * while the next load, so the list does not flicker empty between keystrokes at the desk.
 * Debouncing the input is the caller's job.
 */
export function usePatientSearch(query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: ['patients', 'search', q],
    queryFn: () => apiGet(`/patients?q=${encodeURIComponent(q)}`, patientSearchResponseSchema),
    enabled: q.length >= PATIENT_SEARCH_MIN,
    placeholderData: keepPreviousData,
  })
}
