import { useQuery } from '@tanstack/react-query'
import { queueResponseSchema, type QueueQuery } from '@redmars/shared'
import { apiGet } from '@/lib/api'

/**
 * How often the queue re-reads itself (task 3.8).
 *
 * Ten seconds, the slow end of the build order's 5–10. The thing being watched is a
 * person walking from the reception desk to a waiting room, so five seconds buys no
 * useful freshness and doubles the requests — and Farhat's network is not something to
 * spend for nothing.
 */
export const QUEUE_POLL_MS = 10_000

/**
 * Task 3.7 — who is waiting. Task 3.8 — without anyone pressing anything.
 *
 * The poll is a `refetchInterval` and genuinely nothing more; the "sync" this looked
 * like from a distance is one number. What needed thought is not the polling but the
 * FAILING: react-query keeps the last good data when a refetch errors, so a screen with
 * a dead network shows a queue that looks current and is not. The page reads
 * `isError` alongside `dataUpdatedAt` to say so out loud.
 *
 * Background tabs do not poll — `refetchIntervalInBackground` defaults to false — so a
 * forgotten tab costs nothing until someone looks at it again.
 */
export function useQueue(filters: Partial<QueueQuery>, options: { poll?: boolean } = {}) {
  const params = new URLSearchParams()
  if (filters.departmentId) params.set('departmentId', filters.departmentId)
  if (filters.practitionerId) params.set('practitionerId', filters.practitionerId)
  if (filters.date) params.set('date', filters.date)
  if (filters.status) params.set('status', filters.status)
  if (filters.includeClosed) params.set('includeClosed', 'true')
  const query = params.toString()

  return useQuery({
    queryKey: ['visits', 'queue', query],
    queryFn: () => apiGet(`/visits/queue${query ? `?${query}` : ''}`, queueResponseSchema),
    // The wait times age between reads, so a stale queue is a misleading one.
    staleTime: 0,
    refetchInterval: options.poll === false ? false : QUEUE_POLL_MS,
  })
}

/**
 * How long is too long. Not a clinical judgement — nobody is triaged by a colour here —
 * but a service one: a wait nobody has noticed is the thing a queue screen exists to
 * make impossible to miss.
 */
export function waitTone(minutes: number): 'normal' | 'warning' | 'urgent' {
  if (minutes >= 60) return 'urgent'
  if (minutes >= 30) return 'warning'
  return 'normal'
}
