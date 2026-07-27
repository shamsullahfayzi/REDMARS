import { useMemo, useState, type ReactNode } from 'react'
import {
  LabPrintSelectionContext,
  type LabPrintSelectionValue,
} from '@/hooks/useLabPrintSelection'

/**
 * See `useLabPrintSelection.ts` for what this tracks and why. Split into its own file for
 * the same reason `AuthProvider.tsx` is separate from `authContext.ts` — a file exporting a
 * component cannot also export a hook without losing fast refresh.
 */
export function LabPrintSelectionProvider({ children }: { children: ReactNode }) {
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set())

  const value = useMemo<LabPrintSelectionValue>(
    () => ({
      isExcluded: (itemId) => excluded.has(itemId),
      toggle: (itemId) =>
        setExcluded((current) => {
          const next = new Set(current)
          if (next.has(itemId)) next.delete(itemId)
          else next.add(itemId)
          return next
        }),
    }),
    [excluded],
  )

  return (
    <LabPrintSelectionContext.Provider value={value}>{children}</LabPrintSelectionContext.Provider>
  )
}
