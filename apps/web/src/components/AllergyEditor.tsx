import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Undo2 } from 'lucide-react'
import {
  ALLERGY_SEVERITIES,
  recordAllergyRequestSchema,
  type Allergy,
  type AllergySeverity,
} from '@redmars/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useAllergies, useAllergyWriters } from '@/hooks/useAllergies'
import { serverMessage } from '@/lib/api'

/**
 * Task 4.6 — recording an allergy where it actually gets discovered.
 *
 * On the consult screen, under the banner, because the moment a patient says "penicillin
 * makes me swell up" is while they are sitting in the room — not later, on a different
 * screen, when whoever heard it has moved on.
 *
 * Collapsed until asked for, because most consultations do not add one and a permanently
 * open form next to the warning it feeds makes the warning look like part of a form.
 *
 * NOT registered with the F2/F4/F9 save keys (task 4.2), deliberately. Those save the
 * VISIT'S work; an allergy belongs to the patient and outlives the visit, and quietly
 * folding it into "save and finish" would let a half-typed substance be written as a
 * permanent safety record by a keystroke aimed at something else.
 */
export function AllergyEditor({ patientId }: { patientId: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const listQuery = useAllergies(patientId)
  const { add, update } = useAllergyWriters(patientId)

  const [substance, setSubstance] = useState('')
  const [severity, setSeverity] = useState<AllergySeverity | ''>('')
  const [reaction, setReaction] = useState('')
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setSubstance('')
    setSeverity('')
    setReaction('')
    setError(null)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = recordAllergyRequestSchema.safeParse({ substance, severity, reaction })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('allergies.failed'))
      return
    }
    add.mutate(parsed.data, {
      onSuccess: () => {
        reset()
        setOpen(false)
      },
    })
  }

  const allergies = listQuery.data?.allergies ?? []
  const retracted = allergies.filter((allergy) => !allergy.isActive)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          <Plus className="size-4" aria-hidden />
          {t('allergies.record')}
        </Button>
        {/* Retracted ones are shown here rather than in the banner: a banner is a warning
            and this is history, but "penicillin was on this chart until someone took it
            off" is exactly what a doctor wants before prescribing penicillin. */}
        {retracted.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {t('allergies.retractedCount')}:{' '}
            {retracted.map((allergy) => allergy.substance).join(', ')}
          </span>
        )}
      </div>

      {open && (
        <Card className="p-4">
          <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label htmlFor="allergySubstance">{t('allergies.substance')}</Label>
              <Input
                id="allergySubstance"
                value={substance}
                autoFocus
                placeholder={t('allergies.substancePlaceholder')}
                onChange={(e) => setSubstance(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="allergySeverity">{t('allergies.severity')}</Label>
              {/* No pre-selected value, on purpose. The contract refuses a missing
                  severity because an unstated one would read as `mild` on the screen that
                  decides whether to prescribe. */}
              <Select
                id="allergySeverity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as AllergySeverity | '')}
              >
                <option value="">{t('allergies.chooseSeverity')}</option>
                {ALLERGY_SEVERITIES.map((value) => (
                  <option key={value} value={value}>
                    {t(`allergies.severities.${value}`)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="min-w-48 flex-1 space-y-1.5">
              <Label htmlFor="allergyReaction">{t('allergies.reaction')}</Label>
              <Input
                id="allergyReaction"
                value={reaction}
                placeholder={t('allergies.reactionPlaceholder')}
                onChange={(e) => setReaction(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? t('allergies.saving') : t('allergies.save')}
            </Button>

            {error && <p className="w-full text-sm text-destructive">{error}</p>}
            {add.isError && (
              <p className="w-full text-sm text-destructive">
                {serverMessage(add.error) ?? t('allergies.failed')}
              </p>
            )}
          </form>

          {allergies.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-border pt-3">
              {allergies.map((allergy) => (
                <AllergyRow
                  key={allergy.id}
                  allergy={allergy}
                  busy={update.isPending}
                  onToggle={() =>
                    update.mutate({
                      id: allergy.id,
                      input: {
                        substance: allergy.substance,
                        drugId: allergy.drugId,
                        reaction: allergy.reaction,
                        severity: allergy.severity,
                        isActive: !allergy.isActive,
                      },
                    })
                  }
                />
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}

function AllergyRow({
  allergy,
  busy,
  onToggle,
}: {
  allergy: Allergy
  busy: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()

  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className={allergy.isActive ? 'font-medium text-foreground' : 'text-muted-foreground line-through'}>
        {allergy.substance}
      </span>
      <span className="text-xs text-muted-foreground">
        {t(`allergies.severities.${allergy.severity}`)}
        {allergy.reaction ? ` · ${allergy.reaction}` : ''}
      </span>
      {allergy.notedByName && (
        <span className="text-xs text-muted-foreground">· {allergy.notedByName}</span>
      )}
      {/* Retract, never delete. The row stays so the chart can still say it was here. */}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="ms-auto"
        disabled={busy}
        onClick={onToggle}
      >
        <Undo2 className="size-3.5" aria-hidden />
        {allergy.isActive ? t('allergies.retract') : t('allergies.restore')}
      </Button>
    </li>
  )
}
