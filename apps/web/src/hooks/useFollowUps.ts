import { useMutation, useQuery } from '@tanstack/react-query'
import {
  followUpListResponseSchema,
  followUpSchema,
  type FollowUpQuery,
  type RecordFollowUpResponseRequest,
} from '@redmars/shared'
import { apiGet, apiPost } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'

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

/**
 * `follow_up.respond` — the call center's (or admin's) answer for one follow-up. Invalidates
 * every `followUps` query rather than patching the one row in place: the list is keyed by
 * whichever from/to/practitioner filter is on screen, and refetching is one round trip on an
 * action that already waited for a phone call.
 */
export function useRespondFollowUp() {
  return useMutation({
    mutationFn: ({
      prescriptionId,
      ...input
    }: RecordFollowUpResponseRequest & { prescriptionId: string }) =>
      apiPost(`/follow-ups/${prescriptionId}/respond`, input, followUpSchema),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['followUps'] })
    },
  })
}
