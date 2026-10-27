import { useEffect, useState, type ReactNode, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CRM_CALL_STATES,
  CRM_CALL_ACTIONS,
  CRM_INTERACTION_OUTCOMES,
  crmCallListSchema,
  crmCallDetailSchema,
  createCrmCallSchema,
  completeCrmCallSchema,
  crmContactListSchema,
  crmContactDetailSchema,
  crmLeadListSchema,
  crmInteractionDetailSchema,
  correctCrmInteractionSchema,
  type CrmCall,
  type CreateCrmCall,
} from '@redmars/shared'
import { apiGet, apiPost, apiPut, serverMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
const control =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      {children}
    </label>
  )
}
function Choice({
  label,
  value,
  values,
  onChange,
}: {
  label: string
  value: string
  values: readonly string[]
  onChange: (v: string) => void
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
            {t(`crmCalls.values.${v}`, {
              defaultValue: t(`crmTimeline.values.${v}`),
            })}
          </option>
        ))}
      </select>
    </Field>
  )
}
function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}
const localTime = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}
export function CrmCalls({
  escalation,
  instructions,
}: {
  escalation: string
  instructions: string
}) {
  const [params] = useSearchParams()
  const { t } = useTranslation(),
    now = useNow(),
    client = useQueryClient()
  const [page, setPage] = useState(1),
    [q, setQ] = useState(''),
    [search, setSearch] = useState(''),
    [state, setState] = useState('all'),
    [direction, setDirection] = useState('all'),
    [pending, setPending] = useState('all'),
    [selected, setSelected] = useState<string | null>(params.get('callId')),
    [adding, setAdding] = useState(false),
    [callback, setCallback] = useState<CrmCall | null>(null)
  const query = useQuery({
    queryKey: ['crm', 'calls', page, search, state, direction, pending],
    queryFn: () =>
      apiGet(
        `/crm/calls?${new URLSearchParams({ page: String(page), q: search, state, direction, pending })}`,
        crmCallListSchema,
      ),
    retry: false,
    refetchInterval: 15000,
  })
  const saved = async (id: string) => {
    setAdding(false)
    setCallback(null)
    setSelected(id)
    await client.invalidateQueries({ queryKey: ['crm'] })
  }
  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-slate-900">
        <strong>{t('crm.escalationContact')}</strong>
        <p className="whitespace-pre-wrap">
          {escalation || t('crm.escalationMissing')}
        </p>
        <p>{t('crmCalls.safety')}</p>
      </div>
      <p className="text-sm text-muted-foreground">{t('crmCalls.intro')}</p>
      {instructions && (
        <p className="whitespace-pre-wrap text-sm">{instructions}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {query.data?.canWrite && (
          <Button
            onClick={() => {
              setCallback(null)
              setAdding(true)
              setSelected(null)
            }}
          >
            {t('crmCalls.add')}
          </Button>
        )}
        <Button
          variant="outline"
          aria-pressed={pending === 'pending'}
          onClick={() => {
            setPending('pending')
            setPage(1)
          }}
        >
          {t('crmCalls.queue')}
        </Button>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {t('crmLeads.reload')}
        </Button>
        {query.data?.canViewFollowUps && (
          <Link
            className="self-center text-sm text-primary underline"
            to="/follow-ups"
          >
            {t('crm.existingFollowUps')}
          </Link>
        )}
      </div>
      {adding &&
        (!callback || Date.parse(callback.interaction.visibleUntil) > now) && (
          <CallForm
            key={callback?.id ?? 'new'}
            callback={callback}
            onCancel={() => {
              setAdding(false)
              setCallback(null)
            }}
            onSaved={saved}
          />
        )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setSearch(q)
          setPage(1)
        }}
      >
        <Input
          aria-label={t('crmCalls.search')}
          placeholder={t('crmCalls.search')}
          value={q}
          maxLength={100}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit" variant="outline">
          {t('crmCalls.find')}
        </Button>
      </form>
      <div className="grid gap-3 md:grid-cols-3">
        <Choice
          label={t('crmCalls.state')}
          value={state}
          values={['all', ...CRM_CALL_STATES]}
          onChange={(v) => {
            setState(v)
            setPage(1)
          }}
        />
        <Choice
          label={t('crmTimeline.direction')}
          value={direction}
          values={['all', 'inbound', 'outbound']}
          onChange={(v) => {
            setDirection(v)
            setPage(1)
          }}
        />
        <Choice
          label={t('crmCalls.actionStatus')}
          value={pending}
          values={['all', 'pending', 'completed']}
          onChange={(v) => {
            setPending(v)
            setPage(1)
          }}
        />
      </div>
      {query.isPending && <p role="status">{t('crm.loading')}</p>}
      {query.isError && <p role="alert">{t('crm.loadError')}</p>}
      {query.data &&
        !query.isError &&
        query.data.items.every(
          (c) => Date.parse(c.interaction.visibleUntil) > now,
        ) && (
          <>
            {!query.data.items.length && <p>{t('crmCalls.empty')}</p>}
            <ol className="space-y-2">
              {query.data.items.map((c) => (
                <li key={c.id} className="rounded-lg border p-4 space-y-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <strong>
                      <bdi dir="ltr">
                        {c.callerPhone || t('crmCalls.unknownPhone')}
                      </bdi>{' '}
                      · {t(`crmCalls.values.${c.state}`)}
                    </strong>
                    <span className="text-sm">
                      {new Date(c.interaction.occurredAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm">
                    {t(`crmTimeline.values.${c.interaction.direction}`)} ·{' '}
                    {t(
                      `crmCalls.values.${c.completedAt ? 'completed' : 'pending'}`,
                    )}{' '}
                    · {t(`crmCalls.values.${c.nextAction}`)}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">
                    {c.interaction.summary}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelected(c.id)
                      setAdding(false)
                    }}
                  >
                    {t('crmCalls.details')}
                  </Button>
                </li>
              ))}
            </ol>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                {t('crmCalls.previous')}
              </Button>
              <span>
                {page} · {query.data.total} {t('crmCalls.records')}
              </span>
              <Button
                variant="outline"
                disabled={page * 25 >= query.data.total}
                onClick={() => setPage(page + 1)}
              >
                {t('crmCalls.next')}
              </Button>
            </div>
          </>
        )}
      {selected && (
        <CallDetail
          key={selected}
          id={selected}
          canWrite={query.data?.canWrite ?? false}
          onClose={() => setSelected(null)}
          onCallback={(c) => {
            setCallback(c)
            setSelected(null)
            setAdding(true)
          }}
        />
      )}
    </section>
  )
}
function CallForm({
  callback,
  onCancel,
  onSaved,
}: {
  callback: CrmCall | null
  onCancel: () => void
  onSaved: (id: string) => Promise<void>
}) {
  const { t } = useTranslation(),
    now = useNow()
  const [subject, setSubject] = useState(
      callback?.interaction.leadId
        ? 'lead'
        : callback?.interaction.contactId
          ? 'contact'
          : 'unknown',
    ),
    [search, setSearch] = useState(''),
    [searchTerm, setSearchTerm] = useState(''),
    [leadId, setLeadId] = useState<string | null>(
      callback?.interaction.leadId ?? null,
    ),
    [contactId, setContactId] = useState<string | null>(
      callback?.interaction.contactId ?? null,
    ),
    [linkId, setLinkId] = useState<string | null>(
      callback?.interaction.linkId ?? null,
    ),
    [purpose, setPurpose] = useState(
      callback?.interaction.purpose ?? 'enquiry',
    ),
    [phone, setPhone] = useState(callback?.callerPhone ?? ''),
    [direction, setDirection] = useState(callback ? 'outbound' : 'inbound'),
    [state, setState] = useState('answered'),
    [started, setStarted] = useState(localTime),
    [ended, setEnded] = useState(localTime),
    [summary, setSummary] = useState(''),
    [outcome, setOutcome] = useState('information_given'),
    [action, setAction] = useState('none'),
    [actionNote, setActionNote] = useState(''),
    [invalid, setInvalid] = useState(false),
    [key, setKey] = useState(() => crypto.randomUUID())
  const contacts = useQuery({
    queryKey: ['crm', 'callContacts', searchTerm],
    queryFn: () =>
      apiGet(
        `/crm/contacts?q=${encodeURIComponent(searchTerm)}`,
        crmContactListSchema,
      ),
    enabled: subject === 'contact' && !callback,
    retry: false,
  })
  const leads = useQuery({
    queryKey: ['crm', 'callLeads', searchTerm],
    queryFn: () =>
      apiGet(
        `/crm/leads?q=${encodeURIComponent(searchTerm)}`,
        crmLeadListSchema,
      ),
    enabled: subject === 'lead' && !callback,
    retry: false,
  })
  const detail = useQuery({
    queryKey: ['crm', 'contact', contactId],
    queryFn: () => apiGet(`/crm/contacts/${contactId}`, crmContactDetailSchema),
    enabled: !!contactId,
    retry: false,
    refetchInterval: 15000,
  })
  const visibleLinks = detail.isError
    ? []
    : (detail.data?.links.filter(
        (l) =>
          l.patient &&
          (detail.data.canAuthorize ||
            (!!l.verifiedUntil && Date.parse(l.verifiedUntil) > now)),
      ) ?? [])
  const eligibility = detail.data?.eligibility.find(
    (e) => e.linkId === linkId && e.channel === 'call' && e.purpose === purpose,
  )
  const mutation = useMutation({
    mutationFn: (input: CreateCrmCall) =>
      apiPost('/crm/calls', input, crmCallDetailSchema),
    onSuccess: (r) => onSaved(r.call.id),
  })
  function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = createCrmCallSchema.safeParse({
      leadId,
      contactId,
      linkId,
      purpose,
      callerPhone: phone,
      direction,
      state,
      occurredAt: started ? new Date(started).toISOString() : '',
      endedAt:
        state === 'answered' && ended ? new Date(ended).toISOString() : null,
      summary,
      outcome: state === 'answered' ? outcome : 'no_response',
      nextAction: action,
      actionNote,
      relatedCallId: callback?.id ?? null,
      idempotencyKey: key,
    })
    const missing =
      (subject === 'contact' && !contactId) ||
      (subject === 'lead' && !leadId) ||
      (linkId && !visibleLinks.some((l) => l.id === linkId))
    setInvalid(!parsed.success || !!missing)
    if (parsed.success && !missing) mutation.mutate(parsed.data)
  }
  return (
    <form
      className="rounded-lg border bg-card p-5 space-y-4"
      onSubmit={submit}
      onChange={() => {
        setKey(crypto.randomUUID())
        mutation.reset()
      }}
    >
      <h3 className="font-semibold">
        {t(callback ? 'crmCalls.callback' : 'crmCalls.add')}
      </h3>
      <p className="text-sm text-muted-foreground">{t('crmCalls.identity')}</p>
      <fieldset disabled={mutation.isPending} className="space-y-4">
        {!callback && (
          <>
            <Choice
              label={t('crmCalls.subject')}
              value={subject}
              values={['unknown', 'contact', 'lead']}
              onChange={(v) => {
                setSubject(v)
                setContactId(null)
                setLeadId(null)
                setLinkId(null)
                setPurpose('enquiry')
                setSearch('')
                setSearchTerm('')
              }}
            />
            {subject !== 'unknown' && (
              <>
                <div className="flex gap-2">
                  <Input
                    aria-label={t('crmCalls.searchSubject')}
                    value={search}
                    maxLength={100}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    onClick={() => setSearchTerm(search)}
                  >
                    {t('crmCalls.find')}
                  </Button>
                </div>
                <Field label={t('crmCalls.selectSubject')}>
                  <select
                    className={control}
                    value={
                      subject === 'lead' ? (leadId ?? '') : (contactId ?? '')
                    }
                    onChange={(e) => {
                      setLinkId(null)
                      setPurpose('enquiry')
                      if (subject === 'lead') {
                        const l = leads.data?.items.find(
                          (x) => x.id === e.target.value,
                        )
                        setLeadId(l?.id ?? null)
                        setContactId(l?.contactId ?? null)
                      } else {
                        const c = contacts.data?.items.find(
                          (x) => x.id === e.target.value,
                        )
                        setContactId(c?.id ?? null)
                        setPhone(c?.phone ?? '')
                      }
                    }}
                  >
                    <option value="">{t('crmCalls.selectSubject')}</option>
                    {subject === 'lead'
                      ? leads.data?.items.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.title}
                          </option>
                        ))
                      : contacts.data?.items.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} · {c.phone}
                          </option>
                        ))}
                  </select>
                </Field>
                {(contacts.isError || leads.isError) && (
                  <p role="alert">{t('crm.loadError')}</p>
                )}
              </>
            )}
          </>
        )}
        {callback && <p className="text-sm">{t('crmCalls.callbackHint')}</p>}
        <Field label={t('crmCalls.phone')}>
          <Input
            value={phone}
            maxLength={40}
            disabled={!!callback}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        {contactId && (
          <>
            <Link
              className="text-sm text-primary underline"
              to="/crm?tab=contacts"
            >
              {t('crmCalls.checkContact')}
            </Link>
            {detail.isError && <p role="alert">{t('crm.loadError')}</p>}
            {detail.data && !detail.isError && (
              <div className="rounded border p-3 text-sm">
                <strong>{detail.data.contact.name}</strong>
                <p>
                  {t('crmCalls.preferred')}{' '}
                  {detail.data.contact.preferredChannel}
                </p>
                <p className="whitespace-pre-wrap">
                  {detail.data.contact.safeInstructions}
                </p>
                {eligibility && (
                  <p>
                    {t('crmCalls.readiness')}{' '}
                    {t(`crmContacts.reasons.${eligibility.reason}`)}
                  </p>
                )}
              </div>
            )}
            {!callback && (
              <>
                <Field label={t('crmCalls.relationship')}>
                  <select
                    className={control}
                    value={linkId ?? ''}
                    onChange={(e) => {
                      setLinkId(e.target.value || null)
                      setPurpose(
                        e.target.value
                          ? visibleLinks.find((l) => l.id === e.target.value)
                              ?.authority === 'follow_up'
                            ? 'follow_up'
                            : 'scheduling'
                          : 'enquiry',
                      )
                    }}
                  >
                    <option value="">{t('crmTimeline.values.enquiry')}</option>
                    {visibleLinks.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.patient?.name} · {l.patient?.mrn}
                      </option>
                    ))}
                  </select>
                </Field>
                {linkId && (
                  <Choice
                    label={t('crmTimeline.purpose')}
                    value={purpose}
                    values={
                      visibleLinks.find((l) => l.id === linkId)?.authority ===
                      'both'
                        ? ['scheduling', 'follow_up']
                        : [
                            visibleLinks.find((l) => l.id === linkId)
                              ?.authority ?? 'scheduling',
                          ]
                    }
                    onChange={(v) => setPurpose(v as typeof purpose)}
                  />
                )}
              </>
            )}
          </>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {!callback && (
            <Choice
              label={t('crmTimeline.direction')}
              value={direction}
              values={['inbound', 'outbound']}
              onChange={(v) => {
                setDirection(v)
                if (state !== 'answered')
                  setState(v === 'inbound' ? 'missed' : 'no_answer')
              }}
            />
          )}
          <Choice
            label={t('crmCalls.state')}
            value={state}
            values={[
              'answered',
              direction === 'inbound' ? 'missed' : 'no_answer',
            ]}
            onChange={(v) => {
              setState(v)
              if (v !== 'answered') setAction('callback')
            }}
          />
          <Field label={t('crmCalls.started')}>
            <Input
              type="datetime-local"
              required
              value={started}
              onChange={(e) => setStarted(e.target.value)}
            />
          </Field>
          {state === 'answered' && (
            <Field label={t('crmCalls.ended')}>
              <Input
                type="datetime-local"
                required
                value={ended}
                onChange={(e) => setEnded(e.target.value)}
              />
            </Field>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t('crmCalls.timezone')}{' '}
          {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </p>
        <Field label={t('crmTimeline.summary')}>
          <textarea
            className={control}
            rows={3}
            required
            minLength={3}
            maxLength={1000}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </Field>
        {state === 'answered' && (
          <Choice
            label={t('crmTimeline.outcome')}
            value={outcome}
            values={CRM_INTERACTION_OUTCOMES.filter((v) => v !== 'no_response')}
            onChange={setOutcome}
          />
        )}
        <Choice
          label={t('crmCalls.nextAction')}
          value={action}
          values={
            state === 'answered'
              ? CRM_CALL_ACTIONS
              : CRM_CALL_ACTIONS.filter((v) => v !== 'none')
          }
          onChange={setAction}
        />
        {action !== 'none' && (
          <Field label={t('crmCalls.actionNote')}>
            <textarea
              className={control}
              required
              minLength={3}
              maxLength={500}
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
            />
          </Field>
        )}
      </fieldset>
      {invalid && <p role="alert">{t('crmCalls.invalid')}</p>}
      {mutation.isError && (
        <p role="alert">
          {serverMessage(mutation.error) ?? t('crmTimeline.saveError')}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {t('crmCalls.save')}
        </Button>
        <Button
          variant="outline"
          disabled={mutation.isPending}
          onClick={onCancel}
        >
          {t('crmCalls.cancel')}
        </Button>
      </div>
    </form>
  )
}
function CallDetail({
  id,
  canWrite,
  onClose,
  onCallback,
}: {
  id: string
  canWrite: boolean
  onClose: () => void
  onCallback: (c: CrmCall) => void
}) {
  const { t } = useTranslation(),
    client = useQueryClient(),
    now = useNow(),
    [note, setNote] = useState(''),
    [editing, setEditing] = useState(false),
    [summary, setSummary] = useState(''),
    [reason, setReason] = useState(''),
    [withdraw, setWithdraw] = useState(false),
    [invalid, setInvalid] = useState(false)
  const query = useQuery({
    queryKey: ['crm', 'call', id],
    queryFn: () => apiGet(`/crm/calls/${id}`, crmCallDetailSchema),
    retry: false,
    refetchInterval: 15000,
  })
  const refresh = async () => {
    setEditing(false)
    setNote('')
    await client.invalidateQueries({ queryKey: ['crm'] })
  }
  const complete = useMutation({
    mutationFn: (version: number) =>
      apiPost(
        `/crm/calls/${id}/complete`,
        completeCrmCallSchema.parse({
          expectedVersion: version,
          completionNote: note,
        }),
        crmCallDetailSchema,
      ),
    onSuccess: refresh,
  })
  const correct = useMutation({
    mutationFn: () => {
      const c = query.data!.call.interaction
      return apiPut(
        `/crm/timeline/${c.id}`,
        correctCrmInteractionSchema.parse({
          expectedVersion: c.version,
          summary,
          outcome: c.outcome,
          reason,
          voided: withdraw,
        }),
        crmInteractionDetailSchema,
      )
    },
    onSuccess: refresh,
  })
  const c = query.data?.call
  return (
    <section
      className="rounded-lg border bg-card p-5 space-y-3"
      aria-label={t('crmCalls.details')}
    >
      <div className="flex justify-between gap-2">
        <h3 className="font-semibold">{t('crmCalls.details')}</h3>
        <Button variant="ghost" onClick={onClose}>
          {t('crmCalls.close')}
        </Button>
      </div>
      {query.isPending && <p>{t('crm.loading')}</p>}
      {query.isError && <p role="alert">{t('crm.loadError')}</p>}
      {c && !query.isError && Date.parse(c.interaction.visibleUntil) > now && (
        <>
          <p>
            <bdi dir="ltr">{c.callerPhone || t('crmCalls.unknownPhone')}</bdi> ·{' '}
            {t(`crmCalls.values.${c.state}`)} ·{' '}
            {t(`crmTimeline.values.${c.interaction.direction}`)}
          </p>
          <p className="text-sm">
            {new Date(c.interaction.occurredAt).toLocaleString()}
            {c.endedAt && ` — ${new Date(c.endedAt).toLocaleString()}`} ·{' '}
            {c.interaction.actorName}
          </p>
          {c.interaction.patient && (
            <p>
              {c.interaction.patient.name} · {c.interaction.patient.mrn}
            </p>
          )}
          <p className="whitespace-pre-wrap">
            {c.interaction.voided
              ? t('crmTimeline.withdrawn')
              : c.interaction.summary}
          </p>
          <p>{t(`crmTimeline.values.${c.interaction.outcome}`)}</p>
          <p>
            {t('crmCalls.nextAction')}: {t(`crmCalls.values.${c.nextAction}`)} ·{' '}
            {t(`crmCalls.values.${c.completedAt ? 'completed' : 'pending'}`)}
          </p>
          <p className="whitespace-pre-wrap">{c.actionNote}</p>
          {c.completedAt && (
            <p className="text-sm">
              {c.completionNote} · {c.completedByName} ·{' '}
              {new Date(c.completedAt).toLocaleString()}
            </p>
          )}
          {c.relatedCallId && (
            <p className="text-sm">{t('crmCalls.callbackLinked')}</p>
          )}
          <div className="flex gap-2">
            {canWrite && !c.interaction.voided && (
              <Link
                className="self-center text-sm text-primary underline"
                to={`/crm?tab=tasks&interactionId=${c.interaction.id}`}
              >
                {t('crmTasks.add')}
              </Link>
            )}
            {canWrite && !c.interaction.voided && (
              <Button variant="outline" onClick={() => onCallback(c)}>
                {t('crmCalls.callback')}
              </Button>
            )}
            {c.interaction.canCorrect && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(true)
                  setSummary(c.interaction.summary)
                  setReason('')
                  setWithdraw(false)
                }}
              >
                {t('crmTimeline.correct')}
              </Button>
            )}
          </div>
          {c.canComplete && (
            <form
              className="space-y-2 border-t pt-3"
              onSubmit={(e) => {
                e.preventDefault()
                complete.mutate(c.version)
              }}
            >
              <Field label={t('crmCalls.completionNote')}>
                <textarea
                  className={control}
                  required
                  minLength={3}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={complete.isPending}>
                {t('crmCalls.complete')}
              </Button>
            </form>
          )}
          {editing && (
            <form
              className="space-y-2 border-t pt-3"
              onSubmit={(e) => {
                e.preventDefault()
                const valid = correctCrmInteractionSchema.safeParse({
                  expectedVersion: c.interaction.version,
                  summary,
                  outcome: c.interaction.outcome,
                  reason,
                  voided: withdraw,
                }).success
                setInvalid(!valid)
                if (valid) correct.mutate()
              }}
            >
              <Field label={t('crmTimeline.summary')}>
                <textarea
                  className={control}
                  required
                  minLength={3}
                  maxLength={1000}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                />
              </Field>
              <Field label={t('crmTimeline.reason')}>
                <Input
                  required
                  minLength={3}
                  maxLength={300}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={withdraw}
                  onChange={(e) => setWithdraw(e.target.checked)}
                />
                {t('crmTimeline.withdraw')}
              </label>
              <Button type="submit" disabled={correct.isPending}>
                {t('crmCalls.save')}
              </Button>
            </form>
          )}
          {(complete.isError || correct.isError) && (
            <p role="alert">
              {serverMessage(complete.error ?? correct.error) ??
                t('crmTimeline.saveError')}
            </p>
          )}
          {invalid && <p role="alert">{t('crm.invalid')}</p>}
          <details>
            <summary className="cursor-pointer text-sm">
              {t('crmTimeline.history')}
            </summary>
            <ol className="mt-2 space-y-2">
              {query.data?.history.map((h) => (
                <li key={h.version} className="border-t pt-2 text-sm">
                  <p>
                    {h.version} · {h.actorName} ·{' '}
                    {new Date(h.createdAt).toLocaleString()}
                  </p>
                  <p className="whitespace-pre-wrap">{h.summary}</p>
                  <p>
                    {h.reason}
                    {h.voided && ` · ${t('crmTimeline.withdrawn')}`}
                  </p>
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
    </section>
  )
}
