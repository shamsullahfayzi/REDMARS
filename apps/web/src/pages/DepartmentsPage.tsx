import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DEPARTMENT_TYPES,
  createDepartmentRequestSchema,
  createRoomRequestSchema,
  type DepartmentSummary,
  type DepartmentType,
  type RoomSummary,
} from '@redmars/shared'
import { Button } from '@/components/ui/button'
import { useCreateDepartment, useDepartments, useSetDepartmentActive } from '@/hooks/useDepartments'
import { useCreateRoom, useRooms, useSetRoomActive } from '@/hooks/useRooms'
import { ApiError } from '@/lib/api'

/**
 * Admin-only department master data (task 2.1), with rooms nested inline. The nav
 * only shows this to an admin, but that is courtesy — the API denies every call
 * here to anyone else.
 *
 * All spacing is logical (ps-/pe-, text-start) so the table and forms mirror under
 * dir="rtl" for Dari and Pashto. The two local-name inputs are forced dir="rtl"
 * regardless of the UI language, because their content is always Dari/Pashto.
 */

const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function statusPillClass(isActive: boolean): string {
  return isActive
    ? 'inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'
    : 'inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
}

export function DepartmentPage() {
  const { t } = useTranslation()
  const departmentsQuery = useDepartments()
  const roomsQuery = useRooms()
  const createDepartment = useCreateDepartment()
  const setActive = useSetDepartmentActive()

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<DepartmentType | ''>('')
  const [nameLocalPrs, setNameLocalPrs] = useState('')
  const [nameLocalPs, setNameLocalPs] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
        setFormError(
          err instanceof ApiError && err.status === 409
            ? t('departments.create.duplicate')
            : t('departments.create.failed'),
        )
      },
    })
  }

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
                    <th className="w-10 p-3" />
                    <th className="p-3 text-start font-medium">{t('departments.list.code')}</th>
                    <th className="p-3 text-start font-medium">{t('departments.list.name')}</th>
                    <th className="p-3 text-start font-medium">{t('departments.list.type')}</th>
                    <th className="p-3 text-start font-medium">{t('departments.list.status')}</th>
                    <th className="p-3 text-end font-medium">{t('departments.list.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {departmentsQuery.data.departments.map((dep) => {
                    const isExpanded = expandedId === dep.id
                    return (
                      <DepartmentRow
                        key={dep.id}
                        department={dep}
                        isExpanded={isExpanded}
                        onToggle={() => setExpandedId(isExpanded ? null : dep.id)}
                        onSetActive={() =>
                          setActive.mutate({ id: dep.id, isActive: !dep.isActive })
                        }
                        setActivePending={setActive.isPending}
                        rooms={roomsQuery.data?.rooms.filter((r) => r.departmentId === dep.id) ?? []}
                        roomsPending={roomsQuery.isPending}
                        roomsError={roomsQuery.isError}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
      </section>
    </div>
  )
}

interface DepartmentRowProps {
  department: DepartmentSummary
  isExpanded: boolean
  onToggle: () => void
  onSetActive: () => void
  setActivePending: boolean
  rooms: RoomSummary[]
  roomsPending: boolean
  roomsError: boolean
}

function DepartmentRow({
  department: dep,
  isExpanded,
  onToggle,
  onSetActive,
  setActivePending,
  rooms,
  roomsPending,
  roomsError,
}: DepartmentRowProps) {
  const { t } = useTranslation()
  return (
    <>
      <tr className="border-b border-border last:border-0">
        <td className="p-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-label={t('departments.rooms.toggle')}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
          >
            <span className={isExpanded ? 'rotate-90 transition-transform' : 'transition-transform'}>
              ▸
            </span>
          </button>
        </td>
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
          <span className={statusPillClass(dep.isActive)}>
            {dep.isActive ? t('departments.list.active') : t('departments.list.inactive')}
          </span>
        </td>
        <td className="p-3 text-end">
          <Button
            variant={dep.isActive ? 'destructive' : 'outline'}
            size="sm"
            disabled={setActivePending}
            onClick={onSetActive}
          >
            {dep.isActive ? t('departments.list.deactivate') : t('departments.list.reactivate')}
          </Button>
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b border-border last:border-0 bg-muted/30">
          <td />
          <td colSpan={5} className="p-3 pe-3 ps-3">
            <DepartmentRooms
              departmentId={dep.id}
              rooms={rooms}
              isPending={roomsPending}
              isError={roomsError}
            />
          </td>
        </tr>
      )}
    </>
  )
}

interface DepartmentRoomsProps {
  departmentId: string
  rooms: RoomSummary[]
  isPending: boolean
  isError: boolean
}

function DepartmentRooms({ departmentId, rooms, isPending, isError }: DepartmentRoomsProps) {
  const { t } = useTranslation()
  const createRoom = useCreateRoom()
  const setRoomActive = useSetRoomActive()

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const parsed = createRoomRequestSchema.safeParse({ departmentId, code, name })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('departments.rooms.invalid'))
      return
    }

    createRoom.mutate(parsed.data, {
      onSuccess: () => {
        setCode('')
        setName('')
      },
      onError: (err) => {
        setError(
          err instanceof ApiError && err.status === 409
            ? t('departments.rooms.duplicate')
            : t('departments.rooms.failed'),
        )
      },
    })
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">{t('departments.rooms.title')}</h3>

      {isPending && <p className="text-sm text-muted-foreground">{t('departments.rooms.loading')}</p>}
      {isError && <p className="text-sm text-destructive">{t('departments.rooms.error')}</p>}

      {!isPending && !isError && rooms.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('departments.rooms.empty')}</p>
      )}

      {rooms.length > 0 && (
        <ul className="space-y-1.5">
          {rooms.map((room) => (
            <li
              key={room.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
            >
              <span className="font-mono text-foreground">{room.code}</span>
              <span className="text-foreground">{room.name}</span>
              <span className={statusPillClass(room.isActive)}>
                {room.isActive ? t('departments.list.active') : t('departments.list.inactive')}
              </span>
              <div className="ms-auto">
                <Button
                  variant={room.isActive ? 'destructive' : 'outline'}
                  size="sm"
                  disabled={setRoomActive.isPending}
                  onClick={() => setRoomActive.mutate({ id: room.id, isActive: !room.isActive })}
                >
                  {room.isActive
                    ? t('departments.list.deactivate')
                    : t('departments.list.reactivate')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label
            htmlFor={`room-code-${departmentId}`}
            className="text-xs font-medium text-muted-foreground"
          >
            {t('departments.rooms.code')}
          </label>
          <input
            id={`room-code-${departmentId}`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${fieldClass} w-28`}
          />
        </div>
        <div className="space-y-1">
          <label
            htmlFor={`room-name-${departmentId}`}
            className="text-xs font-medium text-muted-foreground"
          >
            {t('departments.rooms.name')}
          </label>
          <input
            id={`room-name-${departmentId}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${fieldClass} w-48`}
          />
        </div>
        <Button type="submit" size="sm" disabled={createRoom.isPending}>
          {createRoom.isPending ? t('departments.rooms.adding') : t('departments.rooms.add')}
        </Button>
        {error && (
          <p role="alert" className="w-full text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </div>
  )
}
