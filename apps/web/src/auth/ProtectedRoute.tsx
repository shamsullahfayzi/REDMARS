import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './authContext'

/**
 * Gate for everything that is not the login screen. Redirects an unauthenticated
 * visitor to /login and remembers where they were headed.
 *
 * This is convenience, not security: it stops a logged-out user seeing empty
 * chrome, but it protects nothing — every byte of real data comes from an API call
 * the server authorizes on its own. A user who deletes this component still gets
 * 401s. The control is the token, not the redirect.
 */
export function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()

  // While /auth/me is in flight we know neither yes nor no. Redirecting now would
  // bounce a signed-in user to /login for a blink on every refresh; rendering the
  // app would flash chrome we might immediately revoke. Hold on a neutral screen.
  if (status === 'loading') {
    return <div className="grid min-h-svh place-items-center text-muted-foreground">…</div>
  }

  if (status === 'unauthenticated') {
    // state.from lets the login page send the user back where they were going.
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
