import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  ROLE_CODES,
  createPractitionerAccountRequestSchema,
  createUserRequestSchema,
  resetUserPasswordRequestSchema,
  logoutResponseSchema,
  type RoleCode,
  type UserSummary,
} from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  useCreatePractitionerAccount,
  useGrantPractitionerDoctorRole,
  usePractitioners,
} from '@/hooks/usePractitioners'
import { useCreateUser, useSetUserActive, useUsers } from '@/hooks/useUsers'
import { apiPost, ApiError, serverMessage } from '@/lib/api'

const CLINICAL_ROLES = new Set<RoleCode>(['doctor', 'nurse', 'lab_tech', 'pharmacist'])
const DIRECT_ACCOUNT_ROLES = ROLE_CODES.filter((code) => !CLINICAL_ROLES.has(code))

/**
 * Admin-only staff management (task 1.7). The nav only shows this to an admin, but
 * that is courtesy — the API denies every call here to anyone else, so a non-admin
 * who reaches the page by typing the URL sees errors, not data.
 *
 * All spacing is logical (ps-/pe-, text-start) so the table and form mirror under
 * dir="rtl" for Dari and Pashto.
 */
export function UsersPage() {
  const { t } = useTranslation()
  const { user: currentUser } = useAuth()
  const usersQuery = useUsers()
  const createUser = useCreateUser()
  const setActive = useSetUserActive()

  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [roles, setRoles] = useState<RoleCode[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [resetTarget, setResetTarget] = useState<UserSummary | null>(null)
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetMessage, setResetMessage] = useState<string | null>(null)

  async function resetPassword(event: FormEvent) {
    event.preventDefault()
    if (!resetTarget) return
    const parsed = resetUserPasswordRequestSchema.safeParse({ password: temporaryPassword })
    if (!parsed.success) { setResetError(parsed.error.issues[0]?.message ?? 'Invalid temporary password'); return }
    setResetBusy(true); setResetError(null)
    try {
      await apiPost(`/users/${resetTarget.id}/reset-password`, parsed.data, logoutResponseSchema)
      setResetTarget(null); setTemporaryPassword('')
      setResetMessage(t('auth.password.resetDone', 'Temporary password issued. Existing sessions are revoked; the user must change it at sign-in.'))
    } catch (err) { setResetError(serverMessage(err) ?? t('auth.password.failed', 'Could not change password.')) }
    finally { setResetBusy(false) }
  }

  function toggleRole(code: RoleCode) {
    setRoles((current) =>
      current.includes(code) ? current.filter((r) => r !== code) : [...current, code],
    )
  }

  function resetForm() {
    setUsername('')
    setFullName('')
    setPassword('')
    setRoles([])
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)

    // Validate against the shared contract before spending a round-trip. The
    // server re-checks all of this; this is just fast feedback.
    const parsed = createUserRequestSchema.safeParse({
      username,
      fullName,
      password,
      roleCodes: roles,
    })
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? t('users.create.invalid'))
      return
    }

    createUser.mutate(parsed.data, {
      onSuccess: resetForm,
      onError: (err) => {
        // 409 is the one specific case worth naming — the username is taken.
        setFormError(
          serverMessage(err) ??
            (err instanceof ApiError && err.status === 409
              ? t('users.create.duplicate')
              : t('users.create.failed')),
        )
      },
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.users')} />

      <DoctorAccountsCard users={usersQuery.data?.users ?? []} />

      {resetMessage && <p role="status">{resetMessage}</p>}
      {resetTarget && <Card className="max-w-xl"><CardHeader><CardTitle>
        {t('auth.password.reset', 'Issue temporary password')} — {resetTarget.fullName} ({resetTarget.username})
      </CardTitle></CardHeader><CardContent>
        <form onSubmit={(event) => { void resetPassword(event) }} className="space-y-3">
          <Label htmlFor="temporary-password">{t('auth.password.temporary', 'Temporary password (at least 10 characters)')}</Label>
          <Input id="temporary-password" type="password" autoComplete="new-password" required minLength={10} maxLength={256}
            value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} />
          {resetError && <p role="alert" className="text-destructive">{resetError}</p>}
          <div className="flex gap-2"><Button disabled={resetBusy} type="submit">{t('auth.password.reset', 'Issue temporary password')}</Button>
            <Button type="button" variant="outline" disabled={resetBusy} onClick={() => { setResetTarget(null); setTemporaryPassword(''); setResetError(null) }}>
              {t('common.cancel', 'Cancel')}</Button></div>
        </form>
      </CardContent></Card>}

      {/* Create */}
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{t('users.create.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="username">{t('auth.login.username')}</Label>
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fullName">{t('users.create.fullName')}</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">{t('auth.login.password')}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('users.create.passwordHint')}</p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">
                {t('users.create.roles')}
              </legend>
              <div className="flex flex-wrap gap-3">
                {DIRECT_ACCOUNT_ROLES.map((code) => (
                  <label key={code} className="flex items-center gap-1.5 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={roles.includes(code)}
                      onChange={() => toggleRole(code)}
                    />
                    {t(`roles.${code}`)}
                  </label>
                ))}
              </div>
            </fieldset>

            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}

            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? t('users.create.submitting') : t('users.create.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* List */}
      <section className="space-y-3">
        <h2 className="font-medium text-foreground">{t('users.list.title')}</h2>

        {usersQuery.isPending && <p className="text-muted-foreground">{t('users.list.loading')}</p>}
        {usersQuery.isError && <p className="text-destructive">{t('users.list.error')}</p>}

        {usersQuery.data && (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="p-3 text-start font-medium">{t('auth.login.username')}</th>
                  <th className="p-3 text-start font-medium">{t('users.create.fullName')}</th>
                  <th className="p-3 text-start font-medium">{t('users.create.roles')}</th>
                  <th className="p-3 text-start font-medium">{t('users.list.status')}</th>
                  <th className="p-3 text-end font-medium">{t('users.list.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {usersQuery.data.users.map((u) => {
                  const isSelf = u.id === currentUser?.id
                  return (
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <td className="p-3 text-foreground">{u.username}</td>
                      <td className="p-3 text-foreground">{u.fullName}</td>
                      <td className="p-3 text-muted-foreground">
                        {u.roles.map((r) => t(`roles.${r}`)).join('، ')}
                      </td>
                      <td className="p-3">
                        <Badge variant={u.isActive ? 'active' : 'muted'}>
                          {u.isActive ? t('users.list.active') : t('users.list.inactive')}
                        </Badge>
                      </td>
                      <td className="p-3 text-end">
                        <Button variant="outline" size="sm" className="me-2" disabled={isSelf || resetBusy}
                          onClick={() => { setResetTarget(u); setTemporaryPassword(''); setResetError(null); setResetMessage(null) }}>
                          {t('auth.password.reset', 'Issue temporary password')}
                        </Button>
                        <Button
                          variant={u.isActive ? 'destructive' : 'outline'}
                          size="sm"
                          disabled={setActive.isPending || (isSelf && u.isActive)}
                          onClick={() => setActive.mutate({ id: u.id, isActive: !u.isActive })}
                        >
                          {u.isActive ? t('users.list.deactivate') : t('users.list.reactivate')}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  )
}

function DoctorAccountsCard({ users }: { users: UserSummary[] }) {
  const { t } = useTranslation()
  const practitionersQuery = usePractitioners()
  const createAccount = useCreatePractitionerAccount()
  const grantRole = useGrantPractitionerDoctorRole()
  const [practitionerId, setPractitionerId] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const practitioners = practitionersQuery.data?.practitioners.filter((p) => p.isActive) ?? []
  const usersById = new Map(users.map((user) => [user.id, user]))
  const unlinked = practitioners.filter((p) => !p.userId)
  const missingDoctorRole = practitioners.filter(
    (p) => p.userId && !usersById.get(p.userId)?.roles.includes('doctor'),
  )
  const doctorUsers = users.filter((user) => user.roles.includes('doctor'))

  function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    const parsed = createPractitionerAccountRequestSchema.safeParse({
      username,
      email: email || undefined,
      password,
    })
    if (!practitionerId || !parsed.success) {
      setError(parsed.success ? t('users.doctors.choose') : parsed.error.issues[0]?.message)
      return
    }
    createAccount.mutate(
      { id: practitionerId, input: parsed.data },
      {
        onSuccess: () => {
          setPractitionerId('')
          setUsername('')
          setEmail('')
          setPassword('')
          setMessage(t('users.doctors.created'))
        },
        onError: (failure) => setError(serverMessage(failure) ?? t('users.doctors.failed')),
      },
    )
  }

  return (
    <Card className="max-w-3xl border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle>{t('users.doctors.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">{t('users.doctors.help')}</p>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t('users.doctors.existing')}</h3>
          {doctorUsers.length ? (
            <div className="flex flex-wrap gap-2">
              {doctorUsers.map((user) => (
                <Badge key={user.id} variant={user.isActive ? 'active' : 'muted'}>
                  {user.fullName} ({user.username})
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('users.doctors.none')}</p>
          )}
        </div>

        {missingDoctorRole.length > 0 && (
          <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
            <h3 className="text-sm font-medium">{t('users.doctors.missingRole')}</h3>
            {missingDoctorRole.map((practitioner) => {
              const user = practitioner.userId ? usersById.get(practitioner.userId) : undefined
              return (
                <div key={practitioner.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">
                    {practitioner.firstName} {practitioner.lastName} · {user?.username}
                  </span>
                  <Button
                    size="sm"
                    disabled={grantRole.isPending}
                    onClick={() =>
                      grantRole.mutate(practitioner.id, {
                        onSuccess: () => setMessage(t('users.doctors.granted')),
                        onError: (failure) =>
                          setError(serverMessage(failure) ?? t('users.doctors.failed')),
                      })
                    }
                  >
                    {t('users.doctors.grant')}
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        {unlinked.length > 0 && (
          <form className="space-y-3 border-t border-border pt-4" onSubmit={submit}>
            <h3 className="font-medium">{t('users.doctors.create')}</h3>
            <Select value={practitionerId} onChange={(event) => setPractitionerId(event.target.value)}>
              <option value="">{t('users.doctors.select')}</option>
              {unlinked.map((practitioner) => (
                <option key={practitioner.id} value={practitioner.id}>
                  {practitioner.firstName} {practitioner.lastName} ({practitioner.code})
                </option>
              ))}
            </Select>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={t('auth.login.username')}
                autoComplete="off"
              />
              <Input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('users.doctors.email')}
                type="email"
              />
            </div>
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('users.doctors.password')}
              type="password"
              autoComplete="new-password"
            />
            <Button disabled={createAccount.isPending}>{t('users.doctors.createButton')}</Button>
          </form>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm text-emerald-700">{message}</p>}
        <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} to="/hr?tab=employees">
          {t('users.create.openHr')}
        </Link>
      </CardContent>
    </Card>
  )
}
