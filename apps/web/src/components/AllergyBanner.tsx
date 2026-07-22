import { useTranslation } from 'react-i18next'
import { AlertTriangle, ShieldQuestion } from 'lucide-react'
import type { Allergy } from '@redmars/shared'
import { cn } from '@/lib/utils'

/**
 * Task 4.6 — "Penicillin allergy is impossible to miss."
 *
 * Above the patient header, not below it. It is the first thing on the screen because it
 * is the first thing that should stop a doctor, and it arrives in the same request as the
 * header (task 4.1's context) so it paints at the same moment rather than a beat later.
 *
 * NEVER COLOUR ALONE. The severity is a word as well as a tint, the icon is not decorative,
 * and the whole block is role="alert" so a screen reader announces it on arrival — a
 * warning that only exists for people with good colour vision and a working monitor is not
 * a warning.
 *
 * AND THE EMPTY CASE IS NOT BLANK. "No allergies recorded" reads very differently from
 * nothing at all, because nothing at all reads as "safe". The system cannot tell whether
 * this patient was asked and had none, or was never asked — there is no reviewed-on column
 * to make that distinction — so it says the thing it can actually stand behind and puts
 * the question back on the person who can answer it.
 */
export function AllergyBanner({ allergies }: { allergies: Allergy[] }) {
  const { t } = useTranslation()

  if (allergies.length === 0) {
    return (
      <div
        className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm"
        // Not role="alert": there is nothing to alert about, and crying wolf on every
        // patient with no recorded allergy is how the real banner stops being read.
      >
        <ShieldQuestion className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-muted-foreground">{t('allergies.noneRecorded')}</span>
      </div>
    )
  }

  const worst = allergies[0].severity

  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border-2 px-4 py-3',
        worst === 'severe'
          ? 'border-destructive bg-destructive/12'
          : 'border-warning bg-warning/12',
      )}
    >
      <p
        className={cn(
          'flex items-center gap-2 text-sm font-bold uppercase tracking-wide',
          worst === 'severe' ? 'text-destructive' : 'text-warning',
        )}
      >
        <AlertTriangle className="size-5 shrink-0" aria-hidden />
        {t('allergies.banner')}
      </p>

      <ul className="mt-2 space-y-1">
        {allergies.map((allergy) => (
          <li key={allergy.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-semibold text-foreground">{allergy.substance}</span>
            {/* The word, not just the colour. */}
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-xs font-medium',
                allergy.severity === 'severe'
                  ? 'bg-destructive text-destructive-foreground'
                  : allergy.severity === 'moderate'
                    ? 'bg-warning text-warning-foreground'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {t(`allergies.severities.${allergy.severity}`)}
            </span>
            {/* "Rash" and "anaphylaxis" are not the same warning. */}
            {allergy.reaction && (
              <span className="text-muted-foreground">— {allergy.reaction}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
