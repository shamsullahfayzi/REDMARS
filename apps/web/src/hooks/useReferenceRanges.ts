import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  referenceRangeListResponseSchema,
  referenceRangeSummarySchema,
  type CreateReferenceRangeRequest,
  type ReferenceRangeListResponse,
  type UpdateReferenceRangeRequest,
} from '@redmars/shared'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api'

// One query key per test — a test's ranges are fetched and invalidated on their own.
const rangesKey = (testId: string) => ['lab-tests', testId, 'ranges']

/** The reference ranges for one lab test. Server-side labtest.manage (admin + lab tech). */
export function useReferenceRanges(testId: string, enabled: boolean) {
  return useQuery<ReferenceRangeListResponse>({
    queryKey: rangesKey(testId),
    queryFn: () => apiGet(`/lab-tests/${testId}/ranges`, referenceRangeListResponseSchema),
    enabled,
  })
}

export function useCreateReferenceRange(testId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateReferenceRangeRequest) =>
      apiPost(`/lab-tests/${testId}/ranges`, input, referenceRangeSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rangesKey(testId) }),
  })
}

export function useUpdateReferenceRange(testId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateReferenceRangeRequest }) =>
      apiPatch(`/lab-tests/${testId}/ranges/${vars.id}`, vars.input, referenceRangeSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rangesKey(testId) }),
  })
}

export function useDeleteReferenceRange(testId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete(`/lab-tests/${testId}/ranges/${id}`, referenceRangeListResponseSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rangesKey(testId) }),
  })
}
