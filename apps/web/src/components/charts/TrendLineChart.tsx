import { useEffect, useState } from 'react'

export interface TrendPoint {
  label: string
  value: number
  displayValue: string
  /** Renders this point's dot in the destructive color instead of the series color. */
  abnormal?: boolean
}

const WIDTH = 300
const HEIGHT = 100
const PAD_Y = 8

/**
 * Money over a range reads as a trend, not a composition — a line, not bars. One series
 * (this report has one till total per day), so one colour: `--chart-1`, the same teal the
 * app's identity already runs on, filled underneath at low opacity rather than five hues
 * fighting for one line. Draws itself in on mount (a single, one-time reveal — not a
 * per-point gimmick) and skips that entirely under `prefers-reduced-motion`.
 */
export function TrendLineChart({ points, ariaLabel }: { points: TrendPoint[]; ariaLabel: string }) {
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  if (points.length === 0) return null

  const values = points.map((p) => p.value)
  const min = Math.min(0, ...values)
  const max = Math.max(1, ...values)
  const span = max - min || 1

  const xAt = (i: number) => (points.length === 1 ? WIDTH / 2 : (i / (points.length - 1)) * WIDTH)
  const yAt = (v: number) => HEIGHT - PAD_Y - ((v - min) / span) * (HEIGHT - PAD_Y * 2)

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.value)}`).join(' ')
  const areaPath = `${linePath} L ${xAt(points.length - 1)} ${HEIGHT} L ${xAt(0)} ${HEIGHT} Z`

  return (
    <div role="img" aria-label={ariaLabel}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-40 w-full overflow-visible"
        aria-hidden="true"
      >
        <path d={areaPath} className="fill-chart-1/12" />
        <path
          d={linePath}
          className="fill-none stroke-chart-1 motion-safe:transition-[stroke-dashoffset] motion-safe:duration-[900ms] motion-safe:ease-out"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={drawn ? 0 : 1}
        />
        {points.map((p, i) => (
          <circle
            key={p.label}
            cx={xAt(i)}
            cy={yAt(p.value)}
            r={p.abnormal ? 3 : 2.2}
            className={p.abnormal ? 'fill-destructive' : 'fill-chart-1'}
          >
            <title>{`${p.label}: ${p.displayValue}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex" aria-hidden="true">
        {points.map((p) => (
          <span key={p.label} className="min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground" dir="ltr">
            {p.label}
          </span>
        ))}
      </div>
    </div>
  )
}
