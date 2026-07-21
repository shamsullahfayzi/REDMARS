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
import type { ModuleKey } from '@redmars/shared'

export const NAV_GROUPS = ['main', 'clinical', 'administration'] as const
export type NavGroup = (typeof NAV_GROUPS)[number]

export interface NavItem {
  key: string
  to: string
  group: NavGroup
  roles: readonly string[]
  /**
   * The optional module this item belongs to (task 2.13). Hidden when that module is
   * off for the facility. Omitted = OPD core, always shown. Courtesy only — the
   * ModuleGuard re-checks the endpoints regardless of what the menu rendered.
   */
  module?: ModuleKey
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
  // The desk's home screen (task 3.6). Receptionist only, matching `visit.create` —
  // the one route that registers, queues, bills and takes cash in a single save.
  { key: 'reception', to: '/reception', group: 'clinical', roles: ['receptionist'] },
  {
    key: 'queue',
    to: '/queue',
    group: 'clinical',
    roles: ['admin', 'receptionist', 'nurse', 'doctor', 'management'],
  },
  // The book. Everyone who may read it (appointment.read) — the desk works from it each
  // morning, a doctor glances ahead from it.
  {
    key: 'appointments',
    to: '/appointments',
    group: 'clinical',
    roles: ['admin', 'receptionist', 'nurse', 'doctor', 'management'],
  },
  {
    key: 'patients',
    to: '/patients',
    group: 'clinical',
    roles: ['admin', 'receptionist', 'nurse', 'doctor', 'lab_tech', 'pharmacist'],
  },
  // Receptionist only, matching `patient.create` — the desk registers, so there is one
  // till and one duplicate-check path. Showing it to an admin would lead to a 403.
  { key: 'patientNew', to: '/patients/new', group: 'clinical', roles: ['receptionist'] },
  { key: 'consultations', to: '/consultations', group: 'clinical', roles: ['doctor'] },
  { key: 'icd', to: '/icd', group: 'clinical', roles: ['admin', 'doctor'] },
  {
    key: 'interactions',
    to: '/interactions',
    group: 'clinical',
    roles: ['admin', 'doctor', 'pharmacist'],
  },
  { key: 'lab', to: '/lab', group: 'clinical', roles: ['lab_tech'], module: 'lab' },
  { key: 'pharmacy', to: '/pharmacy', group: 'clinical', roles: ['pharmacist'] },
  { key: 'users', to: '/users', group: 'administration', roles: ['admin'] },
  { key: 'modules', to: '/modules', group: 'administration', roles: ['admin'] },
  { key: 'departments', to: '/departments', group: 'administration', roles: ['admin'] },
  { key: 'practitioners', to: '/practitioners', group: 'administration', roles: ['admin'] },
  { key: 'services', to: '/services', group: 'administration', roles: ['admin'] },
  {
    key: 'labTests',
    to: '/lab-tests',
    group: 'administration',
    roles: ['admin', 'lab_tech'],
    module: 'lab',
  },
  { key: 'labPanels', to: '/lab-panels', group: 'administration', roles: ['admin'], module: 'lab' },
  { key: 'drugs', to: '/drugs', group: 'administration', roles: ['admin', 'pharmacist'] },
  { key: 'reports', to: '/reports', group: 'administration', roles: ['admin', 'management'] },
]

/**
 * The items a user should see — role allows it AND its module (if any) is on. Roles
 * are the union of every held role's menu; a module-tagged item also needs that
 * module enabled for the facility. Both are courtesy: the server re-checks the
 * permission and (for gated routes) the module on every request.
 */
export function navItemsForRoles(
  userRoles: readonly string[],
  enabledModules: readonly ModuleKey[],
): NavItem[] {
  const held = new Set(userRoles)
  const on = new Set(enabledModules)
  return NAV_ITEMS.filter(
    (item) =>
      item.roles.some((role) => held.has(role)) &&
      (item.module === undefined || on.has(item.module)),
  )
}
