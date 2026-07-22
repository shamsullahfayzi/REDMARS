import { useQuery } from '@tanstack/react-query'
import { followUpListResponseSchema, type FollowUpQuery } from '@redmars/shared'
import { apiGet } from '@/lib/api'

/**
 * Task 4.15 — who was told to come back, and by when.
 *
 * No polling. The queue re-reads itself every ten seconds because a patient walking to the
 * waiting room changes it (task 3.8); a recall list changes when somebody is prescribed to,
 * which is not something the desk is watching for. Working it is a deliberate act, and the
 * refresh button is there for the one case where it matters.
 */
export function useFollowUps(filters: Partial<FollowUpQuery>) {
  const params = new URLSearchParams()
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.practitionerId) params.set('practitionerId', filters.practitionerId)
  if (filters.onlyMissed) params.set('onlyMissed', 'true')
  const query = params.toString()

  return useQuery({
    queryKey: ['followUps', query],
    queryFn: () => apiGet(`/follow-ups${query ? `?${query}` : ''}`, followUpListResponseSchema),
  })
}
