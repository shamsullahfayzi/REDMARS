import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import {
  createPractitionerRequestSchema,
  createSpecialityRequestSchema,
  type DepartmentSummary,
  type PractitionerSummary,
  type SpecialitySummary,
} from '@redmars/shared'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
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
import { cn } from '@/lib/utils'

/**
 * Admin-only practitioner master data (task 2.2): specialities (a small global
 * lookup), practitioners, and the many-to-many that lets one doctor work several
 * departments. The nav shows this only to an admin; the API enforces it.
 */
export function PractitionersPage() {
  const { t } = useTranslation()
  const practitionersQuery = usePractitioners()
  const departmentsQuery = useDepartments()

  const activeDepartments = departmentsQuery.data?.departments.filter((d) => d.isActive) ?? []

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.practitioners')} description={t('practitioners.subtitle')} />

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
            <Card className="overflow-x-auto p-0">
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
                    <PractitionerRow key={p.id} practitioner={p} departments={activeDepartments} />
                  ))}
                </tbody>
              </table>
            </Card>
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
    <Card>
      <CardHeader>
        <CardTitle>{t('practitioners.specialities.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {specialitiesQuery.data && specialitiesQuery.data.specialities.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {specialitiesQuery.data.specialities.map((s: SpecialitySummary) => (
              <Badge key={s.id}>{s.name}</Badge>
            ))}
          </div>
        )}
        {specialitiesQuery.data && specialitiesQuery.data.specialities.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('practitioners.specialities.empty')}</p>
        )}

        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="spec-code" className="text-xs text-muted-foreground">
              {t('practitioners.specialities.code')}
            </Label>
            <Input
              id="spec-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-28"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="spec-name" className="text-xs text-muted-foreground">
              {t('practitioners.specialities.name')}
            </Label>
            <Input
              id="spec-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-56"
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
      </CardContent>
    </Card>
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
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t('practitioners.create.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-code">{t('practitioners.create.code')}</Label>
              <Input id="p-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-speciality">{t('practitioners.create.speciality')}</Label>
              <Select
                id="p-speciality"
                value={specialityId}
                onChange={(e) => setSpecialityId(e.target.value)}
              >
                <option value="">{t('practitioners.create.specialityNone')}</option>
                {specialitiesQuery.data?.specialities.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-first">{t('practitioners.create.firstName')}</Label>
              <Input id="p-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-last">{t('practitioners.create.lastName')}</Label>
              <Input id="p-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-license">{t('practitioners.create.licenseNo')}</Label>
              <Input id="p-license" value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-phone">{t('practitioners.create.phone')}</Label>
              <Input id="p-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-user">{t('practitioners.create.user')}</Label>
            <Select id="p-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">{t('practitioners.create.userNone')}</option>
              {usersQuery.data?.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.username})
                </option>
              ))}
            </Select>
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
      </CardContent>
    </Card>
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
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRight
              className={cn('size-4 transition-transform rtl:rotate-180', isEditing && 'rotate-90 rtl:rotate-90')}
            />
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
                <Badge key={id}>{departmentName(id)}</Badge>
              ))}
            </div>
          )}
        </td>
        <td className="p-3">
          <Badge variant={p.isActive ? 'active' : 'muted'}>
            {p.isActive ? t('practitioners.list.active') : t('practitioners.list.inactive')}
          </Badge>
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
