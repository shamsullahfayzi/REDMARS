import { useMutation } from '@tanstack/react-query'
import {
  checkInResponseSchema,
  openVisitConflictSchema,
  type CheckInRequest,
  type DuplicateMatch,
  type VisitSummary,
} from '@redmars/shared'
import { ApiError, apiPost } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'
import { duplicateMatchesFromError } from '@/hooks/usePatient'

/**
 * Task 3.6 — one save. The response carries the patient, the visit and the paid invoice,
 * which together are the slip the desk hands over.
 */
export function useCheckIn() {
  return useMutation({
    mutationFn: (input: CheckInRequest) =>
      apiPost('/reception/check-in', input, checkInResponseSchema),
    onSuccess: () => {
      // The register and any queue reading it are both stale now.
      void queryClient.invalidateQueries({ queryKey: ['patients'] })
      void queryClient.invalidateQueries({ queryKey: ['visits'] })
    },
  })
}

/**
 * A check-in can be refused for two different reasons that both arrive as a 409, and the
 * desk needs to be told which: an existing patient who looks like this one, or an open
 * visit this patient already has. Everything else is a failure, not a decision.
 */
export function conflictFromError(
  error: unknown,
): { kind: 'duplicate'; matches: DuplicateMatch[] } | { kind: 'openVisit'; visits: VisitSummary[] } | null {
  const duplicates = duplicateMatchesFromError(error)
  if (duplicates) return { kind: 'duplicate', matches: duplicates }

  if (!(error instanceof ApiError) || error.status !== 409) return null
  const parsed = openVisitConflictSchema.safeParse(error.body)
  return parsed.success ? { kind: 'openVisit', visits: parsed.data.visits } : null
}
