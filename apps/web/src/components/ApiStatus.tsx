import { useTranslation } from 'react-i18next'
import { useHealth } from '@/hooks/useHealth'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Phase 0 scaffolding: proves the web app reaches the API and that the response
 * survives schema validation. Not a real feature — it goes away once there are
 * screens worth looking at.
 */
export function ApiStatus() {
  const { t } = useTranslation()
  const { data, isPending, isError, error } = useHealth()

  // Online is a status, not the brand — so it reads success-green, not primary teal.
  const tone = isPending ? 'bg-muted-foreground/40' : isError ? 'bg-destructive' : 'bg-success'

  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
      <span className={cn('size-2 rounded-full', tone)} aria-hidden />
      <span className="text-muted-foreground">{t('api.label')}</span>

      {isPending && <span>{t('api.checking')}</span>}

      {isError && (
        <span className="text-destructive">
          {error instanceof Error ? error.message : t('api.down')}
        </span>
      )}

      {data && (
        <span>
          {t('api.up')} · {formatNumber(data.uptimeSeconds)}s
        </span>
      )}
    </div>
  )
}
