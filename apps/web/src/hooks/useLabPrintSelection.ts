import { createContext, useContext } from 'react'

/**
 * Which of the CURRENT visit's verified lab results go on the printed report.
 *
 * Shared between two siblings that do not otherwise talk to each other: the Labs tab, where
 * the doctor ticks a result off, and `LabResultSheet`, the hidden print-only sheet that has
 * to filter the same way at print time. A context rather than a prop drilled through
 * `LabsTab`'s own large prop chain — the two consumers are cousins under `ConsultPage`, not
 * parent and child. The provider itself lives in `LabPrintSelectionProvider.tsx`, split out
 * the same way `authContext.ts` and `AuthProvider.tsx` are: a file that exports a component
 * cannot also export a hook without losing fast refresh.
 *
 * Tracked as EXCLUSIONS, not inclusions: a doctor who orders three tests and never opens this
 * control gets all three on the paper, which is the common case and the safe default. Nothing
 * has to be reconciled against the list of items that exist yet — an id excluded before its
 * result ever loads is still excluded once it does.
 */
export interface LabPrintSelectionValue {
  isExcluded: (itemId: string) => boolean
  toggle: (itemId: string) => void
}

export const LabPrintSelectionContext = createContext<LabPrintSelectionValue | null>(null)

export function useLabPrintSelection(): LabPrintSelectionValue {
  const ctx = useContext(LabPrintSelectionContext)
  if (!ctx) {
    throw new Error('useLabPrintSelection must be used within <LabPrintSelectionProvider>')
  }
  return ctx
}
