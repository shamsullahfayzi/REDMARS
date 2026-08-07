import { useMutation } from '@tanstack/react-query'
import {
  cancelVisitResponseSchema,
  reassignPractitionerResponseSchema,
  visitHistoryResponseSchema,
  visitSummarySchema,
  type CancelVisitRequest,
  type ChangeVisitStatusRequest,
  type ReassignPractitionerRequest,
} from '@redmars/shared'
import { useQuery } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '@/lib/api'
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

/**
 * Task 3.11 — cancel a visit and give back what was paid for it.
 *
 * Invalidates the invoice side as well as the visit: the money moved, and any screen
 * showing a balance is now wrong.
 */
export function useCancelVisit(visitId: string) {
  return useMutation({
    mutationFn: (input: CancelVisitRequest) =>
      apiPost(`/visits/${visitId}/cancel`, input, cancelVisitResponseSchema),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['visits'] })
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

/**
 * Fixing who a visit is booked under.
 *
 * Invalidates the same `visits` query as the status/cancel mutations — the queue and any
 * open consult screen both key off it, and the row's doctor is now wrong until it refetches.
 */
export function useReassignPractitioner(visitId: string) {
  return useMutation({
    mutationFn: (input: ReassignPractitionerRequest) =>
      apiPost(`/visits/${visitId}/reassign-practitioner`, input, reassignPractitionerResponseSchema),
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
