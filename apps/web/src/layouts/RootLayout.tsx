import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'
import { Menu } from 'lucide-react'
import { useAuth } from '@/auth/authContext'
import { LanguageToggle } from '@/components/LanguageToggle'
import { Sidebar } from '@/components/Sidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'

/**
 * App shell for signed-in users: a fixed sidebar and a top bar over the routed
 * content.
 *
 * Every spacing/alignment class here is logical (ps-/pe-, ms-/me-, border-e,
 * text-start), never physical — that is what lets dir="rtl" mirror the whole shell
 * without a second stylesheet. See useDocumentLanguage.
 */
export function RootLayout() {
  const { t } = useTranslation()
  const { user, roles, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <Sidebar roles={roles} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label={t('nav.open')}
          >
            <Menu />
          </Button>

          <div className="ms-auto flex items-center gap-2">
            {user && (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {t('auth.signedInAs', { name: user.fullName })}
              </span>
            )}
            <LanguageToggle />
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={logout}>
              {t('auth.logout')}
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
