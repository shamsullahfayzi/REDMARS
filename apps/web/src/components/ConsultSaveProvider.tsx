import { useCallback, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  ConsultSaveContext,
  type ConsultSaver,
  type SaveOutcome,
} from '@/hooks/useConsultSave'

/**
 * Task 4.2 — the registry the consult screen's keys read from.
 *
 * Holds the savers each tab registers and knows how to run the dirty ones. The contract
 * and the hooks are in hooks/useConsultSave; this is only the state behind them.
 */
export function ConsultSaveProvider({ children }: { children: ReactNode }) {
  // A ref, not state: registering a saver must not re-render the screen a doctor is
  // typing into, and the keys read this at the moment they are pressed anyway.
  const savers = useRef(new Map<string, RefObject<ConsultSaver>>())
  const [dirty, setDirtyState] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)

  const register = useCallback((key: string, saver: RefObject<ConsultSaver>) => {
    savers.current.set(key, saver)
    return () => {
      savers.current.delete(key)
      // A section that unmounted is no longer unsaved — leaving it in would warn about
      // work that is not on screen and cannot be saved from here.
      setDirtyState((previous) => {
        if (!(key in previous)) return previous
        const next = { ...previous }
        delete next[key]
        return next
      })
    }
  }, [])

  const setDirty = useCallback((key: string, value: boolean) => {
    setDirtyState((previous) => (previous[key] === value ? previous : { ...previous, [key]: value }))
  }, [])

  const saveAll = useCallback(async (): Promise<SaveOutcome> => {
    const outcome: SaveOutcome = { saved: [], failed: [] }
    setSaving(true)
    try {
      // Sequentially, in registration order. Not Promise.all: when three sections save at
      // once and one fails, which one is a question the doctor has to be able to answer,
      // and a predictable order is what makes the answer readable.
      for (const [key, saver] of savers.current) {
        if (!saver.current.isDirty) continue
        try {
          await saver.current.save()
          outcome.saved.push(key)
        } catch {
          // Carry on rather than abort. A doctor should not lose a prescription because
          // the vitals endpoint blipped; both results are reported and the caller decides.
          outcome.failed.push(key)
        }
      }
    } finally {
      setSaving(false)
    }
    return outcome
  }, [])

  const dirtyKeys = useMemo(
    () =>
      Object.entries(dirty)
        .filter(([, isDirty]) => isDirty)
        .map(([key]) => key),
    [dirty],
  )

  const value = useMemo(
    () => ({ register, setDirty, dirtyKeys, saving, saveAll }),
    [register, setDirty, dirtyKeys, saving, saveAll],
  )

  return <ConsultSaveContext.Provider value={value}>{children}</ConsultSaveContext.Provider>
}
