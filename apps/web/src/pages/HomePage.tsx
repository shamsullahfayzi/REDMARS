import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router'
import { Building2, ChevronRight, Layers, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/auth/authContext'
import { NAV_GROUPS, landingPathForRoles, navItemsForRoles, type NavGroup } from '@/auth/nav'
import { ApiStatus } from '@/components/ApiStatus'
import { NAV_ICONS } from '@/components/navIcons'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Icon-chip tint per group, so the three families read apart at a glance. */
const GROUP_TONE: Record<NavGroup, string> = {
  main: 'bg-primary/10 text-primary',
  clinical: 'bg-success/10 text-success',
  administration: 'bg-info/10 text-info',
}

/**
 * The signed-in landing. It keeps the same role and facility-module filtering as
 * the sidebar, grouped by family, so multi-role users pick their work from one calm
 * screen. Operational single-role staff still land directly in their queue.
 */
export function HomePage() {
  const { t } = useTranslation()
  const { user, roles, enabledModules } = useAuth()

  const landing = landingPathForRoles(roles, enabledModules)
  if (landing) {
    return <Navigate to={landing} replace />
  }

  const sections = navItemsForRoles(roles, enabledModules).filter((item) => item.key !== 'dashboard')
  const clinicalCount = sections.filter((item) => item.group === 'clinical').length
  const today = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return (
    <div className="space-y-8 pb-8">
      <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/15 via-card to-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Building2 className="size-3.5 text-primary" aria-hidden />
              {t('home.hospital')}
              <span aria-hidden>·</span>
              {today}
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              {user ? (
                <>
                  {t('home.welcomePrefix')} <bdi>{user.fullName}</bdi>
                </>
              ) : (
                t('app.name')
              )}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
              {t('home.subtitle')}
            </p>
          </div>
          <div className="rounded-2xl border bg-background/70 p-2">
            <ApiStatus />
          </div>
        </div>

        <h2 className="sr-only">{t('home.summary.title')}</h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Stat icon={Layers} value={formatNumber(sections.length)} label={t('home.summary.workspaces')} />
          <Stat icon={Building2} value={formatNumber(clinicalCount)} label={t('home.summary.clinical')} />
          <Stat icon={ShieldCheck} value={formatNumber(roles.length)} label={t('home.summary.accessProfiles')} />
        </div>
      </section>

      {NAV_GROUPS.map((group) => {
        const items = sections.filter((item) => item.group === group)
        if (items.length === 0) return null
        return (
          <section key={group} aria-labelledby={`group-${group}`}>
            <h2
              id={`group-${group}`}
              className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              {t(`home.groups.${group}`)}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => {
                const Icon = NAV_ICONS[item.key]
                return (
                  <Link
                    key={item.key}
                    to={item.to}
                    className="group flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/55 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    <span
                      className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', GROUP_TONE[group])}
                      aria-hidden
                    >
                      {Icon && <Icon className="size-5" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-base font-medium">{t(`nav.${item.key}`)}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}

      <p className="flex items-center justify-center gap-2 px-3 text-center text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
        {t('home.accessNote')}
      </p>
    </div>
  )
}

function Stat({ icon: Icon, value, label }: { icon: typeof Layers; value: string; label: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border bg-background/70 p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden>
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        <p className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</p>
      </div>
    </div>
  )
}
