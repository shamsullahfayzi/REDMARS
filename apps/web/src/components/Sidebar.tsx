import { useTranslation } from 'react-i18next'
import { NavLink, useLocation } from 'react-router'
import type { ModuleKey } from '@redmars/shared'
import { NAV_GROUPS, navItemsForRoles, sectionsForRoles, type NavItem } from '@/auth/nav'
import { NAV_ICONS, SECTION_ICONS } from '@/components/navIcons'
import { Badge } from '@/components/ui/badge'
import { useCollectionsList } from '@/hooks/useCollections'
import { getCollectionsLastSeen } from '@/lib/collectionsSeen'
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
  enabledModules: ModuleKey[]
  open: boolean
  onClose: () => void
}

export function Sidebar({ roles, enabledModules, open, onClose }: SidebarProps) {
  const { t } = useTranslation()
  const items = navItemsForRoles(roles, enabledModules)
  const location = useLocation()

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
                  const sections = sectionsForRoles(item, roles)
                  if (sections.length > 0) {
                    return (
                      <SectionedNavItem
                        key={item.key}
                        item={item}
                        sections={sections}
                        pathname={location.pathname}
                        search={location.search}
                        onClose={onClose}
                      />
                    )
                  }
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
                      <span className="min-w-0 flex-1 truncate">{t(`nav.${item.key}`)}</span>
                      {item.key === 'collections' && <CollectionsNavBadge />}
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

/**
 * Task 6b.7 — "a badge for new arrivals". Counts unpaid lab/pharmacy bills raised since the
 * desk last opened Collections (getCollectionsLastSeen, cleared to "now" by that page on
 * mount) — not the whole outstanding pile, just what showed up since it was last checked.
 * Only mounted when the collections nav item is, so no role that cannot see the page ever
 * fires the request.
 */
function CollectionsNavBadge() {
  // Sorted newest-first server-side, so page 1 already holds every bill that could be
  // "new since last seen" — no need to page through the whole worklist for a badge count.
  const query = useCollectionsList({ page: 1 })
  const bills = query.data?.bills ?? []
  const lastSeen = getCollectionsLastSeen()
  const newCount = bills.filter((bill) => bill.createdAt > lastSeen).length

  if (newCount === 0) return null
  return (
    <Badge variant="active" className="shrink-0">
      {newCount}
    </Badge>
  )
}

/**
 * A workspace with its own sections (Finance, HR). The sections live in the sidebar so the
 * page body is only the chosen section's content, with no second row of tab buttons.
 * Expanded whenever the route is inside the workspace; the active section is the `?tab=`
 * param (the same param the page reads), falling back to the first section a user may open.
 */
function SectionedNavItem({
  item,
  sections,
  pathname,
  search,
  onClose,
}: {
  item: NavItem
  sections: ReturnType<typeof sectionsForRoles>
  pathname: string
  search: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const Icon = NAV_ICONS[item.key]
  const inside = pathname === item.to || pathname.startsWith(`${item.to}/`)
  const requested = new URLSearchParams(search).get('tab')
  const active = sections.find((s) => s.id === requested)?.id ?? sections[0].id

  return (
    <div className="space-y-0.5">
      <NavLink
        to={`${item.to}?tab=${sections[0].id}`}
        onClick={onClose}
        aria-expanded={inside}
        className={cn(
          'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
          inside
            ? 'text-sidebar-accent-foreground'
            : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
        )}
      >
        {Icon && <Icon className="size-4 shrink-0" />}
        <span className="min-w-0 flex-1 truncate">{t(`nav.${item.key}`)}</span>
      </NavLink>
      {inside && (
        <ul className="ms-4 space-y-0.5 border-s border-sidebar-border ps-2">
          {sections.map((section) => {
            const SectionIcon = section.icon ? SECTION_ICONS[section.icon] : undefined
            const isActive = section.id === active
            return (
              <li key={section.id}>
                <NavLink
                  to={`${item.to}?tab=${section.id}`}
                  onClick={onClose}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.8125rem] transition-colors',
                    isActive
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                  )}
                >
                  {SectionIcon && <SectionIcon className="size-3.5 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">
                    {t(`nav.sections.${item.key}.${section.id}`, { defaultValue: section.label })}
                  </span>
                </NavLink>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
