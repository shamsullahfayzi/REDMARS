import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ChevronLeft, ChevronRight, Search, UserPlus } from 'lucide-react'
import { PATIENT_SEARCH_MIN, currentAgeYears, type PatientSummary } from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { PageHeader } from '@/components/PageHeader'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useDebounced } from '@/hooks/useDebounced'
import { usePatientSearch } from '@/hooks/usePatientSearch'
import { cn } from '@/lib/utils'

/**
 * Task 3.2 — patient search.
 *
 * One box, three kinds of answer. The receptionist is handed a name, a phone, or an old
 * card with an MRN on it and should not have to tell the system which — she types what
 * she was given. The done-when is the phone: twelve patients called Najila are
 * indistinguishable by name, and the number is what separates them.
 *
 * Age is computed from the stored estimate plus its anchor, never read raw — a patient
 * registered at thirty is thirty-three three years later, and the row alone would lie.
 */
export function PatientsPage() {
  const { t } = useTranslation()
  const { roles } = useAuth()
  const [input, setInput] = useState('')
  const [page, setPage] = useState(1)
  const query = useDebounced(input, 250)
  const searchQuery = usePatientSearch(query, page)

  const term = query.trim()
  const tooShort = term.length > 0 && term.length < PATIENT_SEARCH_MIN
  const results = searchQuery.data?.patients ?? []
  const total = searchQuery.data?.total ?? 0
  const limit = searchQuery.data?.limit ?? 20
  const pageCount = Math.max(1, Math.ceil(total / limit))
  const canRegister = roles.includes('receptionist')

  // A new term restarts paging — page 3 of the old results means nothing for the new.
  useEffect(() => {
    setPage(1)
  }, [term])

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.patients')} description={t('patients.search.subtitle')} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xl flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('patients.search.placeholder')}
            className="ps-9"
            autoFocus
          />
        </div>
        {canRegister && (
          <Link to="/reception" className={cn(buttonVariants())}>
            <UserPlus className="size-4" aria-hidden />
            {t('patients.search.register')}
          </Link>
        )}
      </div>

      {tooShort && <p className="text-sm text-muted-foreground">{t('patients.search.tooShort')}</p>}
      {searchQuery.isError && (
        <p className="text-sm text-destructive">{t('patients.search.error')}</p>
      )}

      {!searchQuery.isError && (
        <section className="space-y-3">
          {results.length === 0 && !searchQuery.isPending ? (
            <div className="space-y-3">
              <p className="text-muted-foreground">
                {term ? t('patients.search.empty') : t('patients.search.none')}
              </p>
              {canRegister && (
                <Link to="/reception" className={cn(buttonVariants({ variant: 'outline' }))}>
                  <UserPlus className="size-4" aria-hidden />
                  {t('patients.search.registerInstead')}
                </Link>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {t('patients.search.count', { shown: results.length, total })}
              </p>
              <Card className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="p-3 text-start font-medium">{t('patients.fields.mrn')}</th>
                      <th className="p-3 text-start font-medium">{t('patients.search.name')}</th>
                      <th className="p-3 text-start font-medium">{t('patients.fields.gender')}</th>
                      <th className="p-3 text-start font-medium">{t('patients.fields.age')}</th>
                      <th className="p-3 text-start font-medium">{t('patients.fields.phone')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((patient) => (
                      <PatientRow key={patient.id} patient={patient} />
                    ))}
                  </tbody>
                </table>
              </Card>

              {pageCount > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {t('patients.search.page', { page, pageCount })}
                  </p>
                  <div className="flex gap-2">
                    {/* Chevrons mirror under RTL — "previous" is whichever way back is. */}
                    <Button
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
                      {t('patients.search.previous')}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={page >= pageCount}
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    >
                      {t('patients.search.next')}
                      <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}

function PatientRow({ patient }: { patient: PatientSummary }) {
  const { t } = useTranslation()
  const age = currentAgeYears(patient)
  const name = [patient.prefix, patient.firstName, patient.lastName].filter(Boolean).join(' ')

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/50">
      {/* An identifier reads left-to-right even on an RTL page. */}
      <td className="p-3 font-mono text-foreground" dir="ltr">
        {patient.mrn}
      </td>
      <td className="p-3 font-medium text-foreground">
        <Link to={`/patients/${patient.id}`} className="hover:underline">
          {name}
        </Link>
      </td>
      <td className="p-3 text-muted-foreground">{t(`patients.gender.${patient.gender}`)}</td>
      <td className="p-3 text-muted-foreground">
        {age == null ? '—' : t('patients.search.years', { count: age })}
      </td>
      <td className="p-3 text-muted-foreground" dir="ltr">
        {patient.phone ?? '—'}
      </td>
    </tr>
  )
}

