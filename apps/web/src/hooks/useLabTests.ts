import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  labTestListResponseSchema,
  labTestSummarySchema,
  type CreateLabTestRequest,
  type LabTestListResponse,
  type UpdateLabTestRequest,
} from '@redmars/shared'
import { apiGet, apiPatch, apiPost } from '@/lib/api'

const LAB_TESTS_KEY = ['lab-tests']

/** Every lab test in the facility, active and inactive. Server-side labtest.manage (admin + lab tech). */
export function useLabTests() {
  return useQuery<LabTestListResponse>({
    queryKey: LAB_TESTS_KEY,
    queryFn: () => apiGet('/lab-tests', labTestListResponseSchema),
  })
}

export function useCreateLabTest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateLabTestRequest) => apiPost('/lab-tests', input, labTestSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LAB_TESTS_KEY }),
  })
}

export function useUpdateLabTest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateLabTestRequest }) =>
      apiPatch(`/lab-tests/${vars.id}`, vars.input, labTestSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LAB_TESTS_KEY }),
  })
}

export function useSetLabTestActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) =>
      apiPatch(`/lab-tests/${vars.id}/active`, { isActive: vars.isActive }, labTestSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LAB_TESTS_KEY }),
  })
}
