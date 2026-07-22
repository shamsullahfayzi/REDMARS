import { useCallback, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Star, Trash2 } from 'lucide-react'
import {
  DIAGNOSIS_CERTAINTIES,
  isVisitOpen,
  recordDiagnosisRequestSchema,
  type Diagnosis,
  type DiagnosisCertainty,
  type IcdCodeSummary,
  type VisitSummary,
} from '@redmars/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useConsultSaver } from '@/hooks/useConsultSave'
import { useDebounced } from '@/hooks/useDebounced'
import { useDiagnoses, useDiagnosisWriters } from '@/hooks/useDiagnoses'
import { useIcdSearch } from '@/hooks/useIcdSearch'
import { cn } from '@/lib/utils'

/**
 * Task 4.5 — the doctor's conclusion.
 *
 * The done-when is "types depression, picks F32.1", so the code follows the TEXT rather
 * than replacing it: the doctor writes what they concluded, and the suggestions that match
 * appear under the box. Picking one attaches a code; not picking one is a complete, valid
 * diagnosis, because the schema says free text is always allowed and the catalog's gaps
 * are not the medical record's.
 *
 * Certainty defaults to provisional, which is what an unqualified diagnosis actually is at
 * the end of a first consultation — and `refuted` is on the list because ruling something
 * OUT is a finding worth keeping, not a row to remove.
 */
