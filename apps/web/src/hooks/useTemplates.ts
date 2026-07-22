import { useMutation, useQuery } from '@tanstack/react-query'
import {
  templateListResponseSchema,
  templateSchema,
  visitSummarySchema,
  type CreateTemplateRequest,
  type TemplateType,
  type UpdateComplaintRequest,
} from '@redmars/shared'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api'
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

/**
 * Task 4.12 — remove one.
 *
 * Your own goes; a shared one needs `template.manage.shared`; a colleague's private one is
 * a 404. All of that is the server's, and the button is only rendered for templates the
 * list already marked `isMine` — hiding it is courtesy, the check is there.
 */
export function useDeleteTemplate(type: TemplateType) {
  return useMutation({
    // Returns the remaining list, per this codebase's DELETE convention.
    mutationFn: (id: string) => apiDelete(`/templates/${id}`, templateListResponseSchema),
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
