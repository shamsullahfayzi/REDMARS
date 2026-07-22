import { useQuery } from '@tanstack/react-query'
import { consultContextSchema } from '@redmars/shared'
import { apiGet } from '@/lib/api'

/**
 * Task 4.1 — the consult screen's context.
 *
 * Under ['visits', ...] on purpose: starting the consultation moves the visit, and the
 * status hooks already invalidate that key, so the header re-reads itself without this
 * file knowing anything about who changes what.
 *
 * No polling. The queue is live because the queue is a list of other people arriving;
 * this is one patient sitting in front of one doctor, and a header that quietly re-fetched
 * mid-sentence would be motion for its own sake. It is refetched when the tab regains
 * focus, which is when a doctor coming back from another window wants it to be current.
 */
export function useConsultContext(visitId: string | undefined) {
  return useQuery({
    queryKey: ['visits', 'consult', visitId],
    queryFn: () => apiGet(`/visits/${visitId}/consult`, consultContextSchema),
    enabled: Boolean(visitId),
  })
}
