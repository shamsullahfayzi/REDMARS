import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { NAV_GROUPS, navItemsForRoles } from '@/auth/nav'
import { NAV_ICONS } from '@/components/navIcons'
import { cn } from '@/lib/utils'

/**
 * The left navigation. Renders only the items the user's roles allow (task 1.6) —
 * courtesy, not control; the API re-checks every route. Items are grouped into
 * sections so a growing menu stays legible.
 *
 * Logical properties throughout (border-e, start-0, ps-/pe-) so the whole rail
 * mirrors to the right edge under dir="rtl". On mobile it is a slide-over gated on
 * `open`; on md+ it is a static column.
 */

interface SidebarProps {
  roles: string[]
  open: boolean
  onClose: () => void
}

export function Sidebar({ roles, open, onClose }: SidebarProps) {
  const { t } = useTranslation()
  const items = navItemsForRoles(roles)

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'z-40 flex w-60 shrink-0 flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground',
          'md:static md:flex',
          open ? 'fixed inset-y-0 start-0 flex' : 'hidden',
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            R
          </div>
          <span className="font-semibold tracking-tight">{t('app.name')}</span>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          {NAV_GROUPS.map((group) => {
            const groupItems = items.filter((item) => item.group === group)
            if (groupItems.length === 0) return null

            return (
              <div key={group} className="space-y-1">
                {group !== 'main' && (
                  <p className="px-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t(`nav.groups.${group}`)}
                  </p>
                )}
                {groupItems.map((item) => {
                  const Icon = NAV_ICONS[item.key]
                  return (
                    <NavLink
                      key={item.key}
                      to={item.to}
                      end={item.to === '/'}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                        )
                      }
                    >
                      {Icon && <Icon className="size-4 shrink-0" />}
                      <span className="truncate">{t(`nav.${item.key}`)}</span>
                    </NavLink>
                  )
                })}
              </div>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
