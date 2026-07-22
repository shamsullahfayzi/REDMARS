import { createContext, useContext, useEffect, useRef, type RefObject } from 'react'

/**
 * Task 4.2 — what the consult screen's keys actually save.
 *
 * F2, F4 and F9 all begin with "save", and the consult screen has no fields of its own:
 * vitals (4.3), complaint (4.4), diagnosis (4.5), prescription (4.7) and notes (4.13)
 * each own theirs. So the keys cannot reach in and save anything directly — every tab
 * REGISTERS how to save itself, and the keys ask the ones that are dirty.
 *
 * That is the whole registry. It exists now, with no tabs in it yet, because a hotkey
 * layer with nothing to talk to is not implementable — not because a fifth abstraction
 * seemed nice.
 *
 * The provider lives next door in components/ConsultSaveProvider so this file exports no
 * component and stays hot-reloadable.
 */

export interface ConsultSaver {
  /** Has this section been changed since it was last saved? A clean one is skipped. */
  isDirty: boolean
  /**
   * Persist it. Must REJECT on failure — a save that swallows its own error would let F9
   * close a visit whose clinical note never reached the database.
   */
  save: () => Promise<void>
}

/** Which sections were written and which refused, by tab key. */
export interface SaveOutcome {
  saved: string[]
  failed: string[]
}

export interface ConsultSaveApi {
  register: (key: string, saver: RefObject<ConsultSaver>) => () => void
  setDirty: (key: string, dirty: boolean) => void
  /** Sections with unsaved changes, for the warning before anyone walks away. */
  dirtyKeys: string[]
  saving: boolean
  saveAll: () => Promise<SaveOutcome>
}

export const ConsultSaveContext = createContext<ConsultSaveApi | null>(null)

export function useConsultSave(): ConsultSaveApi {
  const api = useContext(ConsultSaveContext)
  if (!api) throw new Error('useConsultSave must be used inside a ConsultSaveProvider')
  return api
}

/**
 * How a tab joins the keys. `key` is the tab's own key, so a failure can be reported as
 * "Prescription" rather than as an index.
 *
 * The saver is held in a ref that is refreshed every render, so the keys always call the
 * CURRENT save with the CURRENT values — a closure captured at registration would save
 * whatever the form held when the tab mounted, which is nothing.
 */
export function useConsultSaver(key: string, saver: ConsultSaver): void {
  const { register, setDirty } = useConsultSave()
  const latest = useRef(saver)
  latest.current = saver

  useEffect(() => register(key, latest), [key, register])
  useEffect(() => setDirty(key, saver.isDirty), [key, saver.isDirty, setDirty])
}
