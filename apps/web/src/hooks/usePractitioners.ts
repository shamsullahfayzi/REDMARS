import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  practitionerListResponseSchema,
  practitionerSummarySchema,
  type CreatePractitionerRequest,
  type PractitionerListResponse,
} from '@redmars/shared'
import { apiGet, apiPatch, apiPost, apiPut } from '@/lib/api'

const PRACTITIONERS_KEY = ['practitioners']

/** Every practitioner in the facility. Admin-only server-side (practitioner.manage). */
export function usePractitioners() {
  return useQuery<PractitionerListResponse>({
    queryKey: PRACTITIONERS_KEY,
    queryFn: () => apiGet('/practitioners', practitionerListResponseSchema),
  })
}

export function useCreatePractitioner() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePractitionerRequest) =>
      apiPost('/practitioners', input, practitionerSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRACTITIONERS_KEY }),
  })
}

export function useSetPractitionerActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) =>
      apiPatch(`/practitioners/${vars.id}/active`, { isActive: vars.isActive }, practitionerSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRACTITIONERS_KEY }),
  })
}

export function useSetPractitionerDepartments() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; departmentIds: string[] }) =>
      apiPut(
        `/practitioners/${vars.id}/departments`,
        { departmentIds: vars.departmentIds },
        practitionerSummarySchema,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRACTITIONERS_KEY }),
  })
}
