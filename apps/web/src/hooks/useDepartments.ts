import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  departmentListResponseSchema,
  departmentSummarySchema,
  type CreateDepartmentRequest,
  type DepartmentListResponse,
} from '@redmars/shared'
import { apiGet, apiPatch, apiPost } from '@/lib/api'

const DEPARTMENTS_KEY = ['departments']

/** Every department, active and inactive. Admin-only server-side; a non-admin call comes back 403. */
export function useDepartments() {
  return useQuery<DepartmentListResponse>({
    queryKey: DEPARTMENTS_KEY,
    queryFn: () => apiGet('/departments', departmentListResponseSchema),
  })
}

export function useCreateDepartment() {
  const queryClient = useQueryClient()
  return useMutation({
    // The RESPONSE is a single department summary — validate against that, not the
    // request schema. Refetch the list rather than patching it by hand: the server
    // owns what a saved department looks like.
    mutationFn: (input: CreateDepartmentRequest) =>
      apiPost('/departments', input, departmentSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEPARTMENTS_KEY }),
  })
}

export function useSetDepartmentActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) =>
      apiPatch(`/departments/${vars.id}/active`, { isActive: vars.isActive }, departmentSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEPARTMENTS_KEY }),
  })
}
