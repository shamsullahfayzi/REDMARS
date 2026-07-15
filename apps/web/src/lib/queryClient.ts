import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'

/**
 * Defaults are deliberately conservative for a clinical app.
 *
 * staleTime 0: never show a doctor a cached value without checking it is still
 * current. The queue (3.8) and lab results (5.10) are the whole point of this
 * app being live rather than a paper form — stale-by-default would quietly
 * reintroduce the problem we are replacing.
 *
 * retry: do not hammer a server that told us "no". A 4xx is an answer, not a
 * blip — retrying a 403 just writes more audit rows for the same denial.
 * Network failures and 5xx get a couple of attempts, because on a hospital LAN
 * a dropped packet is far more likely than a real outage.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false
        }
        return failureCount < 2
      },
    },
    mutations: {
      // Never silently retry a write. Re-sending "dispense" or "take payment"
      // because a response was slow is how a patient gets billed twice.
      retry: false,
    },
  },
})
