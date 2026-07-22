import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { CheckCircle2, LogOut, Printer, Save, TriangleAlert } from 'lucide-react'
import { VISIT_STATUS_TRANSITIONS, isVisitOpen, type VisitSummary } from '@redmars/shared'
import { Button } from '@/components/ui/button'
import { useConsultSave } from '@/hooks/useConsultSave'
import { useChangeVisitStatus } from '@/hooks/useVisitStatus'
import { cn } from '@/lib/utils'

/**
 * Task 4.2 — the four keys, so the doctor never touches the mouse.
 *
 *   F2  save and stay on this patient
 *   F4  save and print
 *   F9  save, finish the visit, back to the queue
 *   Esc leave — and say so first, if anything is unsaved
 *
 * Bound on the WINDOW, not on a form, because a doctor's hands are inside a text field
 * and a hotkey that only fires when the page background has focus is a hotkey nobody
 * ever reaches. Unbound when this screen unmounts, so F9 does not quietly finish a visit
 * from the queue.
 *
 * TWO RULES THE WHOLE THING TURNS ON:
 *
 *  1. A FAILED SAVE STOPS EVERYTHING AFTER IT. F4 does not print and F9 does not finish
 *     the visit unless every dirty section was written. Paper that disagrees with the
 *     database is worse than no paper, and a visit closed over a note that never saved is
 *     a record with a hole in it that nobody will notice until it matters.
 *  2. NOTHING IS DISCARDED SILENTLY. Esc with unsaved work asks. So does closing the tab.
 *     A doctor pressing Esc out of reflex must not lose a psychiatric assessment.
 *
 * Modifiers are refused wholesale: Alt+F4 belongs to the window manager, Ctrl+F4 closes a
 * tab, and Alt+1…6 is task 4.1's jump between sections. Claiming any of those would be
 * taking a key the machine already owns.
 */

type Tone = 'ok' | 'warn'

