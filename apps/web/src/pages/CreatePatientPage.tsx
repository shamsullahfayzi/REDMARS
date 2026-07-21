import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, UserPlus } from 'lucide-react'
import { createPatientRequestSchema, type CreatePatientRequest } from '@redmars/shared'
import { DuplicateNotice } from '@/components/DuplicateNotice'
import { PageHeader } from '@/components/PageHeader'
import { PatientFormFields } from '@/components/PatientFormFields'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useDebounced } from '@/hooks/useDebounced'
import { duplicateMatchesFromError, useCreatePatient, useDuplicateCheck } from '@/hooks/usePatient'
import { toPayload, usePatientForm } from '@/hooks/usePatientForm'

/**
 * Task 3.1 — patient registration.
 *
 * The design constraint is a number, not a feeling: the receptionist is the bottleneck at
 * Farhat, and she registers a walk-in while he is standing at the window. The field
 * layout that follows from that lives in PatientFormFields, shared with the edit screen.
 *
 * The MRN is never typed. It comes back from the server (task 2.10) and is the receipt.
 */
export function CreatePatientPage() {
  const { t } = useTranslation()
  const createPatient = useCreatePatient()
  const { values, set, reset, errors, setErrors } = usePatientForm()
  const formRef = useRef<HTMLFormElement>(null)
  const [copied, setCopied] = useState(false)

  // The advisory check, while she is still typing. Courtesy — the server refuses a
  // high-confidence duplicate whether or not this ever ran.
  const advisory = useDuplicateCheck(
    useDebounced(values.firstName, 400),
    useDebounced(values.lastName, 400),
    useDebounced(values.phone, 400),
  )
  const blocked = duplicateMatchesFromError(createPatient.error)
  const advisoryMatches = blocked ? [] : (advisory.data?.matches ?? [])

  function submit(acknowledgeDuplicate: boolean) {
    setErrors({})
    const parsed = createPatientRequestSchema.safeParse(toPayload(values, acknowledgeDuplicate))
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return // never fall through to mutate with undefined data
    }
    createPatient.mutate(parsed.data as CreatePatientRequest)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    submit(false)
  }

  function registerAnother() {
    createPatient.reset()
    reset()
  }

  async function copyMrn(mrn: string) {
    await navigator.clipboard.writeText(mrn)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const patient = createPatient.data

  // --- Success: the MRN is the receipt, and the desk keeps moving -----------------
  if (patient) {
    const fullName = [patient.prefix, patient.firstName, patient.lastName]
      .filter(Boolean)
      .join(' ')

    return (
      <div className="space-y-6">
        <PageHeader title={t('patients.create.title')} />
        <Card className="max-w-lg space-y-5 p-6">
          <div className="flex items-center gap-2 text-success">
            <Check className="size-5" aria-hidden />
            <p className="font-medium">{t('patients.create.registered')}</p>
          </div>

          <p className="text-lg font-semibold text-foreground">{fullName}</p>

          <div className="rounded-lg bg-muted p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('patients.create.mrn')}
            </p>
            <div className="mt-1 flex items-center gap-2">
              {/* Always LTR: an identifier reads left-to-right even on an RTL page. */}
              <span dir="ltr" className="font-mono text-2xl font-bold text-foreground">
                {patient.mrn}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void copyMrn(patient.mrn)}
                aria-label={t('patients.create.copyMrn')}
              >
                {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>

          {/* Primary, because there is a queue at the window. */}
          <Button type="button" onClick={registerAnother}>
            <UserPlus className="size-4" aria-hidden />
            {t('patients.create.registerAnother')}
          </Button>
        </Card>
      </div>
    )
  }

  // --- The form ------------------------------------------------------------------
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('patients.create.title')}
        description={t('patients.create.subtitle')}
      />

      <Card className="max-w-lg p-6">
        <form ref={formRef} onSubmit={onSubmit} className="space-y-5" noValidate>
          <PatientFormFields
            values={values}
            set={set}
            errors={errors}
            autoFocus
            belowPhone={
              advisoryMatches.length > 0 ? (
                <DuplicateNotice matches={advisoryMatches} tone="advisory" />
              ) : null
            }
          />

          {/* The server refused. Show what it found and let her decide — never a dead end. */}
          {blocked && blocked.length > 0 && (
            <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
              <DuplicateNotice matches={blocked} tone="blocking" />
              <Button
                type="button"
                variant="outline"
                onClick={() => submit(true)}
                disabled={createPatient.isPending}
              >
                {t('patients.duplicates.registerAnyway')}
              </Button>
            </div>
          )}

          {createPatient.isError && !blocked && (
            <p className="text-sm text-destructive">{t('patients.create.error')}</p>
          )}

          <div className="flex items-center gap-3 border-t border-border pt-4">
            <Button type="submit" disabled={createPatient.isPending}>
              {createPatient.isPending ? t('patients.create.saving') : t('patients.create.submit')}
            </Button>
            <span className="text-xs text-muted-foreground">{t('patients.create.enterHint')}</span>
          </div>
        </form>
      </Card>
    </div>
  )
}
