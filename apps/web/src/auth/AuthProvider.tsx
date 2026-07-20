import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  loginResponseSchema,
  logoutResponseSchema,
  meResponseSchema,
  type AuthUser,
  type ModuleKey,
  type SessionEndedReason,
} from '@redmars/shared'
import { apiGet, apiPost, setOnSessionEnded } from '@/lib/api'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/lib/authTokens'
import { queryClient } from '@/lib/queryClient'
import { AuthContext, type AuthStatus } from './authContext'

interface State {
  status: AuthStatus
  user: AuthUser | null
  roles: string[]
  enabledModules: ModuleKey[]
  sessionEndedReason: SessionEndedReason | null
}

const UNAUTHENTICATED: State = {
  status: 'unauthenticated',
  user: null,
  roles: [],
  enabledModules: [],
  sessionEndedReason: null,
}

/**
 * Owns the session. Everything below it reads identity through useAuth.
 *
 * Identity always comes from GET /auth/me, never from the login response or the
 * token itself: roles live only in that live call, so the menu can never be driven
 * by a stale claim baked into a token. login() and the on-mount rehydrate both end
 * in the same loadMe(), so there is one code path that defines "signed in".
 *
 * The api layer refreshes the access token silently on a 401; only when a refresh
 * is REFUSED (signed in elsewhere, deactivated, expired) does it call back here,
 * and we drop to unauthenticated with the reason so the login screen can explain.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({
    status: 'loading',
    user: null,
    roles: [],
    enabledModules: [],
    sessionEndedReason: null,
  })

  const loadMe = useCallback(async () => {
    const me = await apiGet('/auth/me', meResponseSchema)
    setState({
      status: 'authenticated',
      user: me.user,
      roles: me.roles,
      enabledModules: me.enabledModules,
      sessionEndedReason: null,
    })
  }, [])

  // Register the "session ended" handler once, and drop the query cache too — the
  // ended session's data must not linger for whoever logs in next.
  useEffect(() => {
    setOnSessionEnded((reason) => {
      queryClient.clear()
      setState({ ...UNAUTHENTICATED, sessionEndedReason: reason })
    })
  }, [])

  // On mount: a token in storage is a claim to a session, not proof of one — the
  // server decides. So ask /auth/me. Success rehydrates; anything else (expired
  // token, deactivated account) clears the token and lands on unauthenticated.
  const bootstrapped = useRef(false)
  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true
    if (!getAccessToken()) {
      setState(UNAUTHENTICATED)
      return
    }
    loadMe().catch(() => {
      clearTokens()
      setState(UNAUTHENTICATED)
    })
  }, [loadMe])

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await apiPost('/auth/login', { username, password }, loginResponseSchema)
      setTokens(res)
      try {
        await loadMe()
      } catch (err) {
        // Tokens stored but identity would not load: do not leave a half-signed-in
        // state (a token and no user). Roll it back and surface the failure.
        clearTokens()
        setState(UNAUTHENTICATED)
        throw err
      }
    },
    [loadMe],
  )

  const logout = useCallback(() => {
    // Tell the server to revoke the session so its refresh token is dead, then
    // clear locally. Best-effort: a failed call (offline) must still sign the user
    // out on this device, so we clear regardless of what the server says.
    const refreshToken = getRefreshToken()
    if (refreshToken) {
      void apiPost('/auth/logout', { refreshToken }, logoutResponseSchema).catch(() => {
        // Nothing to do — local sign-out below is what the user asked for.
      })
    }
    clearTokens()
    queryClient.clear()
    setState(UNAUTHENTICATED)
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>{children}</AuthContext.Provider>
  )
}
