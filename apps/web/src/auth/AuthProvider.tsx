import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { loginResponseSchema, meResponseSchema, type AuthUser } from '@redmars/shared'
import { apiGet, apiPost } from '@/lib/api'
import { clearTokens, getAccessToken, setTokens } from '@/lib/authTokens'
import { queryClient } from '@/lib/queryClient'
import { AuthContext, type AuthStatus } from './authContext'

interface State {
  status: AuthStatus
  user: AuthUser | null
  roles: string[]
}

const UNAUTHENTICATED: State = { status: 'unauthenticated', user: null, roles: [] }

/**
 * Owns the session. Everything below it reads identity through useAuth.
 *
 * Identity always comes from GET /auth/me, never from the login response or the
 * token itself: roles live only in that live call, so the menu can never be driven
 * by a stale claim baked into a token. login() and the on-mount rehydrate both end
 * in the same loadMe(), so there is one code path that defines "signed in".
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading', user: null, roles: [] })

  const loadMe = useCallback(async () => {
    const me = await apiGet('/auth/me', meResponseSchema)
    setState({ status: 'authenticated', user: me.user, roles: me.roles })
  }, [])

  // On mount: a token in storage is a claim to a session, not proof of one — the
  // server decides. So ask /auth/me. Success rehydrates; anything else (expired
  // token, deactivated account) clears the token and lands on unauthenticated.
  useEffect(() => {
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
    // Client-side only for now; 1.8 adds the server call that revokes the Session.
    // queryClient.clear() drops every cached response: on a shared workstation the
    // next user must never see the last one's patient data served from cache.
    clearTokens()
    queryClient.clear()
    setState(UNAUTHENTICATED)
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>{children}</AuthContext.Provider>
  )
}
