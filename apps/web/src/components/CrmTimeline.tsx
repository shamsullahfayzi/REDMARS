import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CRM_INTERACTION_CHANNELS,
  CRM_INTERACTION_DIRECTIONS,
  CRM_INTERACTION_OUTCOMES,
  crmTimelineSchema,
  crmInteractionDetailSchema,
  crmContactDetailSchema,
  createCrmInteractionSchema,
  correctCrmInteractionSchema,
  type CrmInteraction,
} from '@redmars/shared'
import { apiGet, apiPost, apiPut, serverMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
const control =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      {children}
    </label>
  )
}
function Select({
  label,
  value,
  onChange,
  values,
}: {
  label: string
  value: string
  onChange: (s: string) => void
  values: readonly string[]
}) {
  const { t } = useTranslation()
  return (
    <Field label={label}>
      <select
        className={control}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {values.map((v) => (
          <option key={v} value={v}>
            {t(`crmTimeline.values.${v}`)}
          </option>
        ))}
      </select>
    </Field>
  )
}
export function CrmTimeline({
  leadId = null,
  contactId = null,
}: {
  leadId?: string | null
  contactId?: string | null
}) {
  const { t } = useTranslation()
  const now = useNow()
  const [page, setPage] = useState(1),
    [channel, setChannel] = useState('all'),
    [direction, setDirection] = useState('all'),
    [adding, setAdding] = useState(false),
    [editing, setEditing] = useState<CrmInteraction | null>(null),
    [history, setHistory] = useState<string | null>(null)
  const subject = leadId ? `leadId=${leadId}` : `contactId=${contactId}`
  const query = useQuery({
    queryKey: ['crm', 'timeline', subject, page, channel, direction],
    queryFn: () =>
      apiGet(
        `/crm/timeline?${subject}&page=${page}&channel=${channel}&direction=${direction}`,
        crmTimelineSchema,
      ),
    retry: false,
    refetchInterval: 15000,
  })
  const reset = () => {
    setAdding(false)
    setEditing(null)
  }
  return (
    <section
      className="space-y-4 border-t pt-5"
      aria-label={t('crmTimeline.title')}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h4 className="me-auto font-semibold">{t('crmTimeline.title')}</h4>
        {query.data?.canWrite && (
          <Button
            variant="outline"
            onClick={() => {
              setEditing(null)
              setAdding(true)
            }}
          >
            {t('crmTimeline.add')}
          </Button>
        )}
        <Button variant="ghost" onClick={() => void query.refetch()}>
          {t('crmLeads.reload')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('crmTimeline.intro')}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <Select
          label={t('crmTimeline.channel')}
          value={channel}
          values={['all', ...CRM_INTERACTION_CHANNELS]}
          onChange={(s) => {
            setChannel(s)
            setPage(1)
          }}
        />
        <Select
          label={t('crmTimeline.direction')}
          value={direction}
          values={['all', ...CRM_INTERACTION_DIRECTIONS]}
          onChange={(s) => {
            setDirection(s)
            setPage(1)
          }}
        />
      </div>
      {query.isPending && <p role="status">{t('crm.loading')}</p>}
      {query.isError && <p role="alert">{t('crmTimeline.loadError')}</p>}
      {query.data &&
        !query.isError &&
        query.data.items.every(
          (item) => new Date(item.visibleUntil).getTime() > now,
        ) && (
          <>
            <ol className="space-y-3">
              {query.data.items.map((item) => (
                <li key={item.id} className="space-y-2 rounded border p-4">
                  <div className="flex flex-wrap gap-2 text-sm">
                    <strong>
                      {t(`crmTimeline.values.${item.channel}`)} ·{' '}
                      {t(`crmTimeline.values.${item.direction}`)}
                    </strong>
                    <span>
                      {new Date(item.occurredAt).toLocaleString()} ·{' '}
                      {item.actorName}
                    </span>
                  </div>
                  {item.patient && (
                    <p className="text-sm">
                      {item.patient.name} · {item.patient.mrn} ·{' '}
                      {t(`crmTimeline.values.${item.purpose}`)}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap text-sm">
                    {item.voided ? t('crmTimeline.withdrawn') : item.summary}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`crmTimeline.values.${item.outcome}`)} ·{' '}
                    {t('crmTimeline.recorded')}{' '}
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                  <div className="flex gap-2">
                    {query.data.canWrite && !item.voided && (
                      <Link
                        className="self-center text-sm text-primary underline"
                        to={`/crm?tab=tasks&interactionId=${item.id}`}
                      >
                        {t('crmTasks.add')}
                      </Link>
                    )}
                    {item.callId && (
                      <Link
                        className="self-center text-sm text-primary underline"
                        to={`/crm?tab=calls&callId=${item.callId}`}
                      >
                        {t('crmCalls.details')}
                      </Link>
                    )}
                    {item.canCorrect && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setAdding(false)
                          setEditing(item)
                        }}
                      >
                        {t('crmTimeline.correct')}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setHistory(history === item.id ? null : item.id)
                      }
                    >
                      {t('crmTimeline.history')} ({item.version + 1})
                    </Button>
                  </div>
                  {history === item.id && <RevisionHistory id={item.id} />}
                </li>
              ))}
            </ol>
            {!query.data.total && (
              <p className="text-sm text-muted-foreground">
                {t('crmTimeline.empty')}
              </p>
            )}
            <div className="flex items-center gap-3 text-sm">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('crmContacts.previous')}
              </Button>
              <span>
                {page} / {Math.max(1, Math.ceil(query.data.total / 25))} ·{' '}
                {query.data.total}
              </span>
              <Button
                variant="outline"
                disabled={page * 25 >= query.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('crmContacts.next')}
              </Button>
            </div>
          </>
        )}
      {(adding ||
        (editing &&
          new Date(editing.visibleUntil).getTime() > now &&
          !query.isError &&
          query.data?.items.some((item) => item.id === editing.id))) && (
        <InteractionForm
          key={editing?.id ?? 'new'}
          leadId={leadId}
          contactId={contactId}
          existing={editing}
          close={reset}
        />
      )}
    </section>
  )
}
function RevisionHistory({ id }: { id: string }) {
  const { t } = useTranslation()
  const now = useNow()
  const q = useQuery({
    queryKey: ['crm', 'timeline', 'history', id],
    queryFn: () => apiGet(`/crm/timeline/${id}`, crmInteractionDetailSchema),
    retry: false,
    refetchInterval: 15000,
  })
  return (
    <div className="space-y-2 border-t pt-3">
      {q.isPending && <p>{t('crm.loading')}</p>}
      {q.isError && <p role="alert">{t('crmTimeline.loadError')}</p>}
      {q.data &&
        !q.isError &&
        new Date(q.data.interaction.visibleUntil).getTime() > now &&
        q.data.revisions.map((r) => (
          <div key={r.version} className="text-xs">
            <strong>
              #{r.version + 1} · {r.actorName} ·{' '}
              {new Date(r.createdAt).toLocaleString()}
            </strong>
            <p className="whitespace-pre-wrap">{r.summary}</p>
            <p>
              {t(`crmTimeline.values.${r.outcome}`)}
              {r.voided ? ` · ${t('crmTimeline.withdrawn')}` : ''}
            </p>
            {r.reason && (
              <p>
                {t('crmTimeline.reason')}: {r.reason}
              </p>
            )}
          </div>
        ))}
    </div>
  )
}
function localNow() {
  const date = new Date()
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}
function InteractionForm({
  leadId,
  contactId,
  existing,
  close,
}: {
  leadId: string | null
  contactId: string | null
  existing: CrmInteraction | null
  close: () => void
}) {
  const { t } = useTranslation(),
    client = useQueryClient()
  const [original] = useState(existing)
  const [summary, setSummary] = useState(original?.summary ?? ''),
    [outcome, setOutcome] = useState(original?.outcome ?? 'information_given'),
    [channel, setChannel] = useState('call'),
    [direction, setDirection] = useState('inbound'),
    [when, setWhen] = useState(localNow),
    [linkId, setLinkId] = useState(''),
    [purpose, setPurpose] = useState('enquiry'),
    [reason, setReason] = useState(''),
    [voided, setVoided] = useState(false),
    [invalid, setInvalid] = useState(false),
    [key, setKey] = useState(() => crypto.randomUUID())
  const contact = useQuery({
    queryKey: ['crm', 'contacts', 'timeline-options', contactId],
    queryFn: () => apiGet(`/crm/contacts/${contactId}`, crmContactDetailSchema),
    enabled: !!contactId && !original,
    retry: false,
    refetchInterval: 15000,
  })
  const links =
    contact.data?.links.filter(
      (l) =>
        l.patient && ['scheduling', 'follow_up', 'both'].includes(l.authority),
    ) ?? []
  const authority = links.find((l) => l.id === linkId)?.authority
  const mutation = useMutation({
    mutationFn: (input: unknown) =>
      original
        ? apiPut(
            `/crm/timeline/${original.id}`,
            input,
            crmInteractionDetailSchema,
          )
        : apiPost('/crm/timeline', input, crmInteractionDetailSchema),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['crm', 'timeline'] })
      await client.invalidateQueries({ queryKey: ['crm', 'calls'] })
      await client.invalidateQueries({ queryKey: ['crm', 'call'] })
      close()
    },
  })
  const change = () => {
    setKey(crypto.randomUUID())
    mutation.reset()
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    const date = new Date(when)
    if (!original && Number.isNaN(date.getTime())) {
      setInvalid(true)
      return
    }
    const parsed = original
      ? correctCrmInteractionSchema.safeParse({
          summary,
          outcome,
          voided,
          reason,
          expectedVersion: original.version,
        })
      : createCrmInteractionSchema.safeParse({
          leadId,
          contactId,
          linkId: linkId || null,
          purpose,
          channel,
          direction,
          occurredAt: date.toISOString(),
          summary,
          outcome,
          idempotencyKey: key,
        })
    setInvalid(!parsed.success)
    if (parsed.success) mutation.mutate(parsed.data)
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded border p-4">
      <h5 className="font-semibold">
        {t(original ? 'crmTimeline.correct' : 'crmTimeline.add')}
      </h5>
      <p className="text-sm text-muted-foreground">
        {t('crmTimeline.privacy')}
      </p>
      <fieldset disabled={mutation.isPending} className="space-y-3">
        {!original && (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <Select
                label={t('crmTimeline.channel')}
                value={channel}
                values={CRM_INTERACTION_CHANNELS}
                onChange={(s) => {
                  setChannel(s)
                  change()
                }}
              />
              <Select
                label={t('crmTimeline.direction')}
                value={direction}
                values={CRM_INTERACTION_DIRECTIONS}
                onChange={(s) => {
                  setDirection(s)
                  change()
                }}
              />
            </div>
            <Field
              label={`${t('crmTimeline.when')} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`}
            >
              <Input
                type="datetime-local"
                required
                value={when}
                onChange={(e) => {
                  setWhen(e.target.value)
                  change()
                }}
              />
            </Field>
            <Field label={t('crmTimeline.patientScope')}>
              <select
                className={control}
                value={linkId}
                onChange={(e) => {
                  const id = e.target.value
                  setLinkId(id)
                  setPurpose(
                    id
                      ? links.find((l) => l.id === id)?.authority ===
                        'follow_up'
                        ? 'follow_up'
                        : 'scheduling'
                      : 'enquiry',
                  )
                  change()
                }}
              >
                <option value="">{t('crmTimeline.general')}</option>
                {links.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.patient!.name} · {l.patient!.mrn}
                  </option>
                ))}
              </select>
            </Field>
            {contactId && (
              <p className="text-xs text-muted-foreground">
                {t('crmTimeline.scopeHint')}
              </p>
            )}
            {contact.isError && (
              <p role="alert">{t('crmTimeline.scopeError')}</p>
            )}
            {linkId && (
              <Select
                label={t('crmTimeline.purpose')}
                value={purpose}
                values={
                  authority === 'both'
                    ? ['scheduling', 'follow_up']
                    : [authority === 'follow_up' ? 'follow_up' : 'scheduling']
                }
                onChange={(s) => {
                  setPurpose(s)
                  change()
                }}
              />
            )}
          </>
        )}
        <Field label={t('crmTimeline.summary')}>
          <textarea
            required
            minLength={3}
            maxLength={1000}
            className={control}
            value={summary}
            onChange={(e) => {
              setSummary(e.target.value)
              change()
            }}
          />
        </Field>
        <Select
          label={t('crmTimeline.outcome')}
          value={outcome}
          values={
            original?.callId ? [original.outcome] : CRM_INTERACTION_OUTCOMES
          }
          onChange={(s) => {
            setOutcome(s as typeof outcome)
            change()
          }}
        />
        {original && (
          <>
            <Field label={t('crmTimeline.reason')}>
              <textarea
                required
                minLength={3}
                maxLength={300}
                className={control}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={voided}
                onChange={(e) => setVoided(e.target.checked)}
              />
              {t('crmTimeline.withdraw')}
            </label>
            <p className="text-xs text-muted-foreground">
              {t('crmTimeline.correctionHint')}
            </p>
          </>
        )}
        {invalid && <p role="alert">{t('crmTimeline.invalid')}</p>}
        {mutation.isError && (
          <p role="alert" className="text-destructive">
            {serverMessage(mutation.error) ?? t('crmTimeline.saveError')}
          </p>
        )}
        <div className="flex gap-3">
          <Button type="submit">{t('crmTimeline.save')}</Button>
          <Button variant="outline" onClick={close}>
            {t('crmLeads.cancel')}
          </Button>
        </div>
      </fieldset>
    </form>
  )
}
