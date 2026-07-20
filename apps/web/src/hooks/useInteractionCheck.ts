import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  interactionCheckResponseSchema,
  MIN_INTERACTION_DRUGS,
} from '@redmars/shared'
import { apiGet } from '@/lib/api'

/**
 * Check the seeded interactions among a set of drugs. Fires only once at least two
 * drugs are selected (fewer cannot form a pair and the server would 400), and keeps
 * the previous warnings on screen while the next set loads so the list does not
 * flicker as drugs are added or removed. Server-side interaction.check.
 *
 * The ids are sorted into the query key so selecting the same drugs in a different
 * order reuses one cache entry rather than refetching.
 */
export function useInteractionCheck(drugIds: string[]) {
  const ids = [...new Set(drugIds)].sort()
  const enabled = ids.length >= MIN_INTERACTION_DRUGS
  return useQuery({
    queryKey: ['drug-interactions', ids],
    queryFn: () =>
      apiGet(
        `/drug-interactions/check?drugIds=${encodeURIComponent(ids.join(','))}`,
        interactionCheckResponseSchema,
      ),
    enabled,
    placeholderData: keepPreviousData,
  })
}
