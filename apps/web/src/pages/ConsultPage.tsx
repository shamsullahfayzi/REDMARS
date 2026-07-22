import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import {
  Activity,
  ArrowLeft,
  ClipboardList,
  Clock,
  FileText,
  History,
  Lock,
  MessageSquare,
  Pill,
  Play,
} from 'lucide-react'
import { isVisitOpen, type ConsultContext } from '@redmars/shared'
import { ConsultActions } from '@/components/ConsultActions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useConsultContext } from '@/hooks/useConsult'
import { ConsultSaveProvider } from '@/components/ConsultSaveProvider'
import { useChangeVisitStatus } from '@/hooks/useVisitStatus'
import { cn } from '@/lib/utils'

/**
 * Task 4.1 — the consulting room, as a screen.
 *
 * This is the shell the rest of Phase 4 fills: a header that says who is in front of the
 * doctor, and a tab strip for the work. It holds no clinical fields yet — vitals (4.3),
 * complaint (4.4), diagnosis (4.5), prescription (4.7), notes (4.13) and history (4.14)
 * each arrive with their own contract and their own permission.
 *
 * OPENING THIS SCREEN DOES NOT START THE CONSULTATION. It is tempting to move the visit
 * to `in_progress` on arrival here and save the doctor a click, and it is wrong: a doctor
 * opens the next patient to see what is coming, opens the wrong row, and opens a finished
 * visit to check what was prescribed last time. Any of those would file "called in at
 * 09:14" for a patient still in the corridor — and the wait it corrupts is the number the
 * queue is sorted by and the number an operational report is built from. So the move is a
 * button, and it is the loudest thing in the header.
 *
 * KEYBOARD-FIRST is half of this task. Task 4.2 owns the save keys (F2/F4/F9/Esc); this
 * owns getting around: a real ARIA tablist with roving tabindex, arrows and Home/End
 * inside it, and Alt+1…6 to jump straight to a tab from anywhere on the page — including
 * from inside a text field, which is where a doctor's hands actually are.
 */

const TABS = [
  { key: 'vitals', icon: Activity },
  { key: 'complaint', icon: MessageSquare },
  { key: 'diagnosis', icon: ClipboardList },
  { key: 'prescription', icon: Pill },
  { key: 'notes', icon: FileText },
  { key: 'history', icon: History },
] as const

type TabKey = (typeof TABS)[number]['key']

export function ConsultPage() {
  const { t } = useTranslation()
  const { visitId } = useParams<{ visitId: string }>()
  const contextQuery = useConsultContext(visitId)
  const [tab, setTab] = useState<TabKey>('vitals')

  const context = contextQuery.data

  if (contextQuery.isPending) {
    return <p className="text-sm text-muted-foreground">{t('consult.loading')}</p>
  }

  if (contextQuery.isError || !context) {
    return (
      <div className="space-y-4">
        <BackToQueue />
        <Card className="p-8 text-center">
          <p className="text-sm text-destructive">{t('consult.error')}</p>
        </Card>
      </div>
    )
  }

  return (
    // The provider wraps the tabs AND the key bar, because the keys save what the tabs
    // register (task 4.2) and neither half means anything without the other.
    <ConsultSaveProvider>
      <div className="space-y-4">
        <BackToQueue />
        <PatientBanner context={context} />
        <ConsultTabs active={tab} onChange={setTab} />
        <ConsultActions visit={context.visit} />
      </div>
    </ConsultSaveProvider>
  )
}

function BackToQueue() {
  const { t } = useTranslation()
  return (
    <Link
      to="/queue"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      {/* Mirrors with the page under dir="rtl" — back is not always leftwards. */}
      <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
      {t('consult.backToQueue')}
    </Link>
  )
}

/**
 * Who is in front of the doctor, in one block that never scrolls out of the way.
 *
 * Name first and largest, because the single most consequential mistake this screen can
 * enable is prescribing to the wrong record — so the identity is the thing the eye lands
 * on, and the MRN sits beside it as the thing that is actually unique.
 */
function PatientBanner({ context }: { context: ConsultContext }) {
  const { t } = useTranslation()
  const { patient, visit, waitedMinutes } = context
  const open = isVisitOpen(visit.status)

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl font-bold text-foreground">{patient.name}</h1>
            <span dir="ltr" className="font-mono text-sm text-muted-foreground">
              {patient.mrn}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(`patients.gender.${patient.gender}`)}
            {patient.ageYears != null &&
              ` · ${t('patients.search.years', { count: patient.ageYears })}`}
            {patient.phone && (
              <>
                {' · '}
                <span dir="ltr">{patient.phone}</span>
              </>
            )}
          </p>
        </div>

        <StartConsultation visit={visit} />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <Badge variant={visit.status === 'in_progress' ? 'info' : open ? 'active' : 'muted'}>
          {t(`visits.status.${visit.status}`)}
        </Badge>
        <span>
          {visit.departmentName}
          {visit.practitionerName ? ` · ${visit.practitionerName}` : ''}
        </span>
        <span dir="ltr" className="font-mono text-xs">
          {visit.visitNo}
        </span>
        {waitedMinutes != null && (
          <span className="flex items-center gap-1.5 tabular-nums">
            <Clock className="size-4" aria-hidden />
            {t('queue.waited', { minutes: waitedMinutes })}
          </span>
        )}
      </div>

      {/* The complaint in the patient's own words, as the desk typed it (task 3.5). It
          is what the consultation opens on, so it is not tucked into a tab. */}
      {visit.chiefComplaint && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-foreground">
          {visit.chiefComplaint}
        </p>
      )}

      {/* A closed visit is a record of what happened. Saying so here means the tabs
          below do not have to each explain why they will refuse. */}
      {!open && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0" aria-hidden />
          {t('consult.closed')}
        </p>
      )}
    </Card>
  )
}

