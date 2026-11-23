import { useTranslation } from 'react-i18next'

export function StockBadge({
  stock,
  failed = false,
  external = false,
}: {
  stock?: { available: number; reorderThreshold: number }
  failed?: boolean
  external?: boolean
}) {
  const { t } = useTranslation()
  const status = !stock
    ? failed
      ? 'unknown'
      : 'loading'
    : stock.available === 0
      ? external
        ? 'external'
        : 'out'
      : stock.available <= stock.reorderThreshold
        ? 'low'
        : 'in'
  const color = {
    unknown: 'bg-muted',
    loading: 'bg-muted',
    external: 'bg-destructive/15 text-destructive',
    out: 'bg-destructive/15 text-destructive',
    low: 'bg-warning/15 text-warning',
    in: 'bg-muted text-foreground',
  }[status]
  return (
    <span className={'inline-block rounded px-2 py-0.5 text-xs font-medium ' + color}>
      {t('inventoryStatus.' + status, { count: stock?.available })}
    </span>
  )
}
