import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  crmAppointmentOptionsSchema,
  crmAppointmentListSchema,
  crmAvailabilitySchema,
  crmAppointmentSchema,
  createCrmAppointmentSchema,
} from '@redmars/shared'
import { apiGet, apiPost, serverMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
const control = 'rounded-md border border-input bg-background px-3 py-2 text-sm'
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kabul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
export function CrmAppointments() {
  const { t, i18n } = useTranslation(),
    client = useQueryClient(),
    [params] = useSearchParams()
  const [linkId, setLink] = useState(params.get('linkId') ?? ''),
    [date, setDate] = useState(today),
    [departmentId, setDepartment] = useState(''),
    [practitionerId, setProvider] = useState(''),
    [time, setTime] = useState('09:00'),
    [duration, setDuration] = useState(30),
    [key, setKey] = useState(crypto.randomUUID()),
    [now, setNow] = useState(Date.now),
    [cancelId, setCancel] = useState<string | null>(null)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const options = useQuery({
    queryKey: ['crm', 'appointmentOptions'],
    queryFn: () =>
      apiGet('/crm/appointments/options', crmAppointmentOptionsSchema),
    retry: false,
    refetchInterval: 15000,
  })
  const links = options.isError
    ? []
    : (options.data?.links ?? []).filter(
        (l) =>
          (!l.visibleUntil || Date.parse(l.visibleUntil) > now) &&
          (!params.get('contactId') || params.get('contactId') === l.contactId),
      )
  const selected = links.find((l) => l.id === linkId)
  const book = useQuery({
    queryKey: ['crm', 'appointments', linkId, date],
    queryFn: () =>
      apiGet(
        `/crm/appointments?${new URLSearchParams({ linkId, date })}`,
        crmAppointmentListSchema,
      ),
    enabled: !!selected && !!date,
    retry: false,
    refetchInterval: 15000,
  })
  const availability = useQuery({
    queryKey: ['crm', 'appointmentAvailability', practitionerId, date],
    queryFn: () =>
      apiGet(
        `/crm/appointments/availability?${new URLSearchParams({ practitionerId, date })}`,
        crmAvailabilitySchema,
      ),
    enabled: !!practitionerId && !!date,
    retry: false,
    refetchInterval: 15000,
  })
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['crm'] })
    await client.invalidateQueries({ queryKey: ['appointments'] })
  }
  const create = useMutation({
    mutationFn: (input: ReturnType<typeof createCrmAppointmentSchema.parse>) =>
      apiPost('/crm/appointments', input, crmAppointmentSchema),
    onSuccess: async () => {
      setKey(crypto.randomUUID())
      await refresh()
    },
  })
  const cancel = useMutation({
    mutationFn: (id: string) =>
      apiPost(
        `/crm/appointments/${id}/cancel`,
        { linkId, idempotencyKey: key },
        crmAppointmentSchema,
      ),
    onSuccess: async () => {
      setCancel(null)
      setKey(crypto.randomUUID())
      await refresh()
    },
  })
  const edit = () => {
    setKey(crypto.randomUUID())
    create.reset()
    cancel.reset()
    setCancel(null)
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = createCrmAppointmentSchema.safeParse({
      linkId,
      leadId: params.get('leadId'),
      departmentId,
      practitionerId,
      scheduledAt:
        date && time ? new Date(`${date}T${time}:00+04:30`).toISOString() : '',
      durationMinutes: duration,
      idempotencyKey: key,
    })
    if (parsed.success) create.mutate(parsed.data)
  }
  const format = (v: string) =>
    new Intl.DateTimeFormat(
      i18n.language === 'en'
        ? 'en-GB'
        : i18n.language === 'ps'
          ? 'ps-AF'
          : 'fa-AF',
      { timeZone: 'Asia/Kabul', dateStyle: 'medium', timeStyle: 'short' },
    ).format(new Date(v))
  const visible =
    selected &&
    !book.isError &&
    (!book.data?.visibleUntil || Date.parse(book.data.visibleUntil) > now)
  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-5">
        <h2 className="text-lg font-semibold">{t('crmAppointments.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('crmAppointments.guidance')}
        </p>
        <p className="text-sm">
          {t('crmAppointments.zone')}: Asia/Kabul (UTC+04:30)
        </p>
        {options.isPending && <p role="status">{t('crm.loading')}</p>}
        {options.isError && (
          <p role="alert">
            {t('crm.loadError')}{' '}
            <Button onClick={() => void options.refetch()}>
              {t('crm.retry')}
            </Button>
          </p>
        )}
        {!options.isPending && !links.length && (
          <p>
            {t('crmAppointments.verify')}{' '}
            <Link to="/crm?tab=contacts" className="text-primary underline">
              {t('crmLeads.tabs.contacts')}
            </Link>
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm">
            {t('crmAppointments.patient')}
            <select
              className={control}
              value={selected ? linkId : ''}
              onChange={(e) => {
                setLink(e.target.value)
                edit()
              }}
            >
              <option value="">{t('crmAppointments.choose')}</option>
              {links.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.patientName} · {l.mrn} · {l.contactName}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            {t('crmAppointments.date')}
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value)
                edit()
              }}
              onInput={(e) => {
                setDate(e.currentTarget.value)
                edit()
              }}
              required
            />
          </label>
        </div>
      </Card>
      {selected && options.data?.canWrite && (
        <Card className="p-5">
          <form className="space-y-4" onSubmit={submit}>
            <h3 className="font-semibold">{t('crmAppointments.book')}</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                {t('crmAppointments.department')}
                <select
                  className={control}
                  value={departmentId}
                  onChange={(e) => {
                    setDepartment(e.target.value)
                    setProvider('')
                    edit()
                  }}
                  required
                >
                  <option value="">{t('crmAppointments.choose')}</option>
                  {options.data.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                {t('crmAppointments.provider')}
                <select
                  className={control}
                  value={practitionerId}
                  onChange={(e) => {
                    setProvider(e.target.value)
                    edit()
                  }}
                  required
                >
                  <option value="">{t('crmAppointments.choose')}</option>
                  {options.data.practitioners
                    .filter((p) => p.departmentIds.includes(departmentId))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                {t('crmAppointments.time')}
                <Input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => {
                    setTime(e.target.value)
                    edit()
                  }}
                  onInput={(e) => {
                    setTime(e.currentTarget.value)
                    edit()
                  }}
                />
              </label>
              <label className="grid gap-1 text-sm">
                {t('crmAppointments.duration')}
                <Input
                  type="number"
                  min={5}
                  max={240}
                  required
                  value={duration}
                  onChange={(e) => {
                    setDuration(Number(e.target.value))
                    edit()
                  }}
                />
              </label>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('crmAppointments.hours')}
            </p>
            {availability.isError && <p role="alert">{t('crm.loadError')}</p>}
            {availability.data && (
              <div className="space-y-1 text-sm">
                <h4 className="font-medium">{t('crmAppointments.busy')}</h4>
                {availability.data.dateOnlyCount > 0 && (
                  <p role="alert">{t('crmAppointments.dateOnlyWarning')}</p>
                )}
                {availability.data.busy
                  .filter((b) => b.endsAt)
                  .map((b, i) => (
                    <p key={i}>
                      {format(b.scheduledAt)} — {format(b.endsAt!)}
                    </p>
                  ))}
                {!availability.data.busy.length && (
                  <p>{t('crmAppointments.noBusy')}</p>
                )}
              </div>
            )}
            <Button
              type="submit"
              disabled={
                create.isPending ||
                !date ||
                !time ||
                !practitionerId ||
                availability.isPending ||
                availability.isError ||
                !!availability.data?.dateOnlyCount
              }
            >
              {t('crmAppointments.book')}
            </Button>
            {create.isError && (
              <p role="alert">
                {serverMessage(create.error) ?? t('crmContacts.saveError')}
              </p>
            )}
            {create.isSuccess && (
              <p role="status">{t('crmAppointments.saved')}</p>
            )}
          </form>
        </Card>
      )}
      {selected && (
        <Card className="space-y-3 p-5">
          <h3 className="font-semibold">{t('crmAppointments.bookings')}</h3>
          {book.isPending && <p role="status">{t('crm.loading')}</p>}
          {book.isError && (
            <p role="alert">
              {serverMessage(book.error) ?? t('crm.loadError')}
            </p>
          )}
          {visible && book.data?.items.length === 0 && (
            <p>{t('crmAppointments.empty')}</p>
          )}
          {visible &&
            book.data?.items.map((a) => (
              <div key={a.id} className="space-y-2 rounded border p-3">
                <p>
                  {a.endsAt
                    ? `${format(a.scheduledAt)} — ${format(a.endsAt)}`
                    : t('crmAppointments.dateOnly')}
                </p>
                <p>
                  {a.departmentName} ·{' '}
                  {a.practitionerName ?? t('crmAppointments.anyProvider')}
                </p>
                <p>{t(`appointments.status.${a.status}`)}</p>
                {options.data?.canWrite &&
                  ['booked', 'arrived'].includes(a.status) &&
                  (cancelId === a.id ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <p>{t('crmAppointments.confirmCancel')}</p>
                      <Button
                        disabled={cancel.isPending}
                        onClick={() => cancel.mutate(a.id)}
                      >
                        {t('crmAppointments.cancel')}
                      </Button>
                      <Button variant="outline" onClick={() => setCancel(null)}>
                        {t('crmAppointments.keep')}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => {
                        edit()
                        setCancel(a.id)
                      }}
                    >
                      {t('crmAppointments.cancel')}
                    </Button>
                  ))}
              </div>
            ))}
          {cancel.isError && (
            <p role="alert">
              {serverMessage(cancel.error) ?? t('crmContacts.saveError')}
            </p>
          )}
        </Card>
      )}
    </div>
  )
}
