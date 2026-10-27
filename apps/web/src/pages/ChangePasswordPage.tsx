import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { changePasswordRequestSchema, logoutResponseSchema } from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiPost, serverMessage } from '@/lib/api'

export function ChangePasswordPage() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const parsed = changePasswordRequestSchema.safeParse({ currentPassword, newPassword })
    if (!parsed.success || newPassword !== confirmation) {
      setError(newPassword !== confirmation ? t('auth.password.mismatch', 'New passwords must match.') :
        parsed.error?.issues[0]?.message ?? t('auth.password.invalid', 'Check your passwords.'))
      return
    }
    setBusy(true)
    try {
      await apiPost('/auth/change-password', parsed.data, logoutResponseSchema)
      setCurrentPassword(''); setNewPassword(''); setConfirmation(''); setDone(true)
    } catch (err) {
      setError(serverMessage(err) ?? t('auth.password.failed', 'Could not change password.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background p-4 text-foreground">
      <section className="w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">{t('auth.password.title', 'Change password')}</h1>
        {done ? <>
          <p role="status">{t('auth.password.done', 'Password changed. Sign in again with your new password.')}</p>
          <Button onClick={() => { logout(); navigate('/login', { replace: true }) }}>{t('auth.password.signInAgain', 'Sign in again')}</Button>
        </> : <>
          <p className="text-sm text-muted-foreground">{user?.mustChangePassword
            ? t('auth.password.required', 'Your password is temporary. Change it before using REDMARS.')
            : t('auth.password.hint', 'Use at least 12 characters. Changing your password signs out all sessions.')}</p>
          <form onSubmit={(event) => { void submit(event) }} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="current-password">{t('auth.password.current', 'Current password')}</Label>
              <Input id="current-password" type="password" autoComplete="current-password" required maxLength={256}
                value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="new-password">{t('auth.password.new', 'New password (at least 12 characters)')}</Label>
              <Input id="new-password" type="password" autoComplete="new-password" required minLength={12} maxLength={256}
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="confirm-password">{t('auth.password.confirm', 'Confirm new password')}</Label>
              <Input id="confirm-password" type="password" autoComplete="new-password" required maxLength={256}
                value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy}>{t('auth.password.save', 'Change password')}</Button>
          </form>
          {!user?.mustChangePassword && <Link to="/" className="block text-sm underline">{t('auth.password.back', 'Back to home')}</Link>}
          <Button variant="outline" onClick={logout}>{t('auth.logout')}</Button>
        </>}
      </section>
    </main>
  )
}
