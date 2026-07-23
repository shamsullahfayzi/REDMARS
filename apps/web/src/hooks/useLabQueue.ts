import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  collectSampleResponseSchema,
  labQueueResponseSchema,
  saveLabResultResponseSchema,
  type LabQueueQuery,
} from '@redmars/shared'
import { apiGet, apiPost, apiPut } from '@/lib/api'

/** A bare number (Decimal(12,4) shape) is entered as a numeric result; anything else is text. */
const NUMERIC = /^\d{1,8}(\.\d{1,4})?$/

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

/**
 * Collecting the sample — moves an order's ordered-and-paid tests to sample_collected. The
 * server is the authority on which are eligible (paid, still ordered); the button sends the
 * ids it believes are ready and the queue refetches, so a refusal or a race just re-reads
 * the truth rather than trusting the click.
 */
export function useCollectSample() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (itemIds: string[]) =>
      apiPost('/lab-queue/collect', { itemIds }, collectSampleResponseSchema),
    onSuccess: () => client.invalidateQueries({ queryKey: ['lab-queue'] }),
  })
}

/**
 * Entering a result. One field on the screen — the technician types "90" or "Negative" and
 * the client decides which contract field it is; the server flags it against the normal band
 * and the queue refetches with the value and its H/L.
 */
export function useSaveLabResult() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, value }: { itemId: string; value: string }) => {
      const trimmed = value.trim()
      const body = NUMERIC.test(trimmed) ? { valueNumeric: trimmed } : { valueText: trimmed }
      return apiPut(`/lab-queue/items/${itemId}/result`, body, saveLabResultResponseSchema)
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['lab-queue'] }),
  })
}
