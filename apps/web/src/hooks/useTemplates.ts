import { useMutation, useQuery } from '@tanstack/react-query'
import {
  templateListResponseSchema,
  templateSchema,
  visitSummarySchema,
  type CreateTemplateRequest,
  type TemplateType,
  type UpdateComplaintRequest,
} from '@redmars/shared'
import { apiGet, apiPatch, apiPost } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'

/**
 * Task 4.4 — the shared list plus your own, never a colleague's. The narrowing is the
 * server's; this just asks.
 *
 * staleTime is generous: a template list changes when somebody saves a phrase, which is
 * rare, and a doctor between two patients should not pay for a refetch.
 */
export function useTemplates(type: TemplateType) {
  return useQuery({
    queryKey: ['templates', type],
    queryFn: () => apiGet(`/templates?type=${type}`, templateListResponseSchema),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateTemplate(type: TemplateType) {
  return useMutation({
    mutationFn: (input: CreateTemplateRequest) => apiPost('/templates', input, templateSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates', type] }),
  })
}

/** The doctor's version of what the patient came in with, replacing the desk's. */
export function useUpdateComplaint(visitId: string) {
  return useMutation({
    mutationFn: (input: UpdateComplaintRequest) =>
      apiPatch(`/visits/${visitId}/complaint`, input, visitSummarySchema),
    // The complaint is in the consult header as well as in this tab, so the whole visit
    // tree is invalidated rather than just this screen's slice.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['visits'] }),
  })
}
