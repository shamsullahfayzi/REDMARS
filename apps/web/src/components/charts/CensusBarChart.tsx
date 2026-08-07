import { useEffect, useState } from 'react'

export interface CensusDay {
  /** Short axis label — day-of-month reads fine across a week; the table has the full date. */
  axisLabel: string
  fullLabel: string
  completed: number
  cancelled: number
  other: number
  total: number
}

/**
 * One bar per day, split by what actually happened to the visit — not a decorative
 * categorical colour per day, but the SAME status colours the rest of the app already
 * uses (success/destructive/muted): a completed visit, a cancelled one, and everything
 * still open. No-shows are a different denominator (appointments, not visits) and would
 * mislead stacked into this bar, so they stay in the summary line and the table only.
 */
export function CensusBarChart({ days, ariaLabel }: { days: CensusDay[]; ariaLabel: string }) {
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const max = Math.max(1, ...days.map((d) => d.total))

  return (
    <div className="space-y-2">
      <div className="flex h-40 items-end gap-1.5" role="img" aria-label={ariaLabel}>
        {days.map((d) => (
          <div key={d.fullLabel} className="flex h-full min-w-0 flex-1 flex-col justify-end" aria-hidden="true">
            <div
              className="flex w-full flex-col-reverse overflow-hidden rounded-t-sm motion-safe:transition-[height] motion-safe:duration-700 motion-safe:ease-out"
              style={{ height: grown ? `${(d.total / max) * 100}%` : '0%' }}
            >
              {d.completed > 0 && (
                <div className="w-full bg-success" style={{ flexGrow: d.completed }}>
                  <title>{`${d.fullLabel} — ${d.completed} completed`}</title>
                </div>
              )}
              {d.cancelled > 0 && (
                <div className="w-full bg-destructive" style={{ flexGrow: d.cancelled }}>
                  <title>{`${d.fullLabel} — ${d.cancelled} cancelled`}</title>
                </div>
              )}
              {d.other > 0 && (
                <div className="w-full bg-muted-foreground/30" style={{ flexGrow: d.other }}>
                  <title>{`${d.fullLabel} — ${d.other} open`}</title>
                </div>
              )}
              {d.total === 0 && <div className="h-px w-full bg-border" />}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5" aria-hidden="true">
        {days.map((d) => (
          <span key={d.fullLabel} className="min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground" dir="ltr">
            {d.axisLabel}
          </span>
        ))}
      </div>
    </div>
  )
}
