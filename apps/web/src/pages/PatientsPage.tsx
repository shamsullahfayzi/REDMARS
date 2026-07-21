import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Search, UserPlus } from 'lucide-react'
import { PATIENT_SEARCH_MIN, currentAgeYears, type PatientSummary } from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { PageHeader } from '@/components/PageHeader'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
  const query = useDebounced(input, 250)
  const searchQuery = usePatientSearch(query)

  const term = query.trim()
  const tooShort = term.length > 0 && term.length < PATIENT_SEARCH_MIN
  const searched = term.length >= PATIENT_SEARCH_MIN
  const results = searchQuery.data?.patients ?? []
  const total = searchQuery.data?.total ?? 0
  const canRegister = roles.includes('receptionist')

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
          <Link to="/patients/new" className={cn(buttonVariants())}>
            <UserPlus className="size-4" aria-hidden />
            {t('patients.search.register')}
          </Link>
        )}
      </div>

      {tooShort && <p className="text-sm text-muted-foreground">{t('patients.search.tooShort')}</p>}
      {searchQuery.isError && (
        <p className="text-sm text-destructive">{t('patients.search.error')}</p>
      )}

      {searched && !searchQuery.isError && (
        <section className="space-y-3">
          {results.length === 0 && !searchQuery.isPending ? (
            <div className="space-y-3">
              <p className="text-muted-foreground">{t('patients.search.empty')}</p>
              {canRegister && (
                <Link
                  to="/patients/new"
                  className={cn(buttonVariants({ variant: 'outline' }))}
                >
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
    <tr className="border-b border-border last:border-0">
      {/* An identifier reads left-to-right even on an RTL page. */}
      <td className="p-3 font-mono text-foreground" dir="ltr">
        {patient.mrn}
      </td>
      <td className="p-3 font-medium text-foreground">{name}</td>
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

/**
 * Kept local, as it is in IcdLookupPage — two uses is a duplicate, not yet a shared
 * abstraction. Extract on the third.
 */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}
