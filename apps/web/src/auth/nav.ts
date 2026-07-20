/**
 * The menu, and which roles see each item.
 *
 * Visibility only — this is courtesy, not a control. Every route an item leads to
 * is re-checked by the server on its own permission (task 1.3), so a user who
 * reaches a hidden route by typing the URL still gets a 403. Keyed by role because
 * the menu is coarse ("doctors see Consultations"); fine-grained access is the
 * permission matrix's job, not the nav's.
 *
 * The destinations are placeholders until their phases land — the point of 1.6 is
 * that the RIGHT set renders per role, not that the screens behind them exist yet.
 */
/** The sidebar sections, in render order. Every NavItem names one. */
export const NAV_GROUPS = ['main', 'clinical', 'administration'] as const
export type NavGroup = (typeof NAV_GROUPS)[number]

export interface NavItem {
  key: string
  to: string
  group: NavGroup
  roles: readonly string[]
}

// Roles that can see everything role-gated open to all — kept here so "visible to
// everyone" (like the dashboard) is spelled once.
const ALL_ROLES = [
  'admin',
  'receptionist',
  'nurse',
  'doctor',
  'lab_tech',
  'pharmacist',
  'management',
] as const

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'dashboard', to: '/', group: 'main', roles: ALL_ROLES },
  {
    key: 'queue',
    to: '/queue',
    group: 'clinical',
    roles: ['admin', 'receptionist', 'nurse', 'doctor', 'management'],
  },
  {
    key: 'patients',
    to: '/patients',
    group: 'clinical',
    roles: ['admin', 'receptionist', 'nurse', 'doctor', 'lab_tech', 'pharmacist'],
  },
  { key: 'consultations', to: '/consultations', group: 'clinical', roles: ['doctor'] },
  { key: 'icd', to: '/icd', group: 'clinical', roles: ['admin', 'doctor'] },
  { key: 'lab', to: '/lab', group: 'clinical', roles: ['lab_tech'] },
  { key: 'pharmacy', to: '/pharmacy', group: 'clinical', roles: ['pharmacist'] },
  { key: 'users', to: '/users', group: 'administration', roles: ['admin'] },
  { key: 'departments', to: '/departments', group: 'administration', roles: ['admin'] },
  { key: 'practitioners', to: '/practitioners', group: 'administration', roles: ['admin'] },
  { key: 'services', to: '/services', group: 'administration', roles: ['admin'] },
  { key: 'labTests', to: '/lab-tests', group: 'administration', roles: ['admin', 'lab_tech'] },
  { key: 'labPanels', to: '/lab-panels', group: 'administration', roles: ['admin'] },
  { key: 'drugs', to: '/drugs', group: 'administration', roles: ['admin', 'pharmacist'] },
  { key: 'reports', to: '/reports', group: 'administration', roles: ['admin', 'management'] },
]

/** The items a user holding these roles should see — the union of every role's menu. */
export function navItemsForRoles(userRoles: readonly string[]): NavItem[] {
  const held = new Set(userRoles)
  return NAV_ITEMS.filter((item) => item.roles.some((role) => held.has(role)))
}
