import { useQuery } from '@tanstack/react-query'
import { queueResponseSchema, type QueueQuery } from '@redmars/shared'
import { apiGet } from '@/lib/api'

/**
 * Task 3.7 — who is waiting.
 *
 * No polling here on purpose: task 3.8 owns auto-refresh, and it is a `refetchInterval`
 * on this query and nothing else. Built so that is a one-line change rather than a
 * rewrite.
 */
export function useQueue(filters: Partial<QueueQuery>) {
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
    // The wait times age between refetches, so a stale queue is a misleading one.
    staleTime: 0,
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
