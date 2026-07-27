import { useMutation, useQuery } from '@tanstack/react-query'
import {
  clinicalNoteListResponseSchema,
  clinicalNoteSchema,
  type SaveClinicalNoteRequest,
} from '@redmars/shared'
import { apiGet, apiPut } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'

/**
 * Task 4.13 — every note on the visit, in one request. There are at most four.
 *
 * Not fetched per note type. The notes tab needs all of them at once to know which of its
 * sections have anything in them, and four requests for four small rows would also mean
 * four R1 audit reads for one act of opening a tab.
 */
export function useClinicalNotes(visitId: string | undefined) {
  return useQuery({
    queryKey: ['visits', 'notes', visitId],
    queryFn: () => apiGet(`/visits/${visitId}/notes`, clinicalNoteListResponseSchema),
    enabled: Boolean(visitId),
  })
}

/** PUT — one note of each type per visit, so writing is replacing rather than adding. */
export function useSaveClinicalNote(visitId: string) {
  return useMutation({
    mutationFn: (input: SaveClinicalNoteRequest) =>
      apiPut(`/visits/${visitId}/notes`, input, clinicalNoteSchema),
    // Task 6b.4 — a first note on an `arrived` visit starts it server-side, so the whole
    // visit tree is invalidated rather than just this tab's own slice.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['visits'] }),
  })
}
