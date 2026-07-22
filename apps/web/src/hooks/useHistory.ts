import { useQuery } from '@tanstack/react-query'
import { patientHistoryResponseSchema } from '@redmars/shared'
import { apiGet } from '@/lib/api'

/**
 * Task 4.14 — the patient's last N months.
 *
 * Keyed by the PATIENT and by the window, not by the visit. The panel is rendered from a
 * consultation, but what it shows belongs to the person: opening the same patient's next
 * visit should hit the cache rather than re-fetch a year of their record, and re-fetching
 * is also an R1 audit row each time.
 */
export function usePatientHistory(patientId: string | undefined, months: number) {
  return useQuery({
    queryKey: ['patients', 'history', patientId, months],
    queryFn: () =>
      apiGet(`/patients/${patientId}/history?months=${months}`, patientHistoryResponseSchema),
    enabled: Boolean(patientId),
  })
}
