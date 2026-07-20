import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import type { ModuleKey } from '@redmars/shared'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useFacilityModules, useSetFacilityModule } from '@/hooks/useFacilityModules'

/**
 * Admin screen for the facility's optional modules (task 2.12) — a list of switches.
 * OPD is shown as a permanently-on, locked row so it is clear it exists and is not an
 * oversight, but it can never be turned off: the system is OPD.
 *
 * Toggling records the flag. The enforcement — hiding a disabled module in the nav
 * and 403-ing its endpoints — is the ModuleGuard (task 2.13); this screen does not
 * claim to block anything on its own.
 */
export function ModulesPage() {
  const { t } = useTranslation()
  const modulesQuery = useFacilityModules()
  const setModule = useSetFacilityModule()

  const modules = modulesQuery.data?.modules ?? []
  const pendingModule = setModule.isPending
    ? (setModule.variables?.module ?? null)
    : null

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.modules')} description={t('modules.subtitle')} />

      {modulesQuery.isError && <p className="text-sm text-destructive">{t('modules.loadError')}</p>}
      {setModule.isError && <p className="text-sm text-destructive">{t('modules.error')}</p>}

      <Card className="max-w-2xl divide-y divide-border p-0">
        {/* OPD — the core, always on, never toggleable. */}
        <div className="flex items-center justify-between gap-4 p-4">
          <div>
            <p className="font-medium text-foreground">{t('modules.names.opd')}</p>
            <p className="text-sm text-muted-foreground">{t('modules.opdNote')}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <Lock className="size-3.5" aria-hidden />
            {t('modules.alwaysOn')}
          </span>
        </div>

        {modules.map((mod) => {
          const key = mod.module as ModuleKey
          return (
            <div key={key} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium text-foreground">{t(`modules.names.${key}`)}</p>
                <p className="text-sm text-muted-foreground">
                  {mod.enabled ? t('modules.on') : t('modules.off')}
                </p>
              </div>
              <Switch
                checked={mod.enabled}
                disabled={pendingModule === key}
                onCheckedChange={(enabled) => setModule.mutate({ module: key, enabled })}
                aria-label={t(`modules.names.${key}`)}
              />
            </div>
          )
        })}
      </Card>
    </div>
  )
}
