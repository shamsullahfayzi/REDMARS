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
export interface NavItem {
  key: string
  to: string
  roles: readonly string[]
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'queue', to: '/queue', roles: ['admin', 'receptionist', 'nurse', 'doctor', 'management'] },
  {
    key: 'patients',
    to: '/patients',
    roles: ['admin', 'receptionist', 'nurse', 'doctor', 'lab_tech', 'pharmacist'],
  },
  { key: 'consultations', to: '/consultations', roles: ['doctor'] },
  { key: 'lab', to: '/lab', roles: ['lab_tech'] },
  { key: 'pharmacy', to: '/pharmacy', roles: ['pharmacist'] },
  { key: 'users', to: '/users', roles: ['admin'] },
  { key: 'departments', to: '/departments', roles: ['admin'] },
  { key: 'reports', to: '/reports', roles: ['admin', 'management'] },
]

/** The items a user holding these roles should see — the union of every role's menu. */
export function navItemsForRoles(userRoles: readonly string[]): NavItem[] {
  const held = new Set(userRoles)
  return NAV_ITEMS.filter((item) => item.roles.some((role) => held.has(role)))
}
