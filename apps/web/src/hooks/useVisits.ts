import { useMutation, useQuery } from '@tanstack/react-query'
import {
  openVisitConflictSchema,
  visitOptionsResponseSchema,
  visitSummarySchema,
  type CreateVisitRequest,
  type VisitSummary,
} from '@redmars/shared'
import { ApiError, apiGet, apiPost } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'

export const VISIT_KEY = ['visits']

/**
 * The department and doctor pickers (task 3.5).
 *
 * Its own endpoint, not the admin department/practitioner lists: those are gated on
 * `*.manage` and a receptionist gets a 403 from both. This one is gated on
 * `visit.read_queue` and carries only active rows.
 *
 * staleTime is generous on purpose — master data changes when an admin edits it, which
 * is roughly never during a shift, and the desk should not pay for a refetch per visit.
 */
export function useVisitOptions() {
  return useQuery({
    queryKey: ['visits', 'options'],
    queryFn: () => apiGet('/visits/options', visitOptionsResponseSchema),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateVisit() {
  return useMutation({
    mutationFn: (input: CreateVisitRequest) => apiPost('/visits', input, visitSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VISIT_KEY }),
  })
}

/**
 * The open visits the server refused to file over, pulled out of a 409. Returns null for
 * every other failure so the caller can tell "this needs a decision" from "this broke" —
 * same shape as duplicateMatchesFromError (task 3.3).
 */
export function openVisitsFromError(error: unknown): VisitSummary[] | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  const parsed = openVisitConflictSchema.safeParse(error.body)
  return parsed.success ? parsed.data.visits : null
}