/**
 * The one move this screen makes to the visit: calling the patient in.
 *
 * Offered only from `arrived`, which is the only status it is true from. Everything else
 * — holding, completing, cancelling — belongs to the queue (tasks 3.9 and 3.11), and task
 * 4.2 puts finishing on a key rather than a button.
 */
function StartConsultation({ visit }: { visit: ConsultContext['visit'] }) {
  const { t } = useTranslation()
  const change = useChangeVisitStatus(visit.id)
  const button = useRef<HTMLButtonElement>(null)

  // Focus lands here on open, so a doctor who reached this screen from the keyboard can
  // start the consultation without hunting for anything.
  useEffect(() => {
    button.current?.focus()
  }, [])

  if (visit.status !== 'arrived') return null

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        ref={button}
        type="button"
        disabled={change.isPending}
        onClick={() => change.mutate({ status: 'in_progress', note: null })}
      >
        <Play className="size-4" aria-hidden />
        {change.isPending ? t('consult.starting') : t('consult.start')}
      </Button>
      {change.isError && <p className="text-xs text-destructive">{t('queue.action.failed')}</p>}
    </div>
  )
}

/**
 * The tab strip, built to the ARIA tabs pattern rather than as a row of buttons.
 *
 * Roving tabindex: exactly one tab is in the tab order, and the arrows move between them.
 * That is the difference between a doctor pressing Tab once to reach the strip and
 * pressing it six times to get past it — on a screen used forty times a day.
 *
 * Arrow direction follows the page. Under dir="rtl" the strip runs right to left, so
 * ArrowRight has to mean "previous" or the keys fight the layout.
 */
function ConsultTabs({ active, onChange }: { active: TabKey; onChange: (tab: TabKey) => void }) {
  const { t, i18n } = useTranslation()
  const strip = useRef<HTMLDivElement>(null)
  const rtl = i18n.dir() === 'rtl'

  function focusTab(key: TabKey) {
    onChange(key)
    strip.current?.querySelector<HTMLButtonElement>(`#consult-tab-${key}`)?.focus()
  }

  function move(by: number) {
    const index = TABS.findIndex((entry) => entry.key === active)
    // Wraps, per the ARIA pattern: the end of the strip is not a wall to bump into.
    const next = (index + by + TABS.length) % TABS.length
    focusTab(TABS[next].key)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
    const back = rtl ? 'ArrowRight' : 'ArrowLeft'

    if (event.key === forward) move(1)
    else if (event.key === back) move(-1)
    else if (event.key === 'Home') focusTab(TABS[0].key)
    else if (event.key === 'End') focusTab(TABS[TABS.length - 1].key)
    else return

    event.preventDefault()
  }

  // Alt+1…6, listened for on the window rather than on the strip: a doctor's hands are
  // in a text field, not on the tabs, and a shortcut that only works once you have
  // already navigated to the thing it navigates to is not a shortcut.
  useEffect(() => {
    function onWindowKey(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey) return
      const index = Number(event.key) - 1
      if (!Number.isInteger(index) || index < 0 || index >= TABS.length) return
      event.preventDefault()
      onChange(TABS[index].key)
      document.getElementById(`consult-tab-${TABS[index].key}`)?.focus()
    }
    window.addEventListener('keydown', onWindowKey)
    return () => window.removeEventListener('keydown', onWindowKey)
  }, [onChange])

  return (
    <div className="space-y-3">
      <div
        ref={strip}
        role="tablist"
        aria-label={t('consult.tablist')}
        onKeyDown={onKeyDown}
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {TABS.map(({ key, icon: Icon }, index) => (
          <button
            key={key}
            id={`consult-tab-${key}`}
            role="tab"
            type="button"
            aria-selected={active === key}
            aria-controls={`consult-panel-${key}`}
            // Roving: only the active tab is reachable by Tab.
            tabIndex={active === key ? 0 : -1}
            onClick={() => onChange(key)}
            className={cn(
              'flex items-center gap-2 rounded-t-lg px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              active === key
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {t(`consult.tabs.${key}`)}
            {/* The shortcut, written where it is learned. Hidden from screen readers,
                which announce position in the strip anyway. */}
            <span className="text-xs text-muted-foreground/70" aria-hidden dir="ltr">
              {index + 1}
            </span>
          </button>
        ))}
      </div>

      {TABS.map(({ key }) => (
        <div
          key={key}
          id={`consult-panel-${key}`}
          role="tabpanel"
          aria-labelledby={`consult-tab-${key}`}
          hidden={active !== key}
          tabIndex={0}
        >
          {active === key && (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">
                {t('consult.notBuilt', { section: t(`consult.tabs.${key}`) })}
              </p>
            </Card>
          )}
        </div>
      ))}

      <p className="text-xs text-muted-foreground">{t('consult.hint.tabs')}</p>
    </div>
  )
}
