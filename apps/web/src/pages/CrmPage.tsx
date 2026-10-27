import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Headset, Settings2, ShieldCheck } from 'lucide-react'
import {
  crmWorkspaceSchema,
  crmSettingsResponseSchema,
  updateCrmSettingsSchema,
  type CrmSettingsResponse,
  type UpdateCrmSettings,
} from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { ApiError, apiGet, apiPut } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CrmContacts } from '@/components/CrmContacts'
import { CrmLeads } from '@/components/CrmLeads'
import { CrmCalls } from '@/components/CrmCalls'
import { CrmTasks } from '@/components/CrmTasks'
import { CrmAppointments } from '@/components/CrmAppointments'

export function CrmPage() {
  const { t } = useTranslation()
  const { roles } = useAuth()
  const [params, setParams] = useSearchParams()
  const section = [
    'contacts',
    'workspace',
    'calls',
    'tasks',
    'appointments',
  ].includes(params.get('tab') ?? '')
    ? params.get('tab')
    : 'leads'
  const query = useQuery({
    queryKey: ['crm', 'workspace'],
    queryFn: () => apiGet('/crm/workspace', crmWorkspaceSchema),
    retry: false,
  })
  const [reload, setReload] = useState(0)
  const data = query.data
  return (
    <div className="space-y-6">
      <PageHeader
        title={data?.settings.workspaceName ?? t('nav.crm')}
        description={t('crm.subtitle')}
      />
      {query.isPending && <p role="status">{t('crm.loading')}</p>}
      {query.isError && (
        <Card className="space-y-3 p-6">
          <p role="alert">
            {t(
              query.error instanceof ApiError && query.error.status === 403
                ? 'crm.unavailable'
                : 'crm.loadError',
            )}
          </p>
          {roles.includes('admin') && (
            <Link className="text-primary underline" to="/modules">
              {t('crm.manageModules')}
            </Link>
          )}
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t('crm.retry')}
          </Button>
        </Card>
      )}
      {data && !query.isError && (
        <>
          <nav className="flex flex-wrap gap-2" aria-label={t('nav.crm')}>
            {(
              [
                'leads',
                'contacts',
                'calls',
                'tasks',
                'appointments',
                'workspace',
              ] as const
            ).map((tab) => (
              <Button
                key={tab}
                variant={section === tab ? 'default' : 'outline'}
                aria-pressed={section === tab}
                onClick={() => setParams({ tab })}
              >
                {t(`crmLeads.tabs.${tab}`)}
              </Button>
            ))}
          </nav>
          {section === 'leads' && <CrmLeads />}
          {section === 'contacts' && <CrmContacts />}
          {section === 'appointments' && <CrmAppointments />}
          {section === 'tasks' && (
            <CrmTasks escalation={data.settings.escalationContact} />
          )}
          {section === 'calls' && (
            <CrmCalls
              escalation={data.settings.escalationContact}
              instructions={data.settings.safeContactInstructions}
            />
          )}
          {section === 'workspace' && (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="gap-2 p-5">
                  <Headset className="size-5 text-primary" />
                  <h2 className="font-semibold">{t('crm.workspace')}</h2>
                  <p className="text-sm text-muted-foreground">
                    {data.facilityName}
                  </p>
                  <p className="text-sm">{data.timezone}</p>
                </Card>
                <Card className="gap-2 p-5">
                  <ShieldCheck className="size-5 text-primary" />
                  <h2 className="font-semibold">{t('crm.access')}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      data.canConfigure ? 'crm.adminAccess' : 'crm.agentAccess',
                    )}
                  </p>
                </Card>
                <Card className="gap-2 p-5">
                  <Settings2 className="size-5 text-primary" />
                  <h2 className="font-semibold">{t('crm.nextTitle')}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t('crm.nextDescription')}
                  </p>
                </Card>
              </div>
              <Card className="space-y-3 p-6">
                <h2 className="font-semibold">{t('crm.guidance')}</h2>
                <p className="text-sm text-muted-foreground">
                  {t('crm.privacy')}
                </p>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="font-medium">{t('crm.serviceAreas')}</dt>
                    <dd>
                      {data.settings.serviceAreas.join(' · ') ||
                        t('crm.notConfigured')}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium">
                      {t('crm.escalationContact')}
                    </dt>
                    <dd className="whitespace-pre-wrap">
                      {data.settings.escalationContact ||
                        t('crm.escalationMissing')}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium">
                      {t('crm.safeContactInstructions')}
                    </dt>
                    <dd className="whitespace-pre-wrap">
                      {data.settings.safeContactInstructions ||
                        t('crm.notConfigured')}
                    </dd>
                  </div>
                </dl>
                <Link
                  to="/follow-ups"
                  className="text-sm text-primary underline"
                >
                  {t('crm.existingFollowUps')}
                </Link>
              </Card>
              {data.canConfigure && (
                <CrmSettingsForm
                  key={reload}
                  settings={data.settings}
                  onReload={async () => {
                    await query.refetch()
                    setReload((value) => value + 1)
                  }}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

function CrmSettingsForm({
  settings,
  onReload,
}: {
  settings: CrmSettingsResponse
  onReload: () => Promise<void>
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [name, setName] = useState(settings.workspaceName)
  const [retention, setRetention] = useState(settings.interactionRetentionDays)
  const [areas, setAreas] = useState(settings.serviceAreas.join('\n'))
  const [escalation, setEscalation] = useState(settings.escalationContact)
  const [instructions, setInstructions] = useState(
    settings.safeContactInstructions,
  )
  const [invalid, setInvalid] = useState(false)
  const [version, setVersion] = useState(settings.version)
  const mutation = useMutation({
    mutationFn: (input: UpdateCrmSettings) =>
      apiPut('/crm/settings', input, crmSettingsResponseSchema),
    onSuccess: async (result) => {
      setVersion(result.version)
      await client.invalidateQueries({ queryKey: ['crm', 'workspace'] })
    },
  })
  function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = updateCrmSettingsSchema.safeParse({
      workspaceName: name,
      serviceAreas: areas
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean),
      escalationContact: escalation,
      safeContactInstructions: instructions,
      expectedVersion: version,
      interactionRetentionDays: retention,
    })
    setInvalid(!parsed.success)
    if (parsed.success) mutation.mutate(parsed.data)
  }
  const conflict =
    mutation.error instanceof ApiError && mutation.error.status === 409
  const textAreaClass =
    'min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  return (
    <Card className="max-w-3xl space-y-4 p-6">
      <h2 className="font-semibold">{t('crm.settings')}</h2>
      <p className="text-sm text-muted-foreground">{t('crm.settingsHint')}</p>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={mutation.isPending} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="crm-retention">{t('crmTimeline.retention')}</Label>
            <Input
              id="crm-retention"
              type="number"
              min={30}
              max={3650}
              required
              value={retention}
              onChange={(e) => setRetention(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              {t('crmTimeline.retentionHint')}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="crm-name">{t('crm.workspaceName')}</Label>
            <Input
              id="crm-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="crm-areas">{t('crm.serviceAreas')}</Label>
            <p className="text-xs text-muted-foreground">
              {t('crm.areasHint')}
            </p>
            <textarea
              id="crm-areas"
              className={textAreaClass}
              value={areas}
              onChange={(e) => setAreas(e.target.value)}
              maxLength={1619}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="crm-escalation">{t('crm.escalationContact')}</Label>
            <Input
              id="crm-escalation"
              value={escalation}
              onChange={(e) => setEscalation(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="crm-instructions">
              {t('crm.safeContactInstructions')}
            </Label>
            <textarea
              id="crm-instructions"
              className={textAreaClass}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={500}
            />
          </div>
        </fieldset>
        {invalid && (
          <p role="alert" className="text-sm text-destructive">
            {t('crm.invalid')}
          </p>
        )}
        {mutation.isSuccess && (
          <p role="status" className="text-sm text-success">
            {t('crm.saved')}
          </p>
        )}
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {t(
              conflict
                ? 'crm.conflict'
                : mutation.error instanceof ApiError &&
                    mutation.error.status === 429
                  ? 'crm.rateLimited'
                  : 'crm.saveError',
            )}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={mutation.isPending || conflict}>
            {t(mutation.isPending ? 'crm.saving' : 'crm.save')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => void onReload()}
          >
            {t('crm.reload')}
          </Button>
        </div>
      </form>
    </Card>
  )
}
