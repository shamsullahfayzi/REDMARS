import { useMutation } from '@tanstack/react-query'
import {
  visitHistoryResponseSchema,
  visitSummarySchema,
  type ChangeVisitStatusRequest,
} from '@redmars/shared'
import { useQuery } from '@tanstack/react-query'
import { apiGet, apiPatch } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'

/**
 * Task 3.9 — move a visit through care.
 *
 * No optimistic update. The server refuses illegal moves and refuses a move made from a
 * state the visit has already left, and both refusals exist because two people can have
 * the same visit on screen — so showing a change that has not been accepted yet would
 * paint over the exact case the guard was written for. The queue is invalidated on
 * either outcome, success or failure, so the row ends up showing what is true.
 */
export function useChangeVisitStatus(visitId: string) {
  return useMutation({
    mutationFn: (input: ChangeVisitStatusRequest) =>
      apiPatch(`/visits/${visitId}/status`, input, visitSummarySchema),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['visits'] })
    },
  })
}

/** The medico-legal trail for one visit, plus the wait and consultation durations. */
export function useVisitHistory(visitId: string | undefined) {
  return useQuery({
    queryKey: ['visits', 'history', visitId],
    queryFn: () => apiGet(`/visits/${visitId}/history`, visitHistoryResponseSchema),
    enabled: Boolean(visitId),
  })
}
