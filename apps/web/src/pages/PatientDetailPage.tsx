import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { ArrowLeft, IdCard, Plus, Trash2 } from 'lucide-react'
import {
  IDENTIFIER_SYSTEMS,
  currentAgeYears,
  updatePatientRequestSchema,
  type IdentifierSystem,
  type UpdatePatientRequest,
} from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { DuplicateNotice } from '@/components/DuplicateNotice'
import { PageHeader } from '@/components/PageHeader'
import { PatientFormFields } from '@/components/PatientFormFields'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  duplicateMatchesFromError,
  useAddPatientIdentifier,
  usePatientDetail,
  useRemovePatientIdentifier,
  useUpdatePatient,
} from '@/hooks/usePatient'
import { fromDetail, toPayload, usePatientForm } from '@/hooks/usePatientForm'

/**
 * Task 3.4 — one patient: their record, edited, and the numbers they arrived carrying.
 *
 * The identifiers section is the point of the task. An existing Medi-Pro patient must
 * stay findable by the number the staff already know, or the Phase 7 migration turns
 * every existing patient into a stranger on day one.
 *
 * Editing is a full replace — a field left blank is cleared, not quietly kept — so the
 * form is loaded from the saved record rather than started empty.
 */
export function PatientDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const { roles } = useAuth()
  const detailQuery = usePatientDetail(id)
  const updatePatient = useUpdatePatient(id ?? '')
  const addIdentifier = useAddPatientIdentifier(id ?? '')
  const removeIdentifier = useRemovePatientIdentifier(id ?? '')

  const { values, set, reset, errors, setErrors } = usePatientForm()
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [system, setSystem] = useState<IdentifierSystem>('medipro_legacy')
  const [identifierValue, setIdentifierValue] = useState('')
  const [saved, setSaved] = useState(false)

  const patient = detailQuery.data
  const canEdit = roles.includes('admin') || roles.includes('receptionist')

  // Load the saved record into the form once it arrives (and again if the id changes).
  useEffect(() => {
    if (patient && loadedFor !== patient.id) {
      reset(fromDetail(patient))
      setLoadedFor(patient.id)
    }
  }, [patient, loadedFor, reset])

  const blocked = duplicateMatchesFromError(updatePatient.error)

  function submit(acknowledgeDuplicate: boolean) {
    setErrors({})
    setSaved(false)
    const parsed = updatePatientRequestSchema.safeParse(toPayload(values, acknowledgeDuplicate))
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }
    updatePatient.mutate(parsed.data as UpdatePatientRequest, { onSuccess: () => setSaved(true) })
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    submit(false)
  }

  function onAddIdentifier(event: FormEvent) {
    event.preventDefault()
    if (!identifierValue.trim()) return
    addIdentifier.mutate(
      { system, value: identifierValue.trim() },
      { onSuccess: () => setIdentifierValue('') },
    )
  }

  if (detailQuery.isPending) {
    return <p className="text-muted-foreground">{t('patients.detail.loading')}</p>
  }
  if (detailQuery.isError || !patient) {
    return <p className="text-sm text-destructive">{t('patients.detail.notFound')}</p>
  }

  const fullName = [patient.prefix, patient.firstName, patient.lastName].filter(Boolean).join(' ')
  const age = currentAgeYears(patient)

  return (
    <div className="space-y-6">
      <Link
        to="/patients"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t('patients.detail.back')}
      </Link>

      <PageHeader
        title={fullName}
        description={[
          patient.mrn,
          t(`patients.gender.${patient.gender}`),
          age != null ? t('patients.search.years', { count: age }) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      />

      {/* Identifiers first: this is what task 3.4 exists for. */}
      <Card className="max-w-lg space-y-4 p-6">
        <div className="flex items-center gap-2">
          <IdCard className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="font-medium text-foreground">{t('patients.identifiers.title')}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{t('patients.identifiers.hint')}</p>

        {patient.identifiers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('patients.identifiers.empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {patient.identifiers.map((identifier) => (
              <li key={identifier.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm">
                  <span className="text-muted-foreground">
                    {t(`patients.identifiers.systems.${identifier.system}`)}
                  </span>
                  <span className="ms-2 font-mono text-foreground" dir="ltr">
                    {identifier.value}
                  </span>
                </span>
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={removeIdentifier.isPending}
                    onClick={() => removeIdentifier.mutate(identifier.id)}
                    aria-label={t('patients.identifiers.remove')}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <form onSubmit={onAddIdentifier} className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="identifierSystem">{t('patients.identifiers.system')}</Label>
              <select
                id="identifierSystem"
                value={system}
                onChange={(e) => setSystem(e.target.value as IdentifierSystem)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {IDENTIFIER_SYSTEMS.map((value) => (
                  <option key={value} value={value}>
                    {t(`patients.identifiers.systems.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="identifierValue">{t('patients.identifiers.number')}</Label>
              <Input
                id="identifierValue"
                value={identifierValue}
                dir="ltr"
                autoComplete="off"
                onChange={(e) => setIdentifierValue(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" disabled={addIdentifier.isPending}>
              <Plus className="size-4" aria-hidden />
              {t('patients.identifiers.add')}
            </Button>
          </form>
        )}

        {addIdentifier.isError && (
          <p className="text-sm text-destructive">{t('patients.identifiers.error')}</p>
        )}
      </Card>

      {canEdit && (
        <Card className="max-w-lg p-6">
          <h2 className="mb-5 font-medium text-foreground">{t('patients.detail.editTitle')}</h2>
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <PatientFormFields values={values} set={set} errors={errors} />

            {blocked && blocked.length > 0 && (
              <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
                <DuplicateNotice matches={blocked} tone="blocking" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => submit(true)}
                  disabled={updatePatient.isPending}
                >
                  {t('patients.duplicates.saveAnyway')}
                </Button>
              </div>
            )}

            {updatePatient.isError && !blocked && (
              <p className="text-sm text-destructive">{t('patients.detail.saveError')}</p>
            )}
            {saved && !updatePatient.isPending && (
              <p className="text-sm text-success">{t('patients.detail.saved')}</p>
            )}

            <div className="border-t border-border pt-4">
              <Button type="submit" disabled={updatePatient.isPending}>
                {updatePatient.isPending
                  ? t('patients.detail.saving')
                  : t('patients.detail.save')}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  )
}
