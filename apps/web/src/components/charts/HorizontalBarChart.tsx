import { useEffect, useState } from 'react'
import { chartFill } from './chartColors'

export interface HorizontalBarDatum {
  label: string
  value: number
  /** Pre-formatted for display — the chart never reformats a number the table already agreed on. */
  displayValue: string
}

/**
 * A ranked list as bars — wait times by department, top diagnoses. Reads correctly under
 * RTL for free: it is built from `flex` and logical spacing, so the label sits at the
 * inline start and the bar grows toward the inline end in whichever direction that is.
 *
 * Native `<title>` per bar is the tooltip — no JS positioning, works with a keyboard and a
 * screen reader for free. The table below every chart in this app is still the record of
 * truth; this is only a faster way to see which bar is tallest.
 */
export function HorizontalBarChart({
  data,
  ariaLabel,
}: {
  data: HorizontalBarDatum[]
  ariaLabel: string
}) {
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const max = Math.max(1, ...data.map((d) => d.value))

  return (
    <div className="space-y-2" role="img" aria-label={ariaLabel}>
      {data.map((d, i) => (
        <div key={d.label} className="flex items-center gap-3" aria-hidden="true">
          <span className="w-28 shrink-0 truncate text-xs text-muted-foreground" title={d.label}>
            {d.label}
          </span>
          <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${chartFill(i)} motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out`}
              style={{ width: grown ? `${Math.max(2, (d.value / max) * 100)}%` : '0%' }}
            >
              <title>{`${d.label}: ${d.displayValue}`}</title>
            </div>
          </div>
          <span className="w-16 shrink-0 text-end font-mono text-xs text-foreground" dir="ltr">
            {d.displayValue}
          </span>
        </div>
      ))}
    </div>
  )
}