export function ConsultActions({ visit }: { visit: VisitSummary }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { dirtyKeys, saving, saveAll } = useConsultSave()
  const finish = useChangeVisitStatus(visit.id)

  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)

  // Named, never numbered: "could not save Prescription" is actionable, "section 4" is
  // not. The separator is translated because Persian and Pashto do not use a comma.
  const sectionNames = useCallback(
    (keys: string[]) => keys.map((key) => t(`consult.tabs.${key}`)).join(t('consult.separator')),
    [t],
  )

  const busy = saving || finish.isPending

  /** Save every dirty section. Returns false if any refused, having said which. */
  const save = useCallback(async (): Promise<boolean> => {
    const outcome = await saveAll()
    if (outcome.failed.length > 0) {
      setMessage({
        tone: 'warn',
        text: t('consult.hotkeys.saveFailed', { sections: sectionNames(outcome.failed) }),
      })
      return false
    }
    // Named rather than counted. On a tabbed screen the doctor cannot see what saved, and
    // "Saved Vitals, Prescription" says it without depending on plural rules holding up in
    // Dari and Pashto.
    setMessage({
      tone: 'ok',
      text:
        outcome.saved.length === 0
          ? t('consult.hotkeys.nothingToSave')
          : t('consult.hotkeys.saved', { sections: sectionNames(outcome.saved) }),
    })
    return true
  }, [saveAll, sectionNames, t])

  const saveAndPrint = useCallback(async () => {
    if (!(await save())) return
    // Task 4.10 replaces this with the prescription sheet. Until then it prints what is
    // on screen, which is the header — honest, and already styled for paper by 3.6.
    window.print()
  }, [save])

  const saveAndFinish = useCallback(async () => {
    if (!(await save())) return

    if (isVisitOpen(visit.status)) {
      // The same shared transition map the queue's buttons are built from (task 3.9), so
      // this key cannot ask for a move the server will refuse. An `arrived` visit cannot
      // become `completed`: the patient was never called in, and auto-starting it here to
      // make the key work would file a consultation that took zero minutes.
      if (!VISIT_STATUS_TRANSITIONS[visit.status].includes('completed')) {
        setMessage({ tone: 'warn', text: t('consult.hotkeys.startFirst') })
        return
      }
      try {
        await finish.mutateAsync({ status: 'completed', note: null })
      } catch {
        setMessage({ tone: 'warn', text: t('consult.hotkeys.finishFailed') })
        return
      }
    }

    void navigate('/queue')
  }, [save, visit.status, finish, navigate, t])

  const leave = useCallback(() => {
    if (dirtyKeys.length > 0) {
      setConfirmLeave(true)
      return
    }
    void navigate('/queue')
  }, [dirtyKeys.length, navigate])

  // The handlers change every render; the listener must not. A ref keeps the binding
  // stable so the keys are registered once for the life of the screen.
  const latest = useRef({ save, saveAndPrint, saveAndFinish, leave, busy, confirmLeave })
  latest.current = { save, saveAndPrint, saveAndFinish, leave, busy, confirmLeave }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // A held key is one press, not forty saves.
      if (event.repeat) return
      if (event.altKey || event.ctrlKey || event.metaKey) return

      const current = latest.current
      if (event.key === 'Escape') {
        event.preventDefault()
        // Esc backs out of the warning too — the reversible direction, always.
        if (current.confirmLeave) setConfirmLeave(false)
        else current.leave()
        return
      }

      if (event.key !== 'F2' && event.key !== 'F4' && event.key !== 'F9') return
      event.preventDefault()
      // A second press while the first is still in flight is a double save, and at 4.7
      // a double prescription.
      if (current.busy) return

      if (event.key === 'F2') void current.save()
      else if (event.key === 'F4') void current.saveAndPrint()
      else void current.saveAndFinish()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The browser's own warning, for the case the keys cannot cover: a closed tab, a
  // reload, a shared workstation someone else walks up to.
  useEffect(() => {
    if (dirtyKeys.length === 0) return
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirtyKeys.length])

  return (
    <div className="space-y-3 print:hidden">
      {confirmLeave && (
        <div
          role="alertdialog"
          aria-label={t('consult.unsaved.title', { sections: sectionNames(dirtyKeys) })}
          className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/50 bg-warning/10 p-3"
        >
          <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
          <p className="flex-1 text-sm text-foreground">
            {t('consult.unsaved.title', { sections: sectionNames(dirtyKeys) })}
          </p>
          {/* Saving is the safe default and what a doctor almost always means, so it is
              what focus lands on. Discarding is deliberately the harder of the two. */}
          <Button
            type="button"
            size="sm"
            autoFocus
            disabled={busy}
            onClick={() => {
              void save().then((ok) => {
                if (ok) void navigate('/queue')
              })
            }}
          >
            {t('consult.unsaved.saveLeave')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void navigate('/queue')}
          >
            {t('consult.unsaved.discard')}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmLeave(false)}>
            {t('consult.unsaved.stay')}
          </Button>
        </div>
      )}

      {/*
        Announced as well as shown. A key pressed with no visible result is how a doctor
        presses it a second time, and the whole point of this task is that they are not
        looking at a mouse pointer to find out what happened.
      */}
      <p
        role="status"
        aria-live="polite"
        className={cn(
          'min-h-5 text-sm',
          message?.tone === 'warn' ? 'text-destructive' : 'text-success',
        )}
      >
        {busy ? t('consult.hotkeys.saving') : (message?.text ?? '')}
      </p>

      {/* The legend. A hotkey nobody has been told about is not a hotkey — and the same
          handlers sit behind the buttons, because a receptionist reviewing a visit has a
          mouse and there should not be two code paths to keep in step. */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-border bg-background/95 py-2 backdrop-blur">
        <KeyAction hint="F2" label={t('consult.hotkeys.saveContinue')} icon={Save} onRun={save} disabled={busy} />
        <KeyAction
          hint="F4"
          label={t('consult.hotkeys.savePrint')}
          icon={Printer}
          onRun={saveAndPrint}
          disabled={busy}
        />
        <KeyAction
          hint="F9"
          label={t('consult.hotkeys.saveFinish')}
          icon={CheckCircle2}
          onRun={saveAndFinish}
          disabled={busy}
        />
        <KeyAction hint="Esc" label={t('consult.hotkeys.leave')} icon={LogOut} onRun={leave} />
      </div>
    </div>
  )
}

function KeyAction({
  hint,
  label,
  icon: Icon,
  onRun,
  disabled = false,
}: {
  hint: string
  label: string
  icon: typeof Save
  onRun: () => void | Promise<unknown>
  disabled?: boolean
}) {
  return (
    <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void onRun()}>
      <Icon className="size-4" aria-hidden />
      {label}
      <kbd
        dir="ltr"
        className="ms-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
      >
        {hint}
      </kbd>
    </Button>
  )
}
