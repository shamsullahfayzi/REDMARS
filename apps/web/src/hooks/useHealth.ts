import { useQuery } from '@tanstack/react-query'
import { healthResponseSchema, type HealthResponse } from '@redmars/shared'
import { apiGet } from '@/lib/api'

/**
 * The return type is inferred straight from the shared schema — nothing here
 * restates the shape, so there is nothing to keep in sync by hand.
 */
export function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: () => apiGet('/health', healthResponseSchema),
  })
}
