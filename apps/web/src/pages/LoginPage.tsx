import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '@/auth/authContext'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'

/**
 * The one unauthenticated screen. Every label is a translation key and every
 * spacing class is logical (ps-/pe-, text-start), so it mirrors under dir="rtl"
 * for Dari and Pashto without a second layout.
 */
export function LoginPage() {
  const { t } = useTranslation()
  const { status, sessionEndedReason, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Already signed in (hit /login by hand, or a second tab): go home, don't show a
  // form that would re-log-in an active session.
  if (status === 'authenticated') {
    return <Navigate to="/" replace />
  }

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password)
      navigate(from, { replace: true })
    } catch (err) {
      // 401 is the only "your fault" case, and it is deliberately vague — the
      // server never says whether the username or the password was wrong, so
      // neither do we. Everything else (network down, 500) is our problem to own,
      // not the user's credentials.
      setError(
        err instanceof ApiError && err.status === 401
          ? t('auth.login.invalidCredentials')
          : t('auth.login.genericError'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const fieldClass =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

  return (
    <div className="grid min-h-svh place-items-center bg-background p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-border p-6"
      >
        <h1 className="text-xl font-semibold text-foreground">{t('auth.login.title')}</h1>

        {/* Why the last session ended, shown only if it ended on its own — not
            after a clean sign-out (which clears the reason). */}
        {sessionEndedReason && !error && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            {t(`auth.sessionEnded.${sessionEndedReason}`)}
          </p>
        )}

        <div className="space-y-1.5">
          <label htmlFor="username" className="text-sm font-medium text-foreground">
            {t('auth.login.username')}
          </label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            {t('auth.login.password')}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={fieldClass}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? t('auth.login.submitting') : t('auth.login.submit')}
        </Button>
      </form>
    </div>
  )
}
