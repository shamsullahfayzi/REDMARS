import { useQuery } from '@tanstack/react-query'
import { pharmacyQueueResponseSchema } from '@redmars/shared'
import { apiGet } from '@/lib/api'

/**
 * The pharmacy queue (task 6.8) — the doctor's active orders, oldest first. Kept fresh
 * (staleTime 0) and polled, so a prescription written in a consult shows at the bench
 * without a manual reload, and a dispensed one drops off.
 */
export function usePharmacyQueue() {
  return useQuery({
    queryKey: ['pharmacy', 'queue'],
    queryFn: () => apiGet('/pharmacy/queue', pharmacyQueueResponseSchema),
    staleTime: 0,
    refetchInterval: 30_000,
  })
}
