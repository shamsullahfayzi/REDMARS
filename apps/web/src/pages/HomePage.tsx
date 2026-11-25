import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '@/auth/authContext'
import { NAV_GROUPS, landingPathForRoles, navItemsForRoles } from '@/auth/nav'
import { ApiStatus } from '@/components/ApiStatus'
import { NAV_ICONS } from '@/components/navIcons'
import { formatNumber } from '@/lib/format'
import { useBranding } from '@/hooks/useBranding'

/**
 * The signed-in landing. It keeps the same role and facility-module filtering as
 * the sidebar, grouped by family, so multi-role users pick their work from one calm
 * screen. Operational single-role staff still land directly in their queue.
 */
export function HomePage() {
  const { t, i18n } = useTranslation()
  const { roles, enabledModules } = useAuth()

  const { data: branding } = useBranding()
  const landing = landingPathForRoles(roles, enabledModules)
  if (landing) {
    return <Navigate to={landing} replace />
  }

  const sections = navItemsForRoles(roles, enabledModules).filter((item) => item.key !== 'dashboard')
  const clinicalCount = sections.filter((item) => item.group === 'clinical').length
  const today = new Intl.DateTimeFormat(i18n.language === 'prs' ? 'fa-AF' : i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return (
    <div className="space-y-8 pb-8">
      <header className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-4 border-s-4 border-primary p-5 sm:p-6">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight">{t('nav.dashboard')}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{branding?.name ?? t('app.name')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <time>{today}</time><ApiStatus />
          </div>
        </div>
        <dl aria-label={t('home.summary.title')} className="grid border-t border-border sm:grid-cols-3 sm:divide-x sm:divide-border">
          {[[sections.length, 'workspaces'], [clinicalCount, 'clinical'], [roles.length, 'accessProfiles']].map(([count, label]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 px-5 py-3 sm:px-6">
              <dt className="text-sm text-muted-foreground">{t(`home.summary.${label}`)}</dt>
              <dd className="text-xl font-semibold tabular-nums">{formatNumber(Number(count))}</dd>
            </div>
          ))}
        </dl>
      </header>

      {NAV_GROUPS.map((group) => {
        const items = sections.filter((item) => item.group === group)
        if (items.length === 0) return null
        return (
          <section key={group} aria-labelledby={`group-${group}`}>
            <h2
              id={`group-${group}`}
              className="mb-3 text-lg font-semibold text-foreground"
            >
              {t(`home.groups.${group}`)}
            </h2>
            <div className="grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => {
                const Icon = NAV_ICONS[item.key]
                return (
                  <Link
                    key={item.key}
                    to={item.to}
                    className="group flex items-center gap-3 border-b border-e border-border bg-card px-4 py-4 transition-colors hover:bg-accent focus-visible:z-10 focus-visible:-outline-offset-2"
                  >
                    <span
                      className="flex size-7 shrink-0 items-center justify-center text-primary"
                      aria-hidden
                    >
                      {Icon && <Icon className="size-5" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-base font-medium">{t(`nav.${item.key}`)}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary rtl:rotate-180" />
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}

    </div>
  )
}
