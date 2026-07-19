import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  serviceListResponseSchema,
  serviceSummarySchema,
  type CreateServiceRequest,
  type ServiceListResponse,
  type UpdateServiceRequest,
} from '@redmars/shared'
import { apiGet, apiPatch, apiPost } from '@/lib/api'

const SERVICES_KEY = ['services']

/** Every service in the facility, active and inactive. Admin-only server-side (service.manage). */
export function useServices() {
  return useQuery<ServiceListResponse>({
    queryKey: SERVICES_KEY,
    queryFn: () => apiGet('/services', serviceListResponseSchema),
  })
}

export function useCreateService() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateServiceRequest) => apiPost('/services', input, serviceSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SERVICES_KEY }),
  })
}

export function useUpdateService() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateServiceRequest }) =>
      apiPatch(`/services/${vars.id}`, vars.input, serviceSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SERVICES_KEY }),
  })
}

export function useSetServiceActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) =>
      apiPatch(`/services/${vars.id}/active`, { isActive: vars.isActive }, serviceSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SERVICES_KEY }),
  })
}
