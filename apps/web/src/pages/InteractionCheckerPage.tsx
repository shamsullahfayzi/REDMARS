import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Search, ShieldAlert, TriangleAlert, X } from 'lucide-react'
import type { DrugSummary, InteractionSeverity } from '@redmars/shared'
import { MIN_INTERACTION_DRUGS } from '@redmars/shared'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useDrugs } from '@/hooks/useDrugs'
import { useInteractionCheck } from '@/hooks/useInteractionCheck'
import { cn } from '@/lib/utils'

/**
 * Drug interaction checker (task 2.11). Pick two or more drugs from the formulary and
 * see the seeded dangerous pairs among them. Deliberately framed as an AID, not an
 * authority: the disclaimer is the first thing on the page and stays visible, because
 * a checker that returns nothing means "no seeded pair matched", not "safe". The real
 * consumer is the prescription screen in a later phase; this proves the check and lets
 * a doctor or pharmacist run it directly. Server-side interaction.check.
 */

// Each severity maps to a semantic badge colour. contraindicated/major read as
// danger, moderate as warning, minor as info — the shared status ramp.
const SEVERITY_VARIANT: Record<InteractionSeverity, 'danger' | 'warning' | 'info'> = {
  contraindicated: 'danger',
  major: 'danger',
  moderate: 'warning',
  minor: 'info',
}

export function InteractionCheckerPage() {
  const { t } = useTranslation()
  const [term, setTerm] = useState('')
  const search = useDebounced(term, 250)
  const drugsQuery = useDrugs(search)
  const [selected, setSelected] = useState<DrugSummary[]>([])

  const selectedIds = useMemo(() => new Set(selected.map((d) => d.id)), [selected])
  const check = useInteractionCheck(selected.map((d) => d.id))
  const interactions = check.data?.interactions ?? []

  const drugs = (drugsQuery.data?.drugs ?? []).filter((d) => d.isActive)
  const enoughSelected = selected.length >= MIN_INTERACTION_DRUGS

  function toggle(drug: DrugSummary) {
    setSelected((prev) =>
      prev.some((d) => d.id === drug.id) ? prev.filter((d) => d.id !== drug.id) : [...prev, drug],
    )
  }

  function label(drug: DrugSummary) {
    return drug.strength ? `${drug.genericName} ${drug.strength}` : drug.genericName
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.interactions')} description={t('interactions.subtitle')} />

      {/* The disclaimer leads the page and never scrolls away behind results. */}
      <div
        role="note"
        className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm"
      >
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div className="space-y-1">
          <p className="font-semibold text-warning">{t('interactions.disclaimerTitle')}</p>
          <p className="text-muted-foreground">{t('interactions.disclaimerBody')}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Picker */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t('interactions.pickTitle')}
          </h2>

          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.map((drug) => (
                <button
                  key={drug.id}
                  type="button"
                  onClick={() => toggle(drug)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                >
                  {label(drug)}
                  <X className="size-3.5" aria-hidden />
                  <span className="sr-only">{t('interactions.remove')}</span>
                </button>
              ))}
            </div>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={t('interactions.searchPlaceholder')}
              className="ps-9"
            />
          </div>

          <Card className="max-h-96 overflow-y-auto p-0">
            {drugs.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {drugsQuery.isPending ? t('interactions.loadingDrugs') : t('interactions.noDrugs')}
              </p>
            ) : (
              <ul>
                {drugs.map((drug) => {
                  const isSelected = selectedIds.has(drug.id)
                  return (
                    <li key={drug.id}>
                      <button
                        type="button"
                        onClick={() => toggle(drug)}
                        aria-pressed={isSelected}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-start text-sm last:border-0 hover:bg-accent',
                          isSelected && 'bg-accent/60',
                        )}
                      >
                        <span>
                          <span className="text-foreground">{drug.genericName}</span>{' '}
                          {drug.strength && (
                            <span className="text-muted-foreground">{drug.strength}</span>
                          )}
                          {drug.isControlled && (
                            <Badge variant="warning" className="ms-2">
                              {t('interactions.controlled')}
                            </Badge>
                          )}
                        </span>
                        {isSelected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </section>

        {/* Results */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t('interactions.resultsTitle')}
          </h2>

          {!enoughSelected ? (
            <p className="text-sm text-muted-foreground">{t('interactions.pickAtLeastTwo')}</p>
          ) : check.isError ? (
            <p className="text-sm text-destructive">{t('interactions.error')}</p>
          ) : interactions.length === 0 ? (
            <Card className="space-y-1 p-4">
              <p className="text-sm font-medium text-foreground">{t('interactions.noneTitle')}</p>
              {/* Never let an empty result read as clearance. */}
              <p className="text-sm text-muted-foreground">{t('interactions.noneBody')}</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {interactions.map((row) => (
                <Card key={`${row.drugAId}-${row.drugBId}`} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="flex items-center gap-2 font-medium text-foreground">
                      <TriangleAlert className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      {row.drugAName} <span className="text-muted-foreground">+</span>{' '}
                      {row.drugBName}
                    </p>
                    <Badge variant={SEVERITY_VARIANT[row.severity]}>
                      {t(`interactions.severity.${row.severity}`)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{row.description}</p>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

// A value that only updates after it has stopped changing for `delay` ms — one
// request per pause, not one per keystroke.
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}
