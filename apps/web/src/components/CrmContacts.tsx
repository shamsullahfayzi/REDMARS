import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { CrmTimeline } from '@/components/CrmTimeline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  crmContactListSchema,
  crmContactDetailSchema,
  createCrmContactSchema,
  type CrmContact,
  type CrmContactDetail,
} from '@redmars/shared'
import { ApiError, apiGet, apiPost, apiPut, serverMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

const initial = {
  name: '',
  phone: '',
  altPhone: '',
  email: '',
  language: 'prs' as const,
  preferredChannel: 'call' as const,
  safeInstructions: '',
  doNotContact: false,
  archived: false,
}
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
  value,
  onChange,
  options,
  label,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  label: string
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
            {t(`crmContacts.values.${v}`)}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function CrmContacts() {
  const { t } = useTranslation()
  const [q, setQ] = useState(''),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1)
  const [archived, setArchived] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [creating, setCreating] = useState(false)
  const query = useQuery({
    queryKey: ['crm', 'contacts', search, page, archived],
    queryFn: () =>
      apiGet(
        `/crm/contacts?q=${encodeURIComponent(search)}&page=${page}&archived=${archived}`,
        crmContactListSchema,
      ),
    retry: false,
  })
  return (
    <section className="space-y-4" aria-label={t('crmContacts.title')}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{t('crmContacts.title')}</h2>
        <Button
          onClick={() => {
            setSelected(null)
            setCreating(true)
          }}
        >
          {t('crmContacts.new')}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t('crmContacts.intro')}</p>
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setSearch(q)
          setPage(1)
        }}
      >
        <Input
          className="max-w-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('crmContacts.searchHint')}
          aria-label={t('crmContacts.search')}
          maxLength={120}
        />
        <Button type="submit" variant="outline">
          {t('crmContacts.search')}
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => {
              setArchived(e.target.checked)
              setPage(1)
            }}
          />
          {t('crmContacts.showArchived')}
        </label>
      </form>
      {query.isPending && <p role="status">{t('crm.loading')}</p>}
      {query.isError && (
        <p role="alert">
          {t('crm.loadError')}{' '}
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t('crm.retry')}
          </Button>
        </p>
      )}
      {query.data && !query.isError && (
        <>
          <div className="grid gap-2 md:grid-cols-3">
            {query.data.items.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelected(c.id)
                  setCreating(false)
                }}
                className={`rounded-lg border p-4 text-start hover:bg-muted ${selected === c.id ? 'border-primary bg-muted' : ''}`}
              >
                <strong className="block">{c.name}</strong>
                <span dir="ltr" className="text-sm">
                  {c.phone || c.email || '—'}
                </span>
                {c.doNotContact && (
                  <span className="block text-sm text-destructive">
                    {t('crmContacts.doNotContact')}
                  </span>
                )}
              </button>
            ))}
          </div>
          {!query.data.total && (
            <p className="text-muted-foreground">{t('crmContacts.empty')}</p>
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
      {creating && (
        <ContactForm
          onSaved={(id) => {
            setCreating(false)
            setSelected(id)
          }}
          onClose={() => setCreating(false)}
        />
      )}
      {selected && (
        <ContactDetail
          key={selected}
          id={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  )
}

function ContactForm({
  contact,
  onSaved,
  onClose,
}: {
  contact?: CrmContact
  onSaved: (id: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation(),
    client = useQueryClient()
  const [data, setData] = useState(
    contact
      ? {
          name: contact.name,
          phone: contact.phone,
          altPhone: contact.altPhone,
          email: contact.email,
          language: contact.language,
          preferredChannel: contact.preferredChannel,
          safeInstructions: contact.safeInstructions,
          doNotContact: contact.doNotContact,
          archived: contact.archived,
        }
      : initial,
  )
  const [reviewed, setReviewed] = useState(false),
    [invalid, setInvalid] = useState(false)
  const [candidates, setCandidates] = useState<{ id: string; name: string }[]>(
    [],
  )
  const mutation = useMutation({
    mutationFn: () =>
      contact
        ? apiPut(
            `/crm/contacts/${contact.id}`,
            {
              ...data,
              duplicateReviewed: reviewed,
              expectedVersion: contact.version,
            },
            crmContactDetailSchema,
          )
        : apiPost(
            '/crm/contacts',
            { ...data, duplicateReviewed: reviewed },
            crmContactDetailSchema,
          ),
    onSuccess: async (r) => {
      await client.invalidateQueries({ queryKey: ['crm', 'contacts'] })
      onSaved(r.contact.id)
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        const body = e.body as { candidates?: { id: string; name: string }[] }
        if (Array.isArray(body?.candidates)) {
          setCandidates(body.candidates)
          setReviewed(false)
        }
      }
    },
  })
  const set = (key: string, value: string | boolean) => {
    setData((d) => ({ ...d, [key]: value }))
    setReviewed(false)
    setCandidates([])
    mutation.reset()
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = createCrmContactSchema.safeParse({
      ...data,
      duplicateReviewed: reviewed,
    })
    setInvalid(!parsed.success)
    if (parsed.success) mutation.mutate()
  }
  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-4">
        <h3 className="font-semibold">
          {t(contact ? 'crmContacts.edit' : 'crmContacts.new')}
        </h3>
        <fieldset
          disabled={mutation.isPending}
          className="grid gap-4 md:grid-cols-2"
        >
          {(['name', 'phone', 'altPhone', 'email'] as const).map((key) => (
            <Field key={key} label={t(`crmContacts.${key}`)}>
              <Input
                value={data[key]}
                onChange={(e) => set(key, e.target.value)}
                required={key === 'name'}
                maxLength={key === 'name' ? 120 : key === 'email' ? 160 : 40}
                type={key === 'email' ? 'email' : 'text'}
              />
            </Field>
          ))}
          <Select
            label={t('crmContacts.language')}
            value={data.language}
            onChange={(v) => set('language', v)}
            options={['prs', 'ps', 'en', 'other']}
          />
          <Select
            label={t('crmContacts.channel')}
            value={data.preferredChannel}
            onChange={(v) => set('preferredChannel', v)}
            options={['call', 'sms', 'whatsapp', 'email']}
          />
          <div className="md:col-span-2">
            <Field label={t('crmContacts.safeInstructions')}>
              <textarea
                className={control}
                value={data.safeInstructions}
                maxLength={500}
                onChange={(e) => set('safeInstructions', e.target.value)}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              {t('crmContacts.noClinical')}
            </p>
          </div>
          {(['doNotContact', 'archived'] as const).map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={data[key]}
                onChange={(e) => set(key, e.target.checked)}
              />
              {t(`crmContacts.${key}`)}
            </label>
          ))}
        </fieldset>
        {!!candidates.length && (
          <div
            className="space-y-2 rounded border border-amber-500 p-3"
            role="alert"
          >
            <p>{t('crmContacts.duplicates')}</p>
            <ul>
              {candidates.map((c) => (
                <li key={c.id}>
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => onSaved(c.id)}
                  >
                    {c.name}
                  </Button>
                </li>
              ))}
            </ul>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              {t('crmContacts.reviewed')}
            </label>
          </div>
        )}
        {invalid && <p role="alert">{t('crmContacts.invalid')}</p>}
        {mutation.isError && (
          <p role="alert">
            {serverMessage(mutation.error) ?? t('crmContacts.saveError')}
          </p>
        )}
        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={mutation.isPending || (!!candidates.length && !reviewed)}
          >
            {t('crmContacts.save')}
          </Button>
          <Button variant="outline" type="button" onClick={onClose}>
            {t('crmContacts.close')}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function ContactDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation(),
    client = useQueryClient()
  const [editing, setEditing] = useState(false)
  const query = useQuery({
    queryKey: ['crm', 'contacts', 'detail', id],
    queryFn: () => apiGet(`/crm/contacts/${id}`, crmContactDetailSchema),
    retry: false,
    refetchInterval: editing ? false : 30_000,
  })
  const mutation = useMutation({
    mutationFn: ({
      path,
      body,
      put,
    }: {
      path: string
      body: unknown
      put?: boolean
    }) =>
      (put ? apiPut : apiPost)(
        `/crm/contacts/${id}/${path}`,
        body,
        crmContactDetailSchema,
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['crm', 'contacts'] })
    },
  })
  const data = query.data
  if (query.isPending) return <p role="status">{t('crm.loading')}</p>
  if (!data || query.isError)
    return (
      <p role="alert">
        {t('crm.loadError')}{' '}
        <Button onClick={() => void query.refetch()}>{t('crm.retry')}</Button>
      </p>
    )
  if (editing)
    return (
      <ContactForm
        key={data.contact.version}
        contact={data.contact}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false)
          void query.refetch()
        }}
      />
    )
  const submit = (path: string, body: Record<string, unknown>, put = false) =>
    mutation.mutate({
      path,
      body: { ...body, expectedVersion: data.contact.version },
      put,
    })
  return (
    <Card className="space-y-5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="me-auto text-lg font-semibold">{data.contact.name}</h3>
        <Button variant="outline" onClick={() => setEditing(true)}>
          {t('crmContacts.edit')}
        </Button>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {t('crmContacts.reload')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('crmContacts.close')}
        </Button>
      </div>
      <p className="text-sm">
        {t('crmContacts.language')}:{' '}
        {t(`crmContacts.values.${data.contact.language}`)} ·{' '}
        {t('crmContacts.channel')}:{' '}
        {t(`crmContacts.values.${data.contact.preferredChannel}`)}
      </p>
      <p className="whitespace-pre-wrap text-sm">
        {data.contact.safeInstructions || t('crmContacts.noInstructions')}
      </p>
      {(data.contact.doNotContact || data.contact.archived) && (
        <p className="font-medium text-destructive">
          {t(
            data.contact.archived
              ? 'crmContacts.archived'
              : 'crmContacts.doNotContact',
          )}
        </p>
      )}
      {mutation.isError && (
        <p role="alert" className="text-destructive">
          {serverMessage(mutation.error) ?? t('crmContacts.saveError')}
        </p>
      )}
      {mutation.isSuccess && <p role="status">{t('crmContacts.saved')}</p>}
      <CrmTimeline key={data.contact.version} contactId={id} />
      <Link
        className="text-primary underline"
        to={`/crm?tab=appointments&contactId=${id}`}
      >
        {t('crmAppointments.title')}
      </Link>
      <fieldset disabled={mutation.isPending} className="space-y-5">
        <h4 className="font-semibold">{t('crmContacts.family')}</h4>
        <p className="text-sm text-muted-foreground">
          {t('crmContacts.identityHint')}
        </p>
        {!data.links.length && <p>{t('crmContacts.noLinks')}</p>}
        {data.links.map((link, index) => (
          <Relationship
            key={`${link.id}-${data.contact.version}`}
            link={link}
            index={index}
            canAuthorize={data.canAuthorize}
            submit={submit}
          />
        ))}
        {data.canAuthorize && !data.contact.archived && (
          <LinkForm key={`link-${data.contact.version}`} submit={submit} />
        )}
        <ConsentForm
          key={`consent-${data.contact.version}`}
          data={data}
          submit={submit}
        />
      </fieldset>
      <div className="space-y-2">
        <h4 className="font-semibold">{t('crmContacts.eligibility')}</h4>
        <p className="text-xs text-muted-foreground">
          {t('crmContacts.eligibilityHint')}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr>
                {['scope', 'channel', 'purpose', 'status'].map((k) => (
                  <th key={k} className="p-2 text-start">
                    {t(`crmContacts.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.eligibility
                .filter((e) => e.channel === data.contact.preferredChannel)
                .map((e) => (
                  <tr key={`${e.linkId}-${e.purpose}`} className="border-t">
                    <td className="p-2">
                      {e.linkId
                        ? `${t('crmContacts.link')} ${data.links.findIndex((l) => l.id === e.linkId) + 1}`
                        : t('crmContacts.contactOnly')}
                    </td>
                    <td className="p-2">
                      {t(`crmContacts.values.${e.channel}`)}
                    </td>
                    <td className="p-2">
                      {t(`crmContacts.values.${e.purpose}`)}
                    </td>
                    <td className={`p-2 ${e.allowed ? 'text-success' : ''}`}>
                      {t(`crmContacts.reasons.${e.reason}`)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      <details>
        <summary className="cursor-pointer font-semibold">
          {t('crmContacts.history')} ({data.consents.length})
        </summary>
        <ul className="mt-3 space-y-2 text-sm">
          {data.consents.map((c) => (
            <li className="border-t pt-2" key={c.id}>
              {new Date(c.createdAt).toLocaleString()} ·{' '}
              {c.linkId
                ? `${t('crmContacts.link')} ${data.links.findIndex((l) => l.id === c.linkId) + 1}`
                : t('crmContacts.contactOnly')}{' '}
              · {t(`crmContacts.values.${c.channel}`)} ·{' '}
              {t(`crmContacts.values.${c.purpose}`)} ·{' '}
              <strong>{t(`crmContacts.values.${c.status}`)}</strong> ·{' '}
              {t(`crmContacts.values.${c.source}`)}
            </li>
          ))}
        </ul>
      </details>
    </Card>
  )
}

type Submit = (
  path: string,
  body: Record<string, unknown>,
  put?: boolean,
) => void
function LinkForm({ submit }: { submit: Submit }) {
  const { t } = useTranslation(),
    [mrn, setMrn] = useState(''),
    [patientName, setPatientName] = useState(''),
    [relationship, setRelationship] = useState('parent')
  return (
    <form
      className="space-y-3 rounded border p-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit('relationships', { mrn, patientName, relationship })
      }}
    >
      <h5 className="font-medium">{t('crmContacts.linkPatient')}</h5>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label={t('crmContacts.mrn')}>
          <Input
            required
            value={mrn}
            maxLength={80}
            onChange={(e) => setMrn(e.target.value)}
          />
        </Field>
        <Field label={t('crmContacts.patientName')}>
          <Input
            required
            value={patientName}
            maxLength={160}
            onChange={(e) => setPatientName(e.target.value)}
          />
        </Field>
        <Select
          label={t('crmContacts.relationship')}
          value={relationship}
          onChange={setRelationship}
          options={[
            'self',
            'parent',
            'spouse',
            'sibling',
            'child',
            'guardian',
            'other',
          ]}
        />
      </div>
      <Button type="submit" variant="outline">
        {t('crmContacts.linkPatient')}
      </Button>
    </form>
  )
}
function Relationship({
  link,
  index,
  canAuthorize,
  submit,
}: {
  link: CrmContactDetail['links'][number]
  index: number
  canAuthorize: boolean
  submit: Submit
}) {
  const { t } = useTranslation(),
    [authority, setAuthority] = useState(link.authority as string),
    [source, setSource] = useState<string>(link.source ?? 'written'),
    [confirmed, setConfirmed] = useState(false)
  const [method, setMethod] = useState('identity_document'),
    [identity, setIdentity] = useState(false),
    [permission, setPermission] = useState(false)
  return (
    <div className="space-y-3 rounded border p-4">
      <h5 className="font-medium">
        {t('crmContacts.link')} {index + 1} ·{' '}
        {t(`crmContacts.values.${link.relationship}`)}
      </h5>
      <p>
        {link.patient
          ? `${link.patient.name} · ${link.patient.mrn}`
          : t('crmContacts.patientHidden')}
      </p>
      <p className="text-sm">
        {t('crmContacts.authority')}:{' '}
        {t(`crmContacts.values.${link.authority}`)}
      </p>
      {link.verifiedUntil && (
        <p className="text-sm text-success">
          {t('crmContacts.verifiedUntil')}{' '}
          {new Date(link.verifiedUntil).toLocaleTimeString()}
        </p>
      )}
      {canAuthorize && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit(
              `relationships/${link.id}`,
              {
                relationship: link.relationship,
                authority,
                source,
                authorityConfirmed: confirmed,
              },
              true,
            )
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Select
              label={t('crmContacts.authority')}
              value={authority}
              onChange={setAuthority}
              options={[
                'pending',
                'scheduling',
                'follow_up',
                'both',
                'revoked',
              ]}
            />
            <Select
              label={t('crmContacts.source')}
              value={source}
              onChange={setSource}
              options={['verbal', 'written', 'legal_guardian']}
            />
          </div>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {t('crmContacts.authorityConfirmed')}
          </label>
          <Button
            type="submit"
            variant="outline"
            disabled={!['pending', 'revoked'].includes(authority) && !confirmed}
          >
            {t('crmContacts.saveAuthority')}
          </Button>
        </form>
      )}
      {link.patientAvailable &&
        !['pending', 'revoked'].includes(link.authority) && (
          <form
            className="space-y-3 border-t pt-3"
            onSubmit={(e) => {
              e.preventDefault()
              submit(`relationships/${link.id}/verify`, {
                method,
                identityMatched: identity,
                authorityMatched: permission,
              })
            }}
          >
            <Select
              label={t('crmContacts.method')}
              value={method}
              onChange={setMethod}
              options={['identity_document', 'approved_questions']}
            />
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={identity}
                onChange={(e) => setIdentity(e.target.checked)}
              />
              {t('crmContacts.identityMatched')}
            </label>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={permission}
                onChange={(e) => setPermission(e.target.checked)}
              />
              {t('crmContacts.authorityMatched')}
            </label>
            <Button type="submit" variant="outline">
              {t(
                identity && permission
                  ? 'crmContacts.verify'
                  : 'crmContacts.recordFailed',
              )}
            </Button>
          </form>
        )}
    </div>
  )
}
function ConsentForm({
  data,
  submit,
}: {
  data: CrmContactDetail
  submit: Submit
}) {
  const { t } = useTranslation(),
    [linkId, setLinkId] = useState(''),
    [channel, setChannel] = useState(data.contact.preferredChannel as string),
    [purpose, setPurpose] = useState('enquiry'),
    [status, setStatus] = useState('withdrawn'),
    [source, setSource] = useState('verbal')
  return (
    <form
      className="space-y-3 rounded border p-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit('consents', {
          linkId: linkId || null,
          channel,
          purpose,
          status,
          source,
        })
      }}
    >
      <h4 className="font-semibold">{t('crmContacts.consent')}</h4>
      <p className="text-xs text-muted-foreground">
        {t('crmContacts.consentHint')}
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label={t('crmContacts.scope')}>
          <select
            className={control}
            value={linkId}
            onChange={(e) => {
              setLinkId(e.target.value)
              setPurpose(e.target.value ? 'scheduling' : 'enquiry')
            }}
          >
            <option value="">{t('crmContacts.contactOnly')}</option>
            {data.links.map((l, i) => (
              <option value={l.id} key={l.id}>
                {t('crmContacts.link')} {i + 1} ·{' '}
                {t(`crmContacts.values.${l.relationship}`)}
              </option>
            ))}
          </select>
        </Field>
        <Select
          label={t('crmContacts.channel')}
          value={channel}
          onChange={setChannel}
          options={['call', 'sms', 'whatsapp', 'email']}
        />
        <Select
          label={t('crmContacts.purpose')}
          value={purpose}
          onChange={setPurpose}
          options={linkId ? ['scheduling', 'follow_up'] : ['enquiry']}
        />
        <Select
          label={t('crmContacts.status')}
          value={status}
          onChange={setStatus}
          options={['withdrawn', 'granted']}
        />
        <Select
          label={t('crmContacts.source')}
          value={source}
          onChange={setSource}
          options={['verbal', 'written', 'legal_guardian']}
        />
      </div>
      <Button type="submit" variant="outline">
        {t('crmContacts.recordConsent')}
      </Button>
    </form>
  )
}
