import { createContext, useContext } from 'react'
import type { AuthUser } from '@redmars/shared'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

/**
 * What the whole app reads to know who is signed in.
 *
 * `roles` is here for one job: deciding which menu to render. It is never an
 * access decision — the server re-checks permission on every endpoint regardless
 * of what the UI chose to show. Hiding a button is courtesy; the control is on the
 * backend (task 1.3).
 */
export interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  roles: string[]
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

/** Throws outside the provider — a component reading auth with no provider above it is a wiring bug, not a runtime maybe. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>')
  }
  return ctx
}
