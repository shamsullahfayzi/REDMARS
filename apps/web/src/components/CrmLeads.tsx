import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CRM_LEAD_STATUSES,
  CRM_LEAD_SOURCES,
  CRM_LEAD_OUTCOMES,
  CRM_LEAD_TRANSITIONS,
  crmLeadListSchema,
  crmLeadDetailSchema,
  crmLeadOptionsSchema,
  crmContactListSchema,
  createCrmLeadSchema,
  updateCrmLeadSchema,
  type CrmLead,
  type CrmLeadOptions,
  type CrmLeadStatus,
  type CrmContact,
} from '@redmars/shared'
import { apiGet, apiPost, apiPut, ApiError, serverMessage } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CrmTimeline } from '@/components/CrmTimeline'
import { CrmPatientLink } from '@/components/CrmPatientLink'

const control =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  )
}
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly string[]
}) {
  const { t } = useTranslation()
  return (
    <Field label={label}>
      <select
        className={control}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((v) => (
          <option key={v} value={v}>
            {t(`crmLeads.values.${v}`)}
          </option>
        ))}
      </select>
    </Field>
  )
}
export function CrmLeads() {
  const { t } = useTranslation()
  const [q, setQ] = useState(''),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1)
  const [status, setStatus] = useState('all'),
    [source, setSource] = useState('all'),
    [owner, setOwner] = useState('all')
  const [selected, setSelected] = useState<string | null>(null),
    [creating, setCreating] = useState(false)
  const options = useQuery({
    queryKey: ['crm', 'leads', 'options'],
    queryFn: () => apiGet('/crm/leads/options', crmLeadOptionsSchema),
    retry: false,
  })
  const query = useQuery({
    queryKey: ['crm', 'leads', 'list', search, page, status, source, owner],
    queryFn: () =>
      apiGet(
        `/crm/leads?q=${encodeURIComponent(search)}&page=${page}&status=${status}&source=${source}&owner=${owner}`,
        crmLeadListSchema,
      ),
    retry: false,
  })
  const open = (id: string) => {
    setCreating(false)
    setSelected(id)
  }
  return (
    <section className="space-y-4" aria-label={t('crmLeads.title')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t('crmLeads.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('crmLeads.intro')}
          </p>
        </div>
        <Button
          disabled={!options.data}
          onClick={() => {
            setSelected(null)
            setCreating(true)
          }}
        >
          {t('crmLeads.new')}
        </Button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setSearch(q)
          setPage(1)
        }}
        className="flex gap-2"
      >
        <Input
          aria-label={t('crmLeads.search')}
          placeholder={t('crmLeads.searchHint')}
          value={q}
          maxLength={160}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit" variant="outline">
          {t('crmLeads.search')}
        </Button>
      </form>
      <div className="grid gap-3 md:grid-cols-3">
        <Select
          label={t('crmLeads.status')}
          value={status}
          onChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
          options={['all', ...CRM_LEAD_STATUSES]}
        />
        <Select
          label={t('crmLeads.source')}
          value={source}
          onChange={(v) => {
            setSource(v)
            setPage(1)
          }}
          options={['all', ...CRM_LEAD_SOURCES]}
        />
        <Field label={t('crmLeads.owner')}>
          <select
            className={control}
            value={owner}
            onChange={(e) => {
              setOwner(e.target.value)
              setPage(1)
            }}
          >
            {['all', 'mine', 'unassigned'].map((v) => (
              <option key={v} value={v}>
                {t(`crmLeads.values.${v}`)}
              </option>
            ))}
            {options.data?.canAssign &&
              options.data.owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </select>
        </Field>
      </div>
      {(query.isPending || options.isPending) && (
        <p role="status">{t('crm.loading')}</p>
      )}
      {(query.isError || options.isError) && (
        <p role="alert">
          {t('crmLeads.loadError')}{' '}
          <Button
            variant="outline"
            onClick={() => {
              void query.refetch()
              void options.refetch()
            }}
          >
            {t('crm.retry')}
          </Button>
        </p>
      )}
      {query.data && !query.isError && (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  {['inquiry', 'status', 'owner', 'source', 'service'].map(
                    (k) => (
                      <th className="p-3 text-start" key={k}>
                        {t(`crmLeads.${k}`)}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((l) => (
                  <tr
                    key={l.id}
                    className={`border-t ${selected === l.id ? 'bg-muted' : ''}`}
                  >
                    <td className="p-3">
                      <button
                        className="text-start font-medium text-primary underline underline-offset-4"
                        onClick={() => open(l.id)}
                      >
                        {l.title}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {l.contact?.name ?? t('crmLeads.anonymous')}
                      </p>
                    </td>
                    <td className="p-3">{t(`crmLeads.values.${l.status}`)}</td>
                    <td className="p-3">
                      {l.owner?.name ?? t('crmLeads.values.unassigned')}
                      {l.owner && !l.owner.active && (
                        <p className="text-xs text-destructive">
                          {t('crmLeads.inactive')}
                        </p>
                      )}
                    </td>
                    <td className="p-3">{t(`crmLeads.values.${l.source}`)}</td>
                    <td className="p-3">{l.serviceInterest || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!query.data.total && (
              <p className="p-6 text-muted-foreground">{t('crmLeads.empty')}</p>
            )}
          </div>
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
      {creating && options.data && (
        <LeadForm
          options={options.data}
          onSaved={open}
          onCancel={() => setCreating(false)}
        />
      )}
      {selected && options.data && (
        <LeadDetail
          key={selected}
          id={selected}
          options={options.data}
          onClose={() => setSelected(null)}
          onOpen={open}
        />
      )}
    </section>
  )
}

function LeadDetail({
  id,
  options,
  onClose,
  onOpen,
}: {
  id: string
  options: CrmLeadOptions
  onClose: () => void
  onOpen: (id: string) => void
}) {
  const { t } = useTranslation(),
    client = useQueryClient(),
    [editing, setEditing] = useState(false)
  const query = useQuery({
    queryKey: ['crm', 'leads', 'detail', id],
    queryFn: () => apiGet(`/crm/leads/${id}`, crmLeadDetailSchema),
    retry: false,
  })
  const claim = useMutation({
    mutationFn: (version: number) =>
      apiPost(
        `/crm/leads/${id}/claim`,
        { expectedVersion: version },
        crmLeadDetailSchema,
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['crm', 'leads'] }),
  })
  const d = query.data
  if (query.isPending) return <p role="status">{t('crm.loading')}</p>
  if (!d || query.isError)
    return (
      <p role="alert">
        {t('crmLeads.loadError')}{' '}
        <Button onClick={() => void query.refetch()}>{t('crm.retry')}</Button>
      </p>
    )
  if (editing)
    return (
      <LeadForm
        lead={d.lead}
        options={options}
        onCancel={() => setEditing(false)}
        onSaved={(leadId) => {
          setEditing(false)
          onOpen(leadId)
        }}
      />
    )
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="me-auto text-lg font-semibold">{d.lead.title}</h3>
        {d.lead.canClaim && (
          <Button
            disabled={claim.isPending}
            onClick={() => claim.mutate(d.lead.version)}
          >
            {t('crmLeads.claim')}
          </Button>
        )}
        {d.lead.canEdit && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            {t(
              d.lead.status === 'closed' ? 'crmLeads.reopen' : 'crmLeads.edit',
            )}
          </Button>
        )}
        <Button variant="outline" onClick={() => void query.refetch()}>
          {t('crmLeads.reload')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('crmContacts.close')}
        </Button>
      </div>
      {claim.isError && (
        <p role="alert">
          {serverMessage(claim.error) ?? t('crmLeads.saveError')}
        </p>
      )}
      <CrmPatientLink key={id} leadId={id} />
      <div className="grid gap-3 text-sm md:grid-cols-3">
        <p>
          {t('crmLeads.status')}:{' '}
          <strong>{t(`crmLeads.values.${d.lead.status}`)}</strong>
        </p>
        <p>
          {t('crmLeads.owner')}:{' '}
          {d.lead.owner?.name ?? t('crmLeads.values.unassigned')}
        </p>
        <p>
          {t('crmLeads.source')}: {t(`crmLeads.values.${d.lead.source}`)}{' '}
          {d.lead.sourceDetail && `· ${d.lead.sourceDetail}`}
        </p>
        <p>
          {t('crmLeads.service')}: {d.lead.serviceInterest || '—'}
        </p>
        <p>
          {t('crmLeads.contact')}:{' '}
          {d.lead.contact?.name ?? t('crmLeads.anonymous')}
        </p>
        {d.lead.closedReason && (
          <p>
            {t('crmLeads.outcome')}:{' '}
            {t(`crmLeads.values.${d.lead.closedReason}`)}
          </p>
        )}
      </div>
      {d.lead.contact?.doNotContact && (
        <p className="text-destructive">{t('crmContacts.doNotContact')}</p>
      )}
      {d.lead.contact?.archived && (
        <p className="text-destructive">{t('crmLeads.archivedContact')}</p>
      )}
      <div className="rounded border p-3 text-sm">
        <h4 className="font-semibold">{t('crmLeads.qualification')}</h4>
        <p>
          {t('crmLeads.needsConfirmed')}:{' '}
          {t(`crmLeads.values.${d.lead.needsConfirmed ? 'yes' : 'no'}`)}
        </p>
        <p>
          {t('crmLeads.serviceMatched')}:{' '}
          {t(`crmLeads.values.${d.lead.serviceMatched ? 'yes' : 'no'}`)}
        </p>
        <p className="whitespace-pre-wrap">{d.lead.qualificationNotes}</p>
        <p className="mt-2 text-muted-foreground">
          {t('crmLeads.qualificationHint')}
        </p>
      </div>
      <CrmTimeline leadId={d.lead.id} contactId={d.lead.contactId} />
      {d.lead.contactId && (
        <Link
          className="text-primary underline"
          to={`/crm?tab=appointments&contactId=${d.lead.contactId}&leadId=${d.lead.id}`}
        >
          {t('crmAppointments.title')}
        </Link>
      )}
      <details>
        <summary className="cursor-pointer font-semibold">
          {t('crmLeads.history')} ({d.history.length})
        </summary>
        <ol className="mt-3 space-y-3 text-sm">
          {d.history.map((h) => (
            <li key={h.id} className="border-t pt-2">
              <strong>
                {h.fromStatus
                  ? `${t(`crmLeads.values.${h.fromStatus}`)} → `
                  : ''}
                {t(`crmLeads.values.${h.toStatus}`)}
              </strong>{' '}
              · {h.actorName} · {new Date(h.createdAt).toLocaleString()}
              <p className="whitespace-pre-wrap">
                {CRM_LEAD_OUTCOMES.includes(
                  h.reason as (typeof CRM_LEAD_OUTCOMES)[number],
                )
                  ? t(`crmLeads.values.${h.reason}`)
                  : h.reason}
              </p>
            </li>
          ))}
        </ol>
      </details>
    </Card>
  )
}

function LeadForm({
  lead,
  options,
  onSaved,
  onCancel,
}: {
  lead?: CrmLead
  options: CrmLeadOptions
  onSaved: (id: string) => void
  onCancel: () => void
}) {
  const { t } = useTranslation(),
    client = useQueryClient()
  const [data, setData] = useState({
    title: lead?.title ?? '',
    contactId: lead?.contactId ?? null,
    ownerId: lead ? lead.ownerId : options.currentUserId,
    serviceInterest: lead?.serviceInterest ?? '',
    needsConfirmed: lead?.needsConfirmed ?? false,
    serviceMatched: lead?.serviceMatched ?? false,
    qualificationNotes: lead?.qualificationNotes ?? '',
  })
  const [source, setSource] = useState(lead?.source ?? 'phone'),
    [sourceDetail, setSourceDetail] = useState(lead?.sourceDetail ?? '')
  const [status, setStatus] = useState<CrmLeadStatus>(
      lead?.status === 'closed' ? 'new' : (lead?.status ?? 'new'),
    ),
    [outcome, setOutcome] = useState('resolved'),
    [reason, setReason] = useState('')
  const [contactName, setContactName] = useState(lead?.contact?.name ?? ''),
    [q, setQ] = useState(''),
    [search, setSearch] = useState('')
  const [reviewed, setReviewed] = useState(false),
    [candidates, setCandidates] = useState<{ id: string; title: string }[]>([]),
    [invalid, setInvalid] = useState(false)
  const [key, setKey] = useState(() => crypto.randomUUID())
  const [expectedVersion] = useState(lead?.version)
  const contacts = useQuery({
    queryKey: ['crm', 'contacts', 'lead-picker', search],
    queryFn: () =>
      apiGet(
        `/crm/contacts?q=${encodeURIComponent(search)}`,
        crmContactListSchema,
      ),
    enabled: search.length >= 2,
    retry: false,
  })
  const mutation = useMutation({
    mutationFn: (input: unknown) =>
      lead
        ? apiPut(`/crm/leads/${lead.id}`, input, crmLeadDetailSchema)
        : apiPost('/crm/leads', input, crmLeadDetailSchema),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ['crm', 'leads'] })
      onSaved(result.lead.id)
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        const body = e.body as { candidates?: { id: string; title: string }[] }
        if (Array.isArray(body?.candidates)) setCandidates(body.candidates)
      }
    },
  })
  const changed = () => {
    setKey(crypto.randomUUID())
    setReviewed(false)
    setCandidates([])
    mutation.reset()
  }
  const set = (k: string, value: string | boolean | null) => {
    setData((d) => ({ ...d, [k]: value }))
    changed()
  }
  const choose = (c: CrmContact) => {
    set('contactId', c.id)
    setContactName(c.name)
    setSearch('')
    setQ('')
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = lead
      ? updateCrmLeadSchema.safeParse({
          ...data,
          status,
          closedReason: status === 'closed' ? outcome : null,
          changeReason: reason,
          expectedVersion,
          duplicateReviewed: reviewed,
        })
      : createCrmLeadSchema.safeParse({
          ...data,
          source,
          sourceDetail,
          duplicateReviewed: reviewed,
          idempotencyKey: key,
        })
    setInvalid(!parsed.success || (lead?.status === 'closed' && !reason.trim()))
    if (parsed.success && !(lead?.status === 'closed' && !reason.trim()))
      mutation.mutate(parsed.data)
  }
  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-4">
        <h3 className="text-lg font-semibold">
          {t(
            lead?.status === 'closed'
              ? 'crmLeads.reopen'
              : lead
                ? 'crmLeads.edit'
                : 'crmLeads.new',
          )}
        </h3>
        <p className="text-sm text-muted-foreground">{t('crmLeads.privacy')}</p>
        <fieldset disabled={mutation.isPending} className="space-y-4">
          <Field label={t('crmLeads.inquiry')}>
            <Input
              required
              minLength={3}
              maxLength={160}
              value={data.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={t('crmLeads.service')}>
              <Input
                list="crm-service-options"
                maxLength={100}
                value={data.serviceInterest}
                onChange={(e) => set('serviceInterest', e.target.value)}
              />
              <datalist id="crm-service-options">
                {options.serviceAreas.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label={t('crmLeads.owner')}>
              <select
                className={control}
                disabled={!options.canAssign}
                value={data.ownerId ?? ''}
                onChange={(e) => set('ownerId', e.target.value || null)}
              >
                <option value="">{t('crmLeads.values.unassigned')}</option>
                {options.owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
                {lead?.owner &&
                  !options.owners.some((o) => o.id === lead.ownerId) && (
                    <option value={lead.owner.id}>
                      {lead.owner.name} · {t('crmLeads.unavailableOwner')}
                    </option>
                  )}
              </select>
            </Field>
          </div>
          {lead ? (
            <p className="text-sm">
              {t('crmLeads.source')}: {t(`crmLeads.values.${source}`)} ·{' '}
              {sourceDetail || '—'}{' '}
              <span className="text-muted-foreground">
                ({t('crmLeads.sourceRetained')})
              </span>
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <Select
                label={t('crmLeads.source')}
                value={source}
                onChange={(v) => {
                  setSource(v as typeof source)
                  changed()
                }}
                options={CRM_LEAD_SOURCES}
              />
              <Field label={t('crmLeads.sourceDetail')}>
                <Input
                  maxLength={120}
                  value={sourceDetail}
                  onChange={(e) => {
                    setSourceDetail(e.target.value)
                    changed()
                  }}
                />
              </Field>
            </div>
          )}
          <div className="space-y-2 rounded border p-3">
            <h4 className="text-sm font-medium">{t('crmLeads.contact')}</h4>
            <p className="text-sm">
              {data.contactId ? contactName : t('crmLeads.anonymous')}
            </p>
            {data.contactId && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  set('contactId', null)
                  setContactName('')
                }}
              >
                {t('crmLeads.clearContact')}
              </Button>
            )}
            <div className="flex gap-2">
              <Input
                aria-label={t('crmLeads.findContact')}
                placeholder={t('crmContacts.searchHint')}
                maxLength={120}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={q.trim().length < 2}
                onClick={() => setSearch(q.trim())}
              >
                {t('crmLeads.findContact')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('crmLeads.contactHint')}
            </p>
            {search && contacts.isPending && <p>{t('crm.loading')}</p>}
            {contacts.isError && <p role="alert">{t('crm.loadError')}</p>}
            {search && contacts.data && (
              <div className="flex flex-wrap gap-2">
                {contacts.data.items.map((c) => (
                  <Button
                    type="button"
                    variant="outline"
                    key={c.id}
                    onClick={() => choose(c)}
                  >
                    {c.name} · {c.phone || c.email || '—'}
                  </Button>
                ))}
                {!contacts.data.total && <p>{t('crmContacts.empty')}</p>}
              </div>
            )}
          </div>
          {lead && (
            <Select
              label={t('crmLeads.status')}
              value={status}
              onChange={(v) => {
                setStatus(v as CrmLeadStatus)
                changed()
              }}
              options={
                lead.status === 'closed'
                  ? ['new']
                  : [lead.status, ...CRM_LEAD_TRANSITIONS[lead.status]]
              }
            />
          )}
          <div className="space-y-2 rounded border p-3">
            <h4 className="font-medium">{t('crmLeads.qualification')}</h4>
            <p className="text-xs text-muted-foreground">
              {t('crmLeads.qualificationHint')}
            </p>
            {(['needsConfirmed', 'serviceMatched'] as const).map((k) => (
              <label className="flex items-start gap-2 text-sm" key={k}>
                <input
                  type="checkbox"
                  checked={data[k]}
                  onChange={(e) => set(k, e.target.checked)}
                />
                {t(`crmLeads.${k}`)}
              </label>
            ))}
            <Field label={t('crmLeads.notes')}>
              <textarea
                className={control}
                maxLength={500}
                value={data.qualificationNotes}
                onChange={(e) => set('qualificationNotes', e.target.value)}
              />
            </Field>
          </div>
          {status === 'closed' && (
            <Select
              label={t('crmLeads.outcome')}
              value={outcome}
              onChange={(v) => {
                setOutcome(v)
                changed()
              }}
              options={CRM_LEAD_OUTCOMES}
            />
          )}
          {lead && status !== lead.status && (
            <Field
              label={t(
                lead.status === 'closed'
                  ? 'crmLeads.reopenReason'
                  : 'crmLeads.changeReason',
              )}
            >
              <textarea
                className={control}
                maxLength={300}
                required={lead.status === 'closed'}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  changed()
                }}
              />
            </Field>
          )}
          {!!candidates.length && (
            <div
              role="alert"
              className="space-y-2 rounded border border-amber-500 p-3"
            >
              <p>{t('crmLeads.duplicateHint')}</p>
              {candidates.map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  variant="link"
                  onClick={() => onSaved(c.id)}
                >
                  {c.title}
                </Button>
              ))}
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => {
                    setReviewed(e.target.checked)
                    setKey(crypto.randomUUID())
                  }}
                />
                {t('crmLeads.reviewed')}
              </label>
            </div>
          )}
          {invalid && (
            <p role="alert" className="text-destructive">
              {t('crmLeads.invalid')}
            </p>
          )}
          {mutation.isError && (
            <p role="alert" className="text-destructive">
              {serverMessage(mutation.error) ?? t('crmLeads.saveError')}
            </p>
          )}
          <div className="flex gap-3">
            <Button type="submit" disabled={!!candidates.length && !reviewed}>
              {t('crmLeads.save')}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              {t('crmLeads.cancel')}
            </Button>
          </div>
        </fieldset>
      </form>
    </Card>
  )
}
