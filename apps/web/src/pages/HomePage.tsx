import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router'
import { Building2, ChevronRight, Layers, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/auth/authContext'
import { landingPathForRoles, navItemsForRoles, type NavGroup } from '@/auth/nav'
import { ApiStatus } from '@/components/ApiStatus'
import { NAV_ICONS } from '@/components/navIcons'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

const GROUP_TONE: Record<NavGroup, string> = {
  main: 'home-neo-tone-primary',
  clinical: 'home-neo-tone-clinical',
  administration: 'home-neo-tone-administration',
}

/**
 * The signed-in landing. It keeps the same role and facility-module filtering as
 * the sidebar while giving multi-role users a calmer, easier place to choose work.
 * Operational single-role staff still land directly in their queue.
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

  return (
    <div className="home-neumorphic rounded-[2rem] p-3 sm:p-5 lg:p-7">
      <section className="home-neo-raised home-neo-hero relative isolate overflow-hidden rounded-[1.75rem] p-6 sm:p-8 lg:p-10">
        <div className="home-neo-orb home-neo-orb-primary" aria-hidden />
        <div className="home-neo-orb home-neo-orb-secondary" aria-hidden />

        <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/55 px-3 py-1.5 text-xs font-semibold tracking-wide text-foreground/75 shadow-sm backdrop-blur-sm dark:bg-white/8">
              <Building2 className="size-4 text-primary" aria-hidden />
              {t('home.hospital')}
            </div>
            <h1 className="max-w-xl text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-4xl lg:text-5xl">
              {user ? (
                <>
                  {t('home.welcomePrefix')} <bdi>{user.fullName}</bdi>
                </>
              ) : (
                t('app.name')
              )}
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              {t('home.subtitle')}
            </p>
          </div>

          <div className="home-neo-inset justify-self-start rounded-2xl p-2 lg:justify-self-end">
            <ApiStatus />
          </div>
        </div>
      </section>

      <section className="mt-5" aria-labelledby="workspace-summary-title">
        <h2 id="workspace-summary-title" className="sr-only">
          {t('home.summary.title')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCard
            icon={Layers}
            value={formatNumber(sections.length)}
            label={t('home.summary.workspaces')}
          />
          <SummaryCard
            icon={Building2}
            value={formatNumber(clinicalCount)}
            label={t('home.summary.clinical')}
          />
          <SummaryCard
            icon={ShieldCheck}
            value={formatNumber(roles.length)}
            label={t('home.summary.accessProfiles')}
          />
        </div>
      </section>

      <section className="mt-8" aria-labelledby="hospital-modules-title">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {t('home.workspaceEyebrow')}
            </p>
            <h2 id="hospital-modules-title" className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              {t('home.modulesTitle')}
            </h2>
          </div>
          <p className="max-w-md text-sm text-muted-foreground">{t('home.modulesHint')}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((item) => {
            const Icon = NAV_ICONS[item.key]
            return (
              <Link
                key={item.key}
                to={item.to}
                className={cn(
                  'home-neo-module group rounded-2xl p-5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/55',
                  GROUP_TONE[item.group],
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="home-neo-icon flex size-12 shrink-0 items-center justify-center rounded-2xl" aria-hidden>
                    {Icon && <Icon className="size-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t(`home.groups.${item.group}`)}
                    </p>
                    <h3 className="mt-1 truncate text-base font-semibold text-foreground">
                      {t(`nav.${item.key}`)}
                    </h3>
                    <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                      {t('home.openWorkspace')}
                      <ChevronRight className="size-4 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <p className="mt-7 flex items-center justify-center gap-2 px-3 text-center text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
        {t('home.accessNote')}
      </p>
    </div>
  )
}

interface SummaryCardProps {
  icon: typeof Layers
  value: string
  label: string
}

function SummaryCard({ icon: Icon, value, label }: SummaryCardProps) {
  return (
    <div className="home-neo-summary flex items-center gap-4 rounded-2xl p-4 sm:p-5">
      <div className="home-neo-icon flex size-11 shrink-0 items-center justify-center rounded-xl" aria-hidden>
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        <p className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</p>
      </div>
    </div>
  )
}