export function DiagnosisTab({ visit }: { visit: VisitSummary }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [icdCode, setIcdCode] = useState<string | null>(null)
  const [certainty, setCertainty] = useState<DiagnosisCertainty>('provisional')
  const [isPrimary, setIsPrimary] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const listQuery = useDiagnoses(visit.id)
  const { add, update, remove } = useDiagnosisWriters(visit.id)
  const open = isVisitOpen(visit.status)

  // Only search once the code is not already chosen — a picked diagnosis should stop
  // suggesting alternatives at the doctor while they read it back.
  const search = useDebounced(icdCode ? '' : text, 250)
  const icdQuery = useIcdSearch(search)

  const isDirty = text.trim().length > 0

  const save = useCallback(async () => {
    if (!isDirty) return
    const parsed = recordDiagnosisRequestSchema.safeParse({ text, icdCode, certainty, isPrimary })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('diagnosis.failed'))
      // Thrown, so F9 cannot finish a visit over a diagnosis still sitting in the box.
      throw new Error('invalid diagnosis')
    }
    setError(null)
    await add.mutateAsync(parsed.data)
    setText('')
    setIcdCode(null)
    setCertainty('provisional')
    setIsPrimary(false)
  }, [isDirty, text, icdCode, certainty, isPrimary, add, t])

  useConsultSaver('diagnosis', { isDirty, save })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void save().catch(() => undefined)
  }

  function pick(code: IcdCodeSummary) {
    setIcdCode(code.code)
    // The catalog's wording replaces what was typed, because the code and the text should
    // agree — a row reading "F32.1 / feeling low" is two different claims in one record.
    setText(code.title)
  }

  const diagnoses = listQuery.data?.diagnoses ?? []

  return (
    <div className="space-y-4">
      {open && (
        <Card className="p-4">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="diagnosisText">{t('diagnosis.label')}</Label>
              <Input
                id="diagnosisText"
                value={text}
                placeholder={t('diagnosis.placeholder')}
                onChange={(e) => {
                  setText(e.target.value)
                  // Typing over a picked diagnosis unpicks the code. Leaving it attached
                  // would file the doctor's words under somebody else's number.
                  setIcdCode(null)
                }}
              />
              {icdCode && (
                <p className="text-xs text-muted-foreground">
                  {t('diagnosis.coded')}{' '}
                  <span dir="ltr" className="font-mono font-semibold text-foreground">
                    {icdCode}
                  </span>
                  <button
                    type="button"
                    className="ms-2 text-primary hover:underline"
                    onClick={() => setIcdCode(null)}
                  >
                    {t('diagnosis.clearCode')}
                  </button>
                </p>
              )}
            </div>

            {/* Suggestions, not a gate. An empty result is not an error. */}
            {!icdCode && icdQuery.data && icdQuery.data.results.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                {icdQuery.data.results.map((code) => (
                  <li key={code.code}>
                    <button
                      type="button"
                      onClick={() => pick(code)}
                      className="flex w-full items-baseline gap-3 rounded px-2 py-1.5 text-start text-sm hover:bg-muted"
                    >
                      <span dir="ltr" className="font-mono font-semibold text-primary">
                        {code.code}
                      </span>
                      <span className="text-foreground">{code.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="diagnosisCertainty">{t('diagnosis.certainty')}</Label>
                <Select
                  id="diagnosisCertainty"
                  value={certainty}
                  onChange={(e) => setCertainty(e.target.value as DiagnosisCertainty)}
                >
                  {DIAGNOSIS_CERTAINTIES.map((value) => (
                    <option key={value} value={value}>
                      {t(`diagnosis.certainties.${value}`)}
                    </option>
                  ))}
                </Select>
              </div>

              <label className="flex h-10 items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                  className="size-4 accent-primary"
                />
                {t('diagnosis.primary')}
              </label>

              <Button type="submit" disabled={!isDirty || add.isPending}>
                {add.isPending ? t('diagnosis.saving') : t('diagnosis.add')}
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {add.isError && <p className="text-sm text-destructive">{t('diagnosis.failed')}</p>}
            </div>
          </form>
        </Card>
      )}

      {listQuery.isPending ? (
        <p className="text-sm text-muted-foreground">{t('diagnosis.loading')}</p>
      ) : diagnoses.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('diagnosis.none')}</p>
      ) : (
        <ul className="space-y-2">
          {diagnoses.map((diagnosis) => (
            <DiagnosisRow
              key={diagnosis.id}
              diagnosis={diagnosis}
              editable={open}
              onMakePrimary={() =>
                update.mutate({
                  id: diagnosis.id,
                  input: {
                    text: diagnosis.text,
                    icdCode: diagnosis.icdCode,
                    certainty: diagnosis.certainty,
                    notes: diagnosis.notes,
                    isPrimary: true,
                  },
                })
              }
              onRemove={() => remove.mutate(diagnosis.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function DiagnosisRow({
  diagnosis,
  editable,
  onMakePrimary,
  onRemove,
}: {
  diagnosis: Diagnosis
  editable: boolean
  onMakePrimary: () => void
  onRemove: () => void
}) {
  const { t } = useTranslation()

  return (
    <li>
      <Card className={cn('flex flex-wrap items-center gap-3 p-3', diagnosis.isPrimary && 'border-primary/50')}>
        {diagnosis.icdCode && (
          <span dir="ltr" className="font-mono text-sm font-semibold text-primary">
            {diagnosis.icdCode}
          </span>
        )}
        <div className="min-w-40 flex-1">
          <p className="text-sm font-medium text-foreground">{diagnosis.text}</p>
          {/* The catalog's own wording, when it differs from what the doctor typed. */}
          {diagnosis.icdTitle && diagnosis.icdTitle !== diagnosis.text && (
            <p className="text-xs text-muted-foreground">{diagnosis.icdTitle}</p>
          )}
          {diagnosis.notes && <p className="mt-1 text-xs text-foreground">{diagnosis.notes}</p>}
        </div>

        <Badge variant={diagnosis.certainty === 'confirmed' ? 'success' : diagnosis.certainty === 'refuted' ? 'muted' : 'info'}>
          {t(`diagnosis.certainties.${diagnosis.certainty}`)}
        </Badge>

        {diagnosis.isPrimary ? (
          <Badge variant="active">{t('diagnosis.primary')}</Badge>
        ) : (
          editable && (
            <Button type="button" size="sm" variant="ghost" onClick={onMakePrimary}>
              <Star className="size-4" aria-hidden />
              {t('diagnosis.makePrimary')}
            </Button>
          )
        )}

        {diagnosis.practitionerName && (
          <span className="text-xs text-muted-foreground">{diagnosis.practitionerName}</span>
        )}

        {editable && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t('diagnosis.remove')}
            onClick={onRemove}
          >
            <Trash2 className="size-4 text-destructive" aria-hidden />
          </Button>
        )}
      </Card>
    </li>
  )
}
