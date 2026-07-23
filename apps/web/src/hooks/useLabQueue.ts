import { useQuery } from '@tanstack/react-query'
import { labQueueResponseSchema, type LabQueueQuery } from '@redmars/shared'
import { apiGet } from '@/lib/api'

/**
 * How often the lab worklist re-reads itself. Ten seconds, matching the visit queue — the
 * thing being watched is a patient paying at the desk and walking to the bench, and five
 * seconds buys no useful freshness for twice the requests on Farhat's network.
 */
export const LAB_QUEUE_POLL_MS = 10_000

/**
 * Phase 5 — the bench's worklist. A poll, like the visit queue, and the same failing
 * concern: react-query keeps the last good data when a refetch errors, so the page reads
 * `isError` alongside `dataUpdatedAt` to say when a live screen has quietly frozen.
 */
export function useLabQueue(filters: Partial<LabQueueQuery>, options: { poll?: boolean } = {}) {
  const params = new URLSearchParams()
  if (filters.date) params.set('date', filters.date)
  if (filters.status) params.set('status', filters.status)
  const query = params.toString()

  return useQuery({
    queryKey: ['lab-queue', query],
    queryFn: () => apiGet(`/lab-queue${query ? `?${query}` : ''}`, labQueueResponseSchema),
    // Wait times age between reads — a stale worklist is a misleading one.
    staleTime: 0,
    refetchInterval: options.poll === false ? false : LAB_QUEUE_POLL_MS,
  })
}
