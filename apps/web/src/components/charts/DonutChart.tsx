import { useEffect, useState } from 'react'
import { chartDot, chartStroke } from './chartColors'

export interface DonutSlice {
  label: string
  value: number
  displayValue: string
}

const SIZE = 120
const STROKE = 16
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * A breakdown into a handful of known buckets (till origin, payment method) — the shape a
 * donut earns its keep on. Never used for the diagnosis list or a day series: those run
 * past the ~5 slices a donut stays readable at, and get a bar chart instead. Built as ONE
 * circle with several stroke segments rather than a pie of paths — simpler geometry, and
 * the same trick gives the centre hole its label for free.
 */
export function DonutChart({
  slices,
  total,
  totalLabel,
  ariaLabel,
}: {
  slices: DonutSlice[]
  total: string
  totalLabel: string
  ariaLabel: string
}) {
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const sum = Math.max(
    1,
    slices.reduce((s, sl) => s + sl.value, 0),
  )
  let offset = 0

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" role="img" aria-label={ariaLabel}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-muted"
          />
          {slices.map((slice, i) => {
            const fraction = slice.value / sum
            const length = grown ? fraction * CIRCUMFERENCE : 0
            const dash = `${length} ${CIRCUMFERENCE - length}`
            const el = (
              <circle
                key={slice.label}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                strokeWidth={STROKE}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                className={`${chartStroke(i)} motion-safe:transition-[stroke-dasharray] motion-safe:duration-700 motion-safe:ease-out`}
                strokeLinecap="butt"
              >
                <title>{`${slice.label}: ${slice.displayValue}`}</title>
              </circle>
            )
            offset += fraction * CIRCUMFERENCE
            return el
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-sm font-semibold text-foreground" dir="ltr">
            {total}
          </span>
          <span className="text-[9px] text-muted-foreground">{totalLabel}</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {slices.map((slice, i) => (
          <li key={slice.label} className="flex items-center gap-2 text-sm">
            <span className={`size-2.5 shrink-0 rounded-full ${chartDot(i)}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-foreground">{slice.label}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground" dir="ltr">
              {slice.displayValue}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
