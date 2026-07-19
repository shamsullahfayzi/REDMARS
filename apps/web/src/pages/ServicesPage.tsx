import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import {
  createServiceRequestSchema,
  updateServiceRequestSchema,
  type DepartmentSummary,
  type ServiceSummary,
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
  useCreateService,
  useServices,
  useSetServiceActive,
  useUpdateService,
} from '@/hooks/useServices'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * Admin-only service catalogue (task 2.3). A Service is a priced catalogue row —
 * the one place a fee is allowed to live. Admin-only via the nav; the API enforces
 * service.manage on every route.
 */
export function ServicesPage() {
  const { t } = useTranslation()
  const servicesQuery = useServices()
  const departmentsQuery = useDepartments()

  const departments = departmentsQuery.data?.departments ?? []
  const activeDepartments = departments.filter((d) => d.isActive)
  const departmentName = (id: string) => departments.find((d) => d.id === id)?.name ?? id

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.services')} description={t('services.subtitle')} />

      <CreateServiceForm departments={activeDepartments} />

      {/* List */}
      <section className="space-y-3">
        <h2 className="font-medium text-foreground">{t('services.list.title')}</h2>

        {servicesQuery.isPending && (
          <p className="text-muted-foreground">{t('services.list.loading')}</p>
        )}
        {servicesQuery.isError && <p className="text-destructive">{t('services.list.error')}</p>}

        {servicesQuery.data &&
          (servicesQuery.data.services.length === 0 ? (
            <p className="text-muted-foreground">{t('services.list.empty')}</p>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="w-10 p-3" />
                    <th className="p-3 text-start font-medium">{t('services.list.code')}</th>
                    <th className="p-3 text-start font-medium">{t('services.list.name')}</th>
                    <th className="p-3 text-start font-medium">{t('services.list.department')}</th>
                    <th className="p-3 text-end font-medium">{t('services.list.fee')}</th>
                    <th className="p-3 text-start font-medium">{t('services.list.status')}</th>
                    <th className="p-3 text-end font-medium">{t('services.list.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {servicesQuery.data.services.map((service) => (
                    <ServiceRow
                      key={service.id}
                      service={service}
                      departmentName={departmentName(service.departmentId)}
                    />
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
      </section>
    </div>
  )
}

// --- Create ------------------------------------------------------------------

function CreateServiceForm({ departments }: { departments: DepartmentSummary[] }) {
  const { t } = useTranslation()
  const createService = useCreateService()

  const [departmentId, setDepartmentId] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [fee, setFee] = useState('')
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setDepartmentId('')
    setCode('')
    setName('')
    setFee('')
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const parsed = createServiceRequestSchema.safeParse({ departmentId, code, name, fee })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('services.create.invalid'))
      return
    }

    createService.mutate(parsed.data, {
      onSuccess: resetForm,
      onError: (err) => {
        setError(
          err instanceof ApiError && err.status === 409
            ? t('services.create.duplicate')
            : t('services.create.failed'),
        )
      },
    })
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t('services.create.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="s-department">{t('services.create.department')}</Label>
              <Select
                id="s-department"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                <option value="" disabled>
                  {t('services.create.departmentPlaceholder')}
                </option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-code">{t('services.create.code')}</Label>
              <Input id="s-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="s-name">{t('services.create.name')}</Label>
              <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-fee">
                {t('services.create.fee')} ({t('services.currency')})
              </Label>
              <Input
                id="s-fee"
                inputMode="decimal"
                dir="ltr"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={createService.isPending}>
            {createService.isPending ? t('services.create.submitting') : t('services.create.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// --- List row + inline fee/name editor ---------------------------------------

function ServiceRow({
  service,
  departmentName,
}: {
  service: ServiceSummary
  departmentName: string
}) {
  const { t } = useTranslation()
  const setActive = useSetServiceActive()
  const [isEditing, setIsEditing] = useState(false)

  return (
    <>
      <tr className="border-b border-border last:border-0">
        <td className="p-3">
          <button
            type="button"
            onClick={() => setIsEditing((v) => !v)}
            aria-expanded={isEditing}
            aria-label={t('services.edit.toggle')}
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                'size-4 transition-transform rtl:rotate-180',
                isEditing && 'rotate-90 rtl:rotate-90',
              )}
            />
          </button>
        </td>
        <td className="p-3 font-mono text-foreground">{service.code}</td>
        <td className="p-3 text-foreground">{service.name}</td>
        <td className="p-3 text-muted-foreground">{departmentName}</td>
        <td className="p-3 text-end font-mono text-foreground" dir="ltr">
          {service.fee}
        </td>
        <td className="p-3">
          <Badge variant={service.isActive ? 'active' : 'muted'}>
            {service.isActive ? t('services.list.active') : t('services.list.inactive')}
          </Badge>
        </td>
        <td className="p-3 text-end">
          <Button
            variant={service.isActive ? 'destructive' : 'outline'}
            size="sm"
            disabled={setActive.isPending}
            onClick={() => setActive.mutate({ id: service.id, isActive: !service.isActive })}
          >
            {service.isActive ? t('services.list.deactivate') : t('services.list.reactivate')}
          </Button>
        </td>
      </tr>
      {isEditing && (
        <tr className="border-b border-border last:border-0 bg-muted/30">
          <td />
          <td colSpan={6} className="p-3">
            <ServiceEditor service={service} onDone={() => setIsEditing(false)} />
          </td>
        </tr>
      )}
    </>
  )
}

function ServiceEditor({ service, onDone }: { service: ServiceSummary; onDone: () => void }) {
  const { t } = useTranslation()
  const updateService = useUpdateService()

  const [name, setName] = useState(service.name)
  const [fee, setFee] = useState(service.fee)
  const [error, setError] = useState<string | null>(null)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const parsed = updateServiceRequestSchema.safeParse({ name, fee })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('services.edit.invalid'))
      return
    }

    updateService.mutate(
      { id: service.id, input: parsed.data },
      { onSuccess: onDone, onError: () => setError(t('services.edit.failed')) },
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor={`s-name-${service.id}`} className="text-xs text-muted-foreground">
          {t('services.edit.name')}
        </Label>
        <Input
          id={`s-name-${service.id}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-56"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`s-fee-${service.id}`} className="text-xs text-muted-foreground">
          {t('services.edit.fee')} ({t('services.currency')})
        </Label>
        <Input
          id={`s-fee-${service.id}`}
          inputMode="decimal"
          dir="ltr"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          className="w-32"
        />
      </div>
      <Button type="submit" size="sm" disabled={updateService.isPending}>
        {updateService.isPending ? t('services.edit.saving') : t('services.edit.save')}
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}
