import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createPractitionerRequestSchema,
  createSpecialityRequestSchema,
  type DepartmentSummary,
  type PractitionerSummary,
  type SpecialitySummary,
} from '@redmars/shared'
import { Button } from '@/components/ui/button'
import { useDepartments } from '@/hooks/useDepartments'
import {
  useCreatePractitioner,
  usePractitioners,
  useSetPractitionerActive,
  useSetPractitionerDepartments,
} from '@/hooks/usePractitioners'
import { useCreateSpeciality, useSpecialities } from '@/hooks/useSpecialities'
import { useUsers } from '@/hooks/useUsers'
import { ApiError } from '@/lib/api'

/**
 * Admin-only practitioner master data (task 2.2): specialities (a small global
 * lookup), practitioners, and the many-to-many that lets one doctor work several
 * departments. The nav shows this only to an admin; the API enforces it.
 */

const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

const pillClass = 'inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground'

function statusPillClass(isActive: boolean): string {
  return isActive
    ? 'inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'
    : 'inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
}

export function PractitionersPage() {
  const { t } = useTranslation()
  const practitionersQuery = usePractitioners()
  const departmentsQuery = useDepartments()

  const activeDepartments = departmentsQuery.data?.departments.filter((d) => d.isActive) ?? []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{t('nav.practitioners')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('practitioners.subtitle')}</p>
      </div>

      <SpecialitiesSection />

      <CreatePractitionerForm departments={activeDepartments} />

      {/* List */}
      <section className="space-y-3">
        <h2 className="font-medium text-foreground">{t('practitioners.list.title')}</h2>

        {practitionersQuery.isPending && (
          <p className="text-muted-foreground">{t('practitioners.list.loading')}</p>
        )}
        {practitionersQuery.isError && (
          <p className="text-destructive">{t('practitioners.list.error')}</p>
        )}

        {practitionersQuery.data &&
          (practitionersQuery.data.practitioners.length === 0 ? (
            <p className="text-muted-foreground">{t('practitioners.list.empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="w-10 p-3" />
                    <th className="p-3 text-start font-medium">{t('practitioners.list.name')}</th>
                    <th className="p-3 text-start font-medium">{t('practitioners.list.code')}</th>
                    <th className="p-3 text-start font-medium">
                      {t('practitioners.list.speciality')}
                    </th>
                    <th className="p-3 text-start font-medium">
                      {t('practitioners.list.departments')}
                    </th>
                    <th className="p-3 text-start font-medium">{t('practitioners.list.status')}</th>
                    <th className="p-3 text-end font-medium">{t('practitioners.list.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {practitionersQuery.data.practitioners.map((p) => (
                    <PractitionerRow
                      key={p.id}
                      practitioner={p}
                      departments={activeDepartments}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </section>
    </div>
  )
}

// --- Specialities ------------------------------------------------------------

function SpecialitiesSection() {
  const { t } = useTranslation()
  const specialitiesQuery = useSpecialities()
  const createSpeciality = useCreateSpeciality()

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const parsed = createSpecialityRequestSchema.safeParse({ code, name })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('practitioners.specialities.invalid'))
      return
    }

    createSpeciality.mutate(parsed.data, {
      onSuccess: () => {
        setCode('')
        setName('')
      },
      onError: (err) => {
        setError(
          err instanceof ApiError && err.status === 409
            ? t('practitioners.specialities.duplicate')
            : t('practitioners.specialities.failed'),
        )
      },
    })
  }

  return (
    <section className="space-y-3 rounded-xl border border-border p-5">
      <h2 className="font-medium text-foreground">{t('practitioners.specialities.title')}</h2>

      {specialitiesQuery.data && specialitiesQuery.data.specialities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {specialitiesQuery.data.specialities.map((s: SpecialitySummary) => (
            <span key={s.id} className={pillClass}>
              {s.name}
            </span>
          ))}
        </div>
      )}
      {specialitiesQuery.data && specialitiesQuery.data.specialities.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('practitioners.specialities.empty')}</p>
      )}

      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="spec-code" className="text-xs font-medium text-muted-foreground">
            {t('practitioners.specialities.code')}
          </label>
          <input
            id="spec-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${fieldClass} w-28`}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="spec-name" className="text-xs font-medium text-muted-foreground">
            {t('practitioners.specialities.name')}
          </label>
          <input
            id="spec-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${fieldClass} w-56`}
          />
        </div>
        <Button type="submit" size="sm" disabled={createSpeciality.isPending}>
          {createSpeciality.isPending
            ? t('practitioners.specialities.adding')
            : t('practitioners.specialities.add')}
        </Button>
        {error && (
          <p role="alert" className="w-full text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </section>
  )
}

// --- Create practitioner -----------------------------------------------------

function CreatePractitionerForm({ departments }: { departments: DepartmentSummary[] }) {
  const { t } = useTranslation()
  const createPractitioner = useCreatePractitioner()
  const specialitiesQuery = useSpecialities()
  const usersQuery = useUsers()

  const [code, setCode] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [specialityId, setSpecialityId] = useState('')
  const [userId, setUserId] = useState('')
  const [licenseNo, setLicenseNo] = useState('')
  const [phone, setPhone] = useState('')
  const [departmentIds, setDepartmentIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  function toggleDepartment(id: string) {
    setDepartmentIds((current) =>
      current.includes(id) ? current.filter((d) => d !== id) : [...current, id],
    )
  }

  function resetForm() {
    setCode('')
    setFirstName('')
    setLastName('')
    setSpecialityId('')
    setUserId('')
    setLicenseNo('')
    setPhone('')
    setDepartmentIds([])
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const parsed = createPractitionerRequestSchema.safeParse({
      code,
      firstName,
      lastName,
      specialityId,
      userId,
      licenseNo,
      phone,
      departmentIds,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('practitioners.create.invalid'))
      return
    }

    createPractitioner.mutate(parsed.data, {
      onSuccess: resetForm,
      onError: (err) => {
        setError(
          err instanceof ApiError && err.status === 409
            ? t('practitioners.create.duplicate')
            : t('practitioners.create.failed'),
        )
      },
    })
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-4 rounded-xl border border-border p-5">
      <h2 className="font-medium text-foreground">{t('practitioners.create.title')}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="p-code" className="text-sm font-medium text-foreground">
            {t('practitioners.create.code')}
          </label>
          <input id="p-code" value={code} onChange={(e) => setCode(e.target.value)} className={fieldClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="p-speciality" className="text-sm font-medium text-foreground">
            {t('practitioners.create.speciality')}
          </label>
          <select
            id="p-speciality"
            value={specialityId}
            onChange={(e) => setSpecialityId(e.target.value)}
            className={fieldClass}
          >
            <option value="">{t('practitioners.create.specialityNone')}</option>
            {specialitiesQuery.data?.specialities.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="p-first" className="text-sm font-medium text-foreground">
            {t('practitioners.create.firstName')}
          </label>
          <input
            id="p-first"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="p-last" className="text-sm font-medium text-foreground">
            {t('practitioners.create.lastName')}
          </label>
          <input
            id="p-last"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="p-license" className="text-sm font-medium text-foreground">
            {t('practitioners.create.licenseNo')}
          </label>
          <input
            id="p-license"
            value={licenseNo}
            onChange={(e) => setLicenseNo(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="p-phone" className="text-sm font-medium text-foreground">
            {t('practitioners.create.phone')}
          </label>
          <input id="p-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldClass} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="p-user" className="text-sm font-medium text-foreground">
          {t('practitioners.create.user')}
        </label>
        <select id="p-user" value={userId} onChange={(e) => setUserId(e.target.value)} className={fieldClass}>
          <option value="">{t('practitioners.create.userNone')}</option>
          {usersQuery.data?.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName} ({u.username})
            </option>
          ))}
        </select>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">
          {t('practitioners.create.departments')}
        </legend>
        <div className="flex flex-wrap gap-3">
          {departments.map((d) => (
            <label key={d.id} className="flex items-center gap-1.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={departmentIds.includes(d.id)}
                onChange={() => toggleDepartment(d.id)}
              />
              {d.name}
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={createPractitioner.isPending}>
        {createPractitioner.isPending
          ? t('practitioners.create.submitting')
          : t('practitioners.create.submit')}
      </Button>
    </form>
  )
}

// --- List row + inline department editor -------------------------------------

function PractitionerRow({
  practitioner: p,
  departments,
}: {
  practitioner: PractitionerSummary
  departments: DepartmentSummary[]
}) {
  const { t } = useTranslation()
  const setActive = useSetPractitionerActive()
  const [isEditing, setIsEditing] = useState(false)

  const departmentName = (id: string) => departments.find((d) => d.id === id)?.name ?? id

  return (
    <>
      <tr className="border-b border-border last:border-0">
        <td className="p-3">
          <button
            type="button"
            onClick={() => setIsEditing((v) => !v)}
            aria-expanded={isEditing}
            aria-label={t('practitioners.edit.toggle')}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
          >
            <span className={isEditing ? 'rotate-90 transition-transform' : 'transition-transform'}>
              ▸
            </span>
          </button>
        </td>
        <td className="p-3 text-foreground">
          {p.firstName} {p.lastName}
        </td>
        <td className="p-3 font-mono text-foreground">{p.code}</td>
        <td className="p-3 text-muted-foreground">{p.specialityName ?? '—'}</td>
        <td className="p-3">
          {p.departmentIds.length === 0 ? (
            <span className="text-muted-foreground">{t('practitioners.list.noDepartments')}</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {p.departmentIds.map((id) => (
                <span key={id} className={pillClass}>
                  {departmentName(id)}
                </span>
              ))}
            </div>
          )}
        </td>
        <td className="p-3">
          <span className={statusPillClass(p.isActive)}>
            {p.isActive ? t('practitioners.list.active') : t('practitioners.list.inactive')}
          </span>
        </td>
        <td className="p-3 text-end">
          <Button
            variant={p.isActive ? 'destructive' : 'outline'}
            size="sm"
            disabled={setActive.isPending}
            onClick={() => setActive.mutate({ id: p.id, isActive: !p.isActive })}
          >
            {p.isActive ? t('practitioners.list.deactivate') : t('practitioners.list.reactivate')}
          </Button>
        </td>
      </tr>
      {isEditing && (
        <tr className="border-b border-border last:border-0 bg-muted/30">
          <td />
          <td colSpan={6} className="p-3">
            <DepartmentEditor
              practitioner={p}
              departments={departments}
              onDone={() => setIsEditing(false)}
            />
          </td>
        </tr>
      )}
    </>
  )
}

function DepartmentEditor({
  practitioner: p,
  departments,
  onDone,
}: {
  practitioner: PractitionerSummary
  departments: DepartmentSummary[]
  onDone: () => void
}) {
  const { t } = useTranslation()
  const setDepartments = useSetPractitionerDepartments()
  const [selected, setSelected] = useState<string[]>(p.departmentIds)
  const [error, setError] = useState<string | null>(null)

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((d) => d !== id) : [...current, id],
    )
  }

  function onSave() {
    setError(null)
    setDepartments.mutate(
      { id: p.id, departmentIds: selected },
      {
        onSuccess: onDone,
        onError: () => setError(t('practitioners.edit.failed')),
      },
    )
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">{t('practitioners.edit.title')}</h3>
      <div className="flex flex-wrap gap-3">
        {departments.map((d) => (
          <label key={d.id} className="flex items-center gap-1.5 text-sm text-foreground">
            <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} />
            {d.name}
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button size="sm" disabled={setDepartments.isPending} onClick={onSave}>
        {setDepartments.isPending ? t('practitioners.edit.saving') : t('practitioners.edit.save')}
      </Button>
    </div>
  )
}
