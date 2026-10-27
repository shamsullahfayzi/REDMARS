import { useEffect, useState, type ReactNode, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CRM_TASK_PRIORITIES,
  CRM_TASK_STATUSES,
  crmTaskListSchema,
  crmTaskDetailSchema,
  crmTaskOptionsSchema,
  crmTaskFollowUpsSchema,
  crmInteractionDetailSchema,
  createCrmTaskSchema,
  updateCrmTaskSchema,
  escalateCrmTaskSchema,
  type CrmTask,
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
  onChange: (s: string) => void
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
            {t(`crmTasks.values.${v}`)}
          </option>
        ))}
      </select>
    </Field>
  )
}
function localTime(date: string) {
  const d = new Date(date)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}
function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}
export function CrmTasks({ escalation }: { escalation: string }) {
  const { t } = useTranslation(),
    [params, setParams] = useSearchParams(),
    now = useNow(),
    client = useQueryClient()
  const [page, setPage] = useState(1),
    [owner, setOwner] = useState('mine'),
    [status, setStatus] = useState('active'),
    [queue, setQueue] = useState('all'),
    [priority, setPriority] = useState('all'),
    [q, setQ] = useState(''),
    [search, setSearch] = useState(''),
    [selected, setSelected] = useState<string | null>(null)
  const source = params.get('interactionId')
  const query = useQuery({
    queryKey: ['crm', 'tasks', page, owner, status, queue, priority, search],
    queryFn: () =>
      apiGet(
        `/crm/tasks?${new URLSearchParams({ page: String(page), owner, status, queue, priority, q: search })}`,
        crmTaskListSchema,
      ),
    retry: false,
    refetchInterval: 15000,
  })
  const reminders = useQuery({
    queryKey: ['crm', 'taskReminders'],
    queryFn: () =>
      apiGet('/crm/tasks?owner=mine&queue=reminders', crmTaskListSchema),
    retry: false,
    refetchInterval: 30000,
  })
  const refreshed = async () => {
    await client.invalidateQueries({ queryKey: ['crm'] })
  }
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{t('crmTasks.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('crmTasks.intro')}</p>
      <div className="rounded border p-3 text-sm">
        <strong>{t('crm.escalationContact')}</strong>
        <p>{escalation || t('crm.escalationMissing')}</p>
        <p>{t('crmCalls.safety')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={owner === 'mine' && queue === 'all' ? 'default' : 'outline'}
          onClick={() => {
            setOwner('mine')
            setQueue('all')
            setStatus('active')
            setPage(1)
          }}
        >
          {t('crmTasks.mine')}
        </Button>
        <Button
          variant={queue === 'overdue' ? 'default' : 'outline'}
          onClick={() => {
            setQueue('overdue')
            setStatus('active')
            setPage(1)
          }}
        >
          {t('crmTasks.overdue')}
        </Button>
        <Button
          variant={queue === 'reminders' ? 'default' : 'outline'}
          onClick={() => {
            setQueue('reminders')
            setOwner('mine')
            setStatus('active')
            setPage(1)
          }}
        >
          {t('crmTasks.reminders')}
          {reminders.data &&
          !reminders.isError &&
          reminders.data.items.every(
            (r) => Date.parse(r.interaction.visibleUntil) > now,
          )
            ? ` (${reminders.data.total})`
            : ''}
        </Button>
        <Button variant="outline" onClick={() => void refreshed()}>
          {t('crmLeads.reload')}
        </Button>
      </div>
      <p className="text-sm">
        {t('crmTasks.createHint')}{' '}
        <Link className="text-primary underline" to="/crm?tab=calls">
          {t('crmCalls.title')}
        </Link>{' '}
        ·{' '}
        <Link className="text-primary underline" to="/crm?tab=leads">
          {t('crmLeads.tabs.leads')}
        </Link>{' '}
        ·{' '}
        <Link className="text-primary underline" to="/crm?tab=contacts">
          {t('crmLeads.tabs.contacts')}
        </Link>
      </p>
      {source && (
        <TaskForm
          key={source}
          sourceId={source}
          onCancel={() => setParams({ tab: 'tasks' })}
          onSaved={async (id) => {
            setParams({ tab: 'tasks' })
            setSelected(id)
            setOwner('all')
            setStatus('all')
            setQueue('all')
            await refreshed()
          }}
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
          aria-label={t('crmTasks.search')}
          placeholder={t('crmTasks.search')}
          maxLength={100}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit" variant="outline">
          {t('crmCalls.find')}
        </Button>
      </form>
      <div className="grid gap-3 md:grid-cols-4">
        <Choice
          label={t('crmTasks.owner')}
          value={owner}
          values={['mine', 'all', 'unassigned']}
          onChange={(v) => {
            setOwner(v)
            setPage(1)
          }}
        />
        <Choice
          label={t('crmTasks.status')}
          value={status}
          values={['active', 'all', ...CRM_TASK_STATUSES]}
          onChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
        />
        <Choice
          label={t('crmTasks.priority')}
          value={priority}
          values={['all', ...CRM_TASK_PRIORITIES]}
          onChange={(v) => {
            setPriority(v)
            setPage(1)
          }}
        />
        <Choice
          label={t('crmTasks.queue')}
          value={queue}
          values={['all', 'overdue', 'reminders', 'escalated']}
          onChange={(v) => {
            setQueue(v)
            setPage(1)
          }}
        />
      </div>
      {query.isPending && <p role="status">{t('crm.loading')}</p>}
      {query.isError && <p role="alert">{t('crm.loadError')}</p>}
      {query.data &&
        !query.isError &&
        query.data.items.every(
          (r) => Date.parse(r.interaction.visibleUntil) > now,
        ) && (
          <>
            <ol className="space-y-2">
              {query.data.items.map((r) => (
                <li key={r.id} className="rounded border p-4 space-y-2">
                  <div className="flex flex-wrap gap-2 justify-between">
                    <strong>{r.title}</strong>
                    <span
                      className={
                        r.overdue ? 'font-semibold text-destructive' : 'text-sm'
                      }
                    >
                      {new Date(r.dueAt).toLocaleString()}{' '}
                      {r.overdue && t('crmTasks.overdue')}
                    </span>
                  </div>
                  <p className="text-sm">
                    {r.ownerName || t('crmTasks.values.unassigned')} ·{' '}
                    {t(`crmTasks.values.${r.priority}`)} ·{' '}
                    {t(`crmTasks.values.${r.status}`)}
                    {r.reminderDue && ` · ${t('crmTasks.reminderDue')}`}
                  </p>
                  <Button variant="outline" onClick={() => setSelected(r.id)}>
                    {t('crmTasks.details')}
                  </Button>
                </li>
              ))}
            </ol>
            {!query.data.total && <p>{t('crmTasks.empty')}</p>}
            <div className="flex gap-3 items-center">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                {t('crmCalls.previous')}
              </Button>
              <span>
                {page} · {query.data.total}
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
        <TaskDetail
          key={selected}
          id={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  )
}
function TaskForm({
  sourceId,
  existing,
  onCancel,
  onSaved,
}: {
  sourceId: string
  existing?: CrmTask
  onCancel: () => void
  onSaved: (id: string) => Promise<void>
}) {
  const { t } = useTranslation(),
    now = useNow(),
    [title, setTitle] = useState(existing?.title ?? ''),
    [notes, setNotes] = useState(existing?.notes ?? ''),
    [owner, setOwner] = useState(existing?.ownerId ?? ''),
    [ownerChanged, setOwnerChanged] = useState(!!existing),
    [due, setDue] = useState(
      localTime(
        existing?.dueAt ?? new Date(Date.now() + 86400000).toISOString(),
      ),
    ),
    [reminder, setReminder] = useState(
      existing?.reminderAt ? localTime(existing.reminderAt) : '',
    ),
    [priority, setPriority] = useState(existing?.priority ?? 'normal'),
    [status, setStatus] = useState<CrmTask['status']>(
      existing && !['completed', 'cancelled'].includes(existing.status)
        ? existing.status
        : 'open',
    ),
    [outcome, setOutcome] = useState(existing?.outcome ?? ''),
    [reason, setReason] = useState(''),
    [prescription, setPrescription] = useState(''),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [invalid, setInvalid] = useState(false)
  const source = useQuery({
    queryKey: ['crm', 'taskSource', sourceId],
    queryFn: () =>
      apiGet(`/crm/timeline/${sourceId}`, crmInteractionDetailSchema),
    retry: false,
    refetchInterval: 15000,
  })
  const options = useQuery({
    queryKey: ['crm', 'taskOptions'],
    queryFn: () => apiGet('/crm/tasks/options', crmTaskOptionsSchema),
    retry: false,
  })
  const followUps = useQuery({
    queryKey: ['crm', 'taskFollowUps', sourceId],
    queryFn: () =>
      apiGet(`/crm/tasks/follow-ups/${sourceId}`, crmTaskFollowUpsSchema),
    enabled: !existing,
    retry: false,
  })
  const selectedOwner = ownerChanged
    ? owner
    : (options.data?.currentUserId ?? '')
  const mutation = useMutation({
    mutationFn: async () => {
      const fields = {
        title,
        notes,
        ownerId: selectedOwner || null,
        dueAt: new Date(due).toISOString(),
        reminderAt: reminder ? new Date(reminder).toISOString() : null,
        priority,
      }
      return existing
        ? apiPut(
            `/crm/tasks/${existing.id}`,
            updateCrmTaskSchema.parse({
              ...fields,
              expectedVersion: existing.version,
              status,
              outcome: ['completed', 'cancelled'].includes(status)
                ? outcome
                : '',
              reason,
            }),
            crmTaskDetailSchema,
          )
        : apiPost(
            '/crm/tasks',
            createCrmTaskSchema.parse({
              ...fields,
              interactionId: sourceId,
              prescriptionId: prescription || null,
              idempotencyKey: key,
            }),
            crmTaskDetailSchema,
          )
    },
    onSuccess: (r) => onSaved(r.task.id),
  })
  function submit(e: FormEvent) {
    e.preventDefault()
    if (
      !due ||
      !Number.isFinite(Date.parse(due)) ||
      (reminder && Date.parse(reminder) > Date.parse(due)) ||
      Date.parse(due) >= Date.parse(source.data!.interaction.expiresAt)
    ) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    mutation.mutate()
  }
  const validSource =
    source.data &&
    !source.isError &&
    !source.data.interaction.voided &&
    Date.parse(source.data.interaction.visibleUntil) > now
  return (
    <section className="rounded border p-5 space-y-3">
      <h3 className="font-semibold">
        {t(existing ? 'crmTasks.edit' : 'crmTasks.add')}
      </h3>
      <Button variant="ghost" onClick={onCancel}>
        {t('crmCalls.cancel')}
      </Button>
      {source.isError || options.isError ? (
        <p role="alert">{t('crm.loadError')}</p>
      ) : !validSource ? (
        <p role="status">{t('crmTasks.sourceUnavailable')}</p>
      ) : (
        <>
          <p className="text-sm">{source.data!.interaction.summary}</p>
          <p className="text-xs text-muted-foreground">
            {t('crmTasks.retention')}{' '}
            {new Date(source.data!.interaction.expiresAt).toLocaleString()}
          </p>
          <form
            onSubmit={submit}
            onChange={() => {
              setKey(crypto.randomUUID())
              mutation.reset()
            }}
            className="space-y-3"
          >
            <fieldset
              disabled={mutation.isPending || !options.data}
              className="space-y-3"
            >
              <Field label={t('crmTasks.taskTitle')}>
                <Input
                  required
                  minLength={3}
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field label={t('crmTasks.notes')}>
                <textarea
                  className={control}
                  rows={3}
                  maxLength={1000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label={t('crmTasks.owner')}>
                  <select
                    className={control}
                    disabled={!options.data?.canAssign}
                    value={selectedOwner}
                    onChange={(e) => {
                      setOwner(e.target.value)
                      setOwnerChanged(true)
                    }}
                  >
                    <option value="">{t('crmTasks.values.unassigned')}</option>
                    {existing?.ownerId &&
                      !options.data?.owners.some(
                        (o) => o.id === existing.ownerId,
                      ) && (
                        <option value={existing.ownerId}>
                          {existing.ownerName}
                        </option>
                      )}
                    {options.data?.owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Choice
                  label={t('crmTasks.priority')}
                  value={priority}
                  values={CRM_TASK_PRIORITIES}
                  onChange={(v) => setPriority(v as typeof priority)}
                />
                <Field label={t('crmTasks.due')}>
                  <Input
                    type="datetime-local"
                    required
                    value={due}
                    onInput={(e) => {
                      setDue(e.currentTarget.value)
                      setKey(crypto.randomUUID())
                      mutation.reset()
                    }}
                    onChange={(e) => setDue(e.target.value)}
                  />
                </Field>
                <Field label={t('crmTasks.reminder')}>
                  <Input
                    type="datetime-local"
                    value={reminder}
                    onInput={(e) => {
                      setReminder(e.currentTarget.value)
                      setKey(crypto.randomUUID())
                      mutation.reset()
                    }}
                    onChange={(e) => setReminder(e.target.value)}
                  />
                </Field>
              </div>
              <p className="text-xs">
                {t('crmCalls.timezone')}{' '}
                {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </p>
              {!existing && !!followUps.data?.items.length && (
                <Field label={t('crmTasks.clinical')}>
                  <select
                    className={control}
                    value={prescription}
                    onChange={(e) => setPrescription(e.target.value)}
                  >
                    <option value="">{t('crmTasks.noLink')}</option>
                    {followUps.data.items.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.followUpDate} · {p.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {existing && (
                <>
                  <Choice
                    label={t('crmTasks.status')}
                    value={status}
                    values={
                      ['completed', 'cancelled'].includes(existing.status)
                        ? ['open', 'in_progress']
                        : CRM_TASK_STATUSES
                    }
                    onChange={(v) => setStatus(v as typeof status)}
                  />
                  {['completed', 'cancelled'].includes(status) && (
                    <Field label={t('crmTasks.outcome')}>
                      <textarea
                        className={control}
                        required
                        minLength={3}
                        maxLength={500}
                        value={outcome}
                        onChange={(e) => setOutcome(e.target.value)}
                      />
                    </Field>
                  )}
                  <Field label={t('crmTasks.reason')}>
                    <Input
                      required
                      minLength={3}
                      maxLength={300}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </Field>
                </>
              )}
            </fieldset>
            {invalid && <p role="alert">{t('crmTasks.invalid')}</p>}
            {mutation.isError && (
              <p role="alert">
                {serverMessage(mutation.error) ?? t('crmTasks.invalid')}
              </p>
            )}
            <Button
              type="submit"
              disabled={mutation.isPending || !options.data}
            >
              {t('crmTasks.save')}
            </Button>
          </form>
        </>
      )}
    </section>
  )
}
function TaskDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation(),
    now = useNow(),
    client = useQueryClient(),
    [editing, setEditing] = useState(false),
    [reason, setReason] = useState('')
  const query = useQuery({
    queryKey: ['crm', 'task', id],
    queryFn: () => apiGet(`/crm/tasks/${id}`, crmTaskDetailSchema),
    retry: false,
    refetchInterval: 15000,
  })
  const refresh = async () => {
    setEditing(false)
    await client.invalidateQueries({ queryKey: ['crm'] })
  }
  const mutation = useMutation({
    mutationFn: (action: 'claim' | 'acknowledge' | 'escalate') =>
      apiPost(
        `/crm/tasks/${id}/${action}`,
        action === 'escalate'
          ? escalateCrmTaskSchema.parse({
              expectedVersion: query.data!.task.version,
              reason,
            })
          : { expectedVersion: query.data!.task.version },
        crmTaskDetailSchema,
      ),
    onSuccess: refresh,
  })
  const r = query.data?.task
  return (
    <section
      className="rounded border p-5 space-y-3"
      aria-label={t('crmTasks.details')}
    >
      <div className="flex justify-between">
        <h3 className="font-semibold">{t('crmTasks.details')}</h3>
        <Button variant="ghost" onClick={onClose}>
          {t('crmCalls.close')}
        </Button>
      </div>
      {query.isError && <p role="alert">{t('crm.loadError')}</p>}
      {r && !query.isError && Date.parse(r.interaction.visibleUntil) > now && (
        <>
          <h4 className="font-semibold">{r.title}</h4>
          <p className="whitespace-pre-wrap">{r.notes}</p>
          <p>
            {r.ownerName || t('crmTasks.values.unassigned')} ·{' '}
            {t(`crmTasks.values.${r.status}`)} ·{' '}
            {t(`crmTasks.values.${r.priority}`)}
          </p>
          <p>
            {t('crmTasks.due')}: {new Date(r.dueAt).toLocaleString()}
          </p>
          {r.reminderAt && (
            <p>
              {t('crmTasks.reminder')}:{' '}
              {new Date(r.reminderAt).toLocaleString()} ·{' '}
              {r.reminderAcknowledgedAt
                ? t('crmTasks.acknowledged')
                : r.reminderDue
                  ? t('crmTasks.reminderDue')
                  : t('crmTasks.scheduled')}
            </p>
          )}
          <p className="whitespace-pre-wrap">{r.outcome}</p>
          {r.interaction.patient && (
            <p>
              {r.interaction.patient.name} · {r.interaction.patient.mrn}
            </p>
          )}
          {r.interaction.callId && (
            <Link
              className="text-primary underline"
              to={`/crm?tab=calls&callId=${r.interaction.callId}`}
            >
              {t('crmCalls.details')}
            </Link>
          )}
          {r.prescriptionId && (
            <p>
              {t('crmTasks.clinical')}:{' '}
              {r.followUpDate || t('crmTasks.noCurrentDate')} ·{' '}
              <Link className="text-primary underline" to="/follow-ups">
                {t('crm.existingFollowUps')}
              </Link>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {r.canEdit && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                {t(
                  ['completed', 'cancelled'].includes(r.status)
                    ? 'crmTasks.reopen'
                    : 'crmTasks.edit',
                )}
              </Button>
            )}
            {r.canClaim && (
              <Button
                disabled={mutation.isPending}
                onClick={() => mutation.mutate('claim')}
              >
                {t('crmTasks.claim')}
              </Button>
            )}
            {r.canAcknowledge && r.reminderDue && (
              <Button
                disabled={mutation.isPending}
                onClick={() => mutation.mutate('acknowledge')}
              >
                {t('crmTasks.acknowledge')}
              </Button>
            )}
          </div>
          {editing && (
            <TaskForm
              key={`${id}-${r.version}`}
              sourceId={r.interaction.id}
              existing={r}
              onCancel={() => setEditing(false)}
              onSaved={refresh}
            />
          )}
          {r.canEdit && ['open', 'in_progress'].includes(r.status) && (
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                mutation.mutate('escalate')
              }}
            >
              <Input
                aria-label={t('crmTasks.escalationReason')}
                placeholder={t('crmTasks.escalationReason')}
                required
                minLength={3}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={mutation.isPending}
              >
                {t('crmTasks.escalate')}
              </Button>
            </form>
          )}
          {mutation.isError && (
            <p role="alert">
              {serverMessage(mutation.error) ?? t('crmTasks.invalid')}
            </p>
          )}
          <details>
            <summary className="cursor-pointer">
              {t('crmTasks.history')}
            </summary>
            <ol className="space-y-3">
              {query.data?.history.map((h) => (
                <li key={h.version} className="border-t pt-2 text-sm">
                  <p>
                    {h.version} · {t(`crmTasks.values.${h.event}`)} ·{' '}
                    {h.actorName} · {new Date(h.createdAt).toLocaleString()}
                  </p>
                  <p>
                    {h.ownerName || t('crmTasks.values.unassigned')} ·{' '}
                    {new Date(h.dueAt).toLocaleString()} ·{' '}
                    {t(`crmTasks.values.${h.priority}`)} ·{' '}
                    {t(`crmTasks.values.${h.status}`)}
                  </p>
                  <p>{h.title}</p>
                  <p className="whitespace-pre-wrap">{h.notes}</p>
                  <p>{h.outcome}</p>
                  <p>{h.reason}</p>
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
    </section>
  )
}
