import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { discountCeilingResponseSchema } from '@redmars/shared'
import { apiGet, apiPatch } from '@/lib/api'

const CEILING_KEY = ['settings', 'discount-ceiling']

/**
 * Task 6b.1 — the R10 ceiling, read from the server rather than a compile-time constant.
 * Everyone who can give a discount needs this number; only an admin can change it.
 */
export function useDiscountCeiling() {
  return useQuery({
    queryKey: CEILING_KEY,
    queryFn: () => apiGet('/settings/discount-ceiling', discountCeilingResponseSchema),
  })
}

export function useSetDiscountCeiling() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (maxPercent: number) =>
      apiPatch('/settings/discount-ceiling', { maxPercent }, discountCeilingResponseSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CEILING_KEY }),
  })
}
