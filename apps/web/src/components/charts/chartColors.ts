/**
 * The categorical ramp `index.css` seeded and nothing used until now — `--chart-1`
 * through `--chart-5`, "distinct hues, not five greys" (see the comment on `:root`).
 * Every chart in this app cycles through these five, in this order, so a colour means
 * the same thing wherever it appears on a report — the ramp already carries both a
 * light and a dark variant, so no chart needs its own theme handling.
 */
export const CHART_FILL_CLASSES = [
  'fill-chart-1',
  'fill-chart-2',
  'fill-chart-3',
  'fill-chart-4',
  'fill-chart-5',
] as const

export const CHART_DOT_CLASSES = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
] as const

/**
 * Written out in full rather than derived from CHART_DOT_CLASSES with a string
 * `.replace()` — Tailwind's build-time scanner only generates CSS for class names it can
 * find as a literal in the source. A name assembled at runtime (`'bg-chart-1'.replace(...)`)
 * never appears as text anywhere, so the utility silently never gets emitted.
 */
export const CHART_STROKE_CLASSES = [
  'stroke-chart-1',
  'stroke-chart-2',
  'stroke-chart-3',
  'stroke-chart-4',
  'stroke-chart-5',
] as const

export function chartFill(index: number): string {
  return CHART_FILL_CLASSES[index % CHART_FILL_CLASSES.length]
}

export function chartDot(index: number): string {
  return CHART_DOT_CLASSES[index % CHART_DOT_CLASSES.length]
}

export function chartStroke(index: number): string {
  return CHART_STROKE_CLASSES[index % CHART_STROKE_CLASSES.length]
}
