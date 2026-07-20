import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  labPanelListResponseSchema,
  labPanelSummarySchema,
  type CreateLabPanelRequest,
  type LabPanelListResponse,
  type UpdateLabPanelRequest,
} from '@redmars/shared'
import { apiGet, apiPatch, apiPost, apiPut } from '@/lib/api'

const LAB_PANELS_KEY = ['lab-panels']

/** Every lab panel in the facility, with its member test ids. Admin-only server-side (panel.manage). */
export function useLabPanels() {
  return useQuery<LabPanelListResponse>({
    queryKey: LAB_PANELS_KEY,
    queryFn: () => apiGet('/lab-panels', labPanelListResponseSchema),
  })
}

export function useCreateLabPanel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateLabPanelRequest) =>
      apiPost('/lab-panels', input, labPanelSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LAB_PANELS_KEY }),
  })
}

export function useUpdateLabPanel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateLabPanelRequest }) =>
      apiPatch(`/lab-panels/${vars.id}`, vars.input, labPanelSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LAB_PANELS_KEY }),
  })
}

export function useSetLabPanelActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) =>
      apiPatch(`/lab-panels/${vars.id}/active`, { isActive: vars.isActive }, labPanelSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LAB_PANELS_KEY }),
  })
}

/** Replaces a panel's whole member-test set (PUT, not a merge). */
export function useSetLabPanelTests() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; testIds: string[] }) =>
      apiPut(`/lab-panels/${vars.id}/tests`, { testIds: vars.testIds }, labPanelSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LAB_PANELS_KEY }),
  })
}
