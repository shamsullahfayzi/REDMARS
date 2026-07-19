import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { DEPARTMENT_TYPES, createDepartmentRequestSchema, type DepartmentType } from '@redmars/shared'
import { Button } from '@/components/ui/button'
import { useCreateDepartment, useDepartments, useSetDepartmentActive } from '@/hooks/useDepartments'
import { ApiError } from '@/lib/api'

/**
 * Admin-only department master data (task 2.1). The nav only shows this to an
 * admin, but that is courtesy — the API denies every call here to anyone else.
 *
 * All spacing is logical (ps-/pe-, text-start) so the table and form mirror under
 * dir="rtl" for Dari and Pashto. The two local-name inputs are forced dir="rtl"
 * regardless of the UI language, because their content is always Dari/Pashto.
 */
export function DepartmentPage() {
  const { t } = useTranslation()
  const departmentsQuery = useDepartments()
  const createDepartment = useCreateDepartment()
  const setActive = useSetDepartmentActive()

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<DepartmentType | ''>('')
  const [nameLocalPrs, setNameLocalPrs] = useState('')
  const [nameLocalPs, setNameLocalPs] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function resetForm() {
    setCode('')
    setName('')
    setType('')
    setNameLocalPrs('')
    setNameLocalPs('')
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)

    // Validate against the shared contract before spending a round-trip. The
    // server re-checks all of this; this is just fast feedback.
    const parsed = createDepartmentRequestSchema.safeParse({
      code,
      name,
      type,
      nameLocalPrs,
      nameLocalPs,
    })
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? t('departments.create.invalid'))
      return
    }

    createDepartment.mutate(parsed.data, {
      onSuccess: resetForm,
      onError: (err) => {
        // 409 is the one case worth naming — the code is already taken.
        setFormError(
          err instanceof ApiError && err.status === 409
            ? t('departments.create.duplicate')
            : t('departments.create.failed'),
        )
      },
    })
  }

  const fieldClass =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{t('nav.departments')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('departments.subtitle')}</p>
      </div>

      {/* Create */}
      <form onSubmit={onSubmit} className="max-w-2xl space-y-4 rounded-xl border border-border p-5">
        <h2 className="font-medium text-foreground">{t('departments.create.title')}</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="code" className="text-sm font-medium text-foreground">
              {t('departments.create.code')}
            </label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('departments.create.codePlaceholder')}
              className={fieldClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="type" className="text-sm font-medium text-foreground">
              {t('departments.create.type')}
            </label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as DepartmentType | '')}
              className={fieldClass}
            >
              <option value="" disabled>
                {t('departments.create.typePlaceholder')}
              </option>
              {DEPARTMENT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`departments.types.${value}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-medium text-foreground">
            {t('departments.create.name')}
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="nameLocalPrs" className="text-sm font-medium text-foreground">
              {t('departments.create.nameLocalPrs')}
            </label>
            <input
              id="nameLocalPrs"
              dir="rtl"
              value={nameLocalPrs}
              onChange={(e) => setNameLocalPrs(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="nameLocalPs" className="text-sm font-medium text-foreground">
              {t('departments.create.nameLocalPs')}
            </label>
            <input
              id="nameLocalPs"
              dir="rtl"
              value={nameLocalPs}
              onChange={(e) => setNameLocalPs(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>

        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}

        <Button type="submit" disabled={createDepartment.isPending}>
          {createDepartment.isPending
            ? t('departments.create.submitting')
            : t('departments.create.submit')}
        </Button>
      </form>

      {/* List */}
      <section className="space-y-3">
        <h2 className="font-medium text-foreground">{t('departments.list.title')}</h2>

        {departmentsQuery.isPending && (
          <p className="text-muted-foreground">{t('departments.list.loading')}</p>
        )}
        {departmentsQuery.isError && (
          <p className="text-destructive">{t('departments.list.error')}</p>
        )}

        {departmentsQuery.data &&
          (departmentsQuery.data.departments.length === 0 ? (
            <p className="text-muted-foreground">{t('departments.list.empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('departments.list.code')}</th>
                    <th className="p-3 text-start font-medium">{t('departments.list.name')}</th>
                    <th className="p-3 text-start font-medium">{t('departments.list.type')}</th>
                    <th className="p-3 text-start font-medium">{t('departments.list.status')}</th>
                    <th className="p-3 text-end font-medium">{t('departments.list.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {departmentsQuery.data.departments.map((dep) => (
                    <tr key={dep.id} className="border-b border-border last:border-0">
                      <td className="p-3 font-mono text-foreground">{dep.code}</td>
                      <td className="p-3 text-foreground">
                        <div>{dep.name}</div>
                        {dep.nameLocalPrs && (
                          <div dir="rtl" className="text-xs text-muted-foreground">
                            {dep.nameLocalPrs}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">{t(`departments.types.${dep.type}`)}</td>
                      <td className="p-3">
                        <span
                          className={
                            dep.isActive
                              ? 'inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'
                              : 'inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
                          }
                        >
                          {dep.isActive ? t('departments.list.active') : t('departments.list.inactive')}
                        </span>
                      </td>
                      <td className="p-3 text-end">
                        <Button
                          variant={dep.isActive ? 'destructive' : 'outline'}
                          size="sm"
                          disabled={setActive.isPending}
                          onClick={() => setActive.mutate({ id: dep.id, isActive: !dep.isActive })}
                        >
                          {dep.isActive
                            ? t('departments.list.deactivate')
                            : t('departments.list.reactivate')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </section>
    </div>
  )
}
