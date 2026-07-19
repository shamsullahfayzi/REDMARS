import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ROLE_CODES, createUserRequestSchema, type RoleCode } from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateUser, useSetUserActive, useUsers } from '@/hooks/useUsers'
import { ApiError } from '@/lib/api'

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
          err instanceof ApiError && err.status === 409
            ? t('users.create.duplicate')
            : t('users.create.failed'),
        )
      },
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.users')} />

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
                {ROLE_CODES.map((code) => (
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
