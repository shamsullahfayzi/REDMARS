import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '@/auth/authContext'
import { navItemsForRoles } from '@/auth/nav'
import { LanguageToggle } from '@/components/LanguageToggle'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * App shell for signed-in users.
 *
 * Every spacing/alignment class here is logical (ps-/pe-, ms-/me-, text-start),
 * never physical (pl-/pr-, text-left). That is what lets dir="rtl" mirror this
 * without a second stylesheet. See useDocumentLanguage.
 *
 * The nav renders only the items the user's roles allow (task 1.6). That filtering
 * is courtesy — every route it exposes is still authorized server-side — so a bug
 * here shows the wrong menu, never grants the wrong access.
 */
export function RootLayout() {
  const { t } = useTranslation()
  const { user, roles, logout } = useAuth()
  const items = navItemsForRoles(roles)

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <span className="font-semibold">{t('app.name')}</span>

          <nav className="flex items-center gap-1">
            {items.map((item) => (
              <NavLink
                key={item.key}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-2.5 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                    isActive && 'bg-muted text-foreground',
                  )
                }
              >
                {t(`nav.${item.key}`)}
              </NavLink>
            ))}
          </nav>

          {/* ms-auto, not ml-auto: pushes to the inline end, so it lands on the
              right in LTR and the left in RTL. */}
          <div className="ms-auto flex items-center gap-3">
            {user && (
              <span className="text-sm text-muted-foreground">
                {t('auth.signedInAs', { name: user.fullName })}
              </span>
            )}
            <LanguageToggle />
            <Button variant="outline" size="sm" onClick={logout}>
              {t('auth.logout')}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4">
        <Outlet />
      </main>
    </div>
  )
}
