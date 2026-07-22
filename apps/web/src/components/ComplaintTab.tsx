import { useCallback, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { BookmarkPlus, Plus } from 'lucide-react'
import {
  isVisitOpen,
  updateComplaintRequestSchema,
  type Template,
  type VisitSummary,
} from '@redmars/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useConsultSaver } from '@/hooks/useConsultSave'
import { useCreateTemplate, useTemplates, useUpdateComplaint } from '@/hooks/useTemplates'

/**
 * Task 4.4 — what the patient actually came in with.
 *
 * The done-when is "oliguria, frequency, nocturia in 2 seconds", and the shape that makes
 * that true is ONE PHRASE PER TEMPLATE, stacked. Three clicks build the sentence. A
 * template per whole sentence would need a template per combination of symptoms, which is
 * how a template list becomes unusable by week three.
 *
 * The box starts with whatever the desk typed at check-in, because that is the patient's
 * own words and the doctor is refining them, not starting over. Saving REPLACES it — the
 * old wording is not lost, the audit trail holds the before and after of every update.
 */
export function ComplaintTab({ visit }: { visit: VisitSummary }) {
  const { t } = useTranslation()
  const [text, setText] = useState(visit.chiefComplaint ?? '')
  // What is currently saved. Kept locally rather than read back off the visit, so a
  // refetch mid-sentence cannot overwrite what the doctor is typing.
  const [baseline, setBaseline] = useState(visit.chiefComplaint ?? '')
  const [error, setError] = useState<string | null>(null)

  const templatesQuery = useTemplates('complaint')
  const update = useUpdateComplaint(visit.id)
  const open = isVisitOpen(visit.status)

  const isDirty = text.trim() !== baseline.trim()

  const save = useCallback(async () => {
    const parsed = updateComplaintRequestSchema.safeParse({ chiefComplaint: text })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('complaint.failed'))
      // Thrown, so F9 cannot finish the visit over a complaint that never saved.
      throw new Error('invalid complaint')
    }
    setError(null)
    await update.mutateAsync(parsed.data)
    setBaseline(text)
  }, [text, update, t])

  useConsultSaver('complaint', { isDirty, save })

  /**
   * Stacking, which is the whole speed story. Comma-joined because that is how the old
   * system reads and how a doctor writes it; already-present phrases are skipped so a
   * double click does not produce "nocturia, nocturia".
   */
  function append(phrase: string) {
    setText((current) => {
      const parts = current
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
      if (parts.includes(phrase)) return current
      return [...parts, phrase].join(', ')
    })
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void save().catch(() => undefined)
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="chiefComplaint">{t('complaint.label')}</Label>
            <Textarea
              id="chiefComplaint"
              rows={3}
              value={text}
              disabled={!open}
              placeholder={t('complaint.placeholder')}
              onChange={(e) => setText(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('complaint.hint')}</p>
          </div>

          {open && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={!isDirty || update.isPending}>
                {update.isPending ? t('complaint.saving') : t('complaint.save')}
              </Button>
              <SaveAsTemplate text={text} />
              {error && <p className="text-sm text-destructive">{error}</p>}
              {update.isError && <p className="text-sm text-destructive">{t('complaint.failed')}</p>}
            </div>
          )}
        </form>
      </Card>

      {open && (
        <TemplatePicker
          templates={templatesQuery.data?.templates ?? []}
          loading={templatesQuery.isPending}
          onPick={append}
        />
      )}
    </div>
  )
}

/**
 * The phrases, shared ones first — the hospital's agreed wording is what a new doctor
 * should reach for before their own.
 */
function TemplatePicker({
  templates,
  loading,
  onPick,
}: {
  templates: Template[]
  loading: boolean
  onPick: (phrase: string) => void
}) {
  const { t } = useTranslation()

  if (loading) return <p className="text-sm text-muted-foreground">{t('complaint.loading')}</p>
  if (templates.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('complaint.noTemplates')}</p>
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{t('complaint.templates')}</p>
      <div className="flex flex-wrap gap-2">
        {templates.map((template) => (
          <Button
            key={template.id}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onPick(template.content.text)}
            // The phrase itself, so a name like "urinary" still says what it will insert.
            title={template.content.text}
          >
            <Plus className="size-3.5" aria-hidden />
            {template.name}
          </Button>
        ))}
      </div>
    </div>
  )
}

/**
 * Save what is in the box as a phrase to reuse.
 *
 * Own templates only. Adding to the hospital's shared list is `template.manage.shared` and
 * admin-only, so it is not offered here — a button that 403s is worse than no button.
 */
function SaveAsTemplate({ text }: { text: string }) {
  const { t } = useTranslation()
  const create = useCreateTemplate('complaint')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  const phrase = text.trim()
  if (!phrase) return null

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <BookmarkPlus className="size-4" aria-hidden />
        {t('complaint.saveTemplate')}
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor="templateName">{t('complaint.templateName')}</Label>
        <Input
          id="templateName"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          placeholder={phrase.slice(0, 40)}
        />
      </div>
      <Button
        type="button"
        size="sm"
        disabled={create.isPending || name.trim().length < 2}
        onClick={() =>
          create.mutate(
            { type: 'complaint', name: name.trim(), content: { text: phrase }, shared: false },
            {
              onSuccess: () => {
                setOpen(false)
                setName('')
              },
            },
          )
        }
      >
        {create.isPending ? t('complaint.savingTemplate') : t('complaint.confirmTemplate')}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        {t('complaint.cancelTemplate')}
      </Button>
      {create.isError && (
        <p className="w-full text-xs text-destructive">{t('complaint.templateFailed')}</p>
      )}
    </div>
  )
}
