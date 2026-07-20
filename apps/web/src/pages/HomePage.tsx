import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '@/auth/authContext'
import { navItemsForRoles } from '@/auth/nav'
import { ApiStatus } from '@/components/ApiStatus'
import { NAV_ICONS } from '@/components/navIcons'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * The signed-in landing. A greeting plus quick-access cards to exactly the sections
 * this user's roles allow — the same filtered set the sidebar shows, so the two
 * cannot disagree about what a role can reach.
 */
export function HomePage() {
  const { t } = useTranslation()
  const { user, roles, enabledModules } = useAuth()

  // The dashboard links everywhere except back to itself.
  const sections = navItemsForRoles(roles, enabledModules).filter((item) => item.key !== 'dashboard')

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={user ? t('home.welcome', { name: user.fullName }) : t('app.name')}
          description={t('home.subtitle')}
        />
        <ApiStatus />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((item) => {
          const Icon = NAV_ICONS[item.key]
          return (
            <Link
              key={item.key}
              to={item.to}
              className={cn(
                'group focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                'rounded-xl',
              )}
            >
              <Card className="flex items-center gap-3 p-4 transition-colors hover:border-ring hover:bg-muted/40">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                  {Icon && <Icon className="size-4.5" />}
                </div>
                <span className="font-medium text-foreground">{t(`nav.${item.key}`)}</span>
                <ChevronRight className="ms-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
