import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { currentAgeYears, type DuplicateMatch } from '@redmars/shared'
import { cn } from '@/lib/utils'

/**
 * The patients this registration might already be (task 3.3).
 *
 * `advisory` is a quiet note while she types; `blocking` is what the server refused on.
 * Both list the same thing — who is already in the register and how they match — because
 * the decision is hers either way and she cannot make it without seeing the rows.
 */
export function DuplicateNotice({
  matches,
  tone,
}: {
  matches: DuplicateMatch[]
  tone: 'advisory' | 'blocking'
}) {
  const { t } = useTranslation()

  return (
    <div className={cn('space-y-2', tone === 'advisory' && 'rounded-lg bg-warning/10 p-3')}>
      <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        {tone === 'blocking'
          ? t('patients.duplicates.blockingTitle')
          : t('patients.duplicates.advisoryTitle')}
      </p>
      <ul className="space-y-1.5">
        {matches.map((match) => {
          const age = currentAgeYears(match.patient)
          const name = [match.patient.firstName, match.patient.lastName]
            .filter(Boolean)
            .join(' ')
          return (
            <li key={match.patient.id} className="text-sm text-foreground">
              <span className="font-medium">{name}</span>
              <span className="mx-1.5 font-mono text-muted-foreground" dir="ltr">
                {match.patient.mrn}
              </span>
              {match.patient.phone && (
                <span className="text-muted-foreground" dir="ltr">
                  {match.patient.phone}
                </span>
              )}
              {age != null && (
                <span className="ms-1.5 text-muted-foreground">
                  {t('patients.search.years', { count: age })}
                </span>
              )}
              <span className="ms-1.5 text-xs text-muted-foreground">
                ({match.reasons.map((reason) => t(`patients.duplicates.reason.${reason}`)).join(', ')}
                )
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
