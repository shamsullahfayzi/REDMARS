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
  // Task 6b.9 narrowed this to the roles that go looking for a patient not already in
  // front of them (`patient.search`). Lab tech and pharmacist work their own queue —
  // a lab order or a prescription that already names one — and lost the free-text box.
  {
    key: 'patients',
    to: '/patients',
    group: 'clinical',
    roles: ['admin', 'receptionist', 'nurse', 'doctor'],
  },
  { key: 'consultations', to: '/consultations', group: 'clinical', roles: ['doctor'] },
  // Task 4.15 — the recall list, matching `follow_up.read`. THE RECEPTIONIST IS HERE and
  // that is the point of the feature: the desk is who rings a patient who did not come
  // back. Management is not — every other list they hold is counts and money, and this is
  // named patients with phone numbers.
  {
    key: 'followUps',
    to: '/follow-ups',
    group: 'clinical',
    roles: ['admin', 'receptionist', 'doctor'],
  },
  { key: 'icd', to: '/icd', group: 'clinical', roles: ['admin', 'doctor'] },
  {
    key: 'interactions',
    to: '/interactions',
    group: 'clinical',
    roles: ['admin', 'doctor', 'pharmacist'],
  },
  { key: 'lab', to: '/lab', group: 'clinical', roles: ['admin', 'lab_tech'], module: 'lab' },
  { key: 'pharmacy', to: '/pharmacy', group: 'clinical', roles: ['pharmacist'] },
  // Task 6.1 — the billing register, matching `invoice.list`. Grouped with the other
  // money-and-numbers screens (reports) rather than the clinical desk. Not module-gated,
  // for the same reason the reception desk is not: reading an OPD bill is core, not the
  // billing module's later apparatus.
  //
  // Task 6b.9 removed the receptionist: browsing every bill the facility ever raised is
  // how the front desk would back into the hospital's revenue, and Farhat's owner and
  // management were explicit that is not the desk's to see. Collections (below) is the
  // desk's actual daily tool — an outstanding-bills worklist, not a revenue ledger.
  {
    key: 'invoices',
    to: '/invoices',
    group: 'administration',
    roles: ['admin', 'pharmacist', 'management'],
  },
  // Task 6b.7 — every unpaid lab or pharmacy bill, one list, no patient search needed first.
  // Reception keeps this: money still OWED is a worklist, not the revenue ledger 6b.9 took
  // the register away over.
  {
    key: 'collections',
    to: '/collections',
    group: 'administration',
    roles: ['admin', 'receptionist', 'pharmacist', 'management'],
  },
  // Task 6.12 — the daily till. The receptionist and pharmacist reconcile their own drawer
  // (payment.receive); an admin or manager sees every till (report.financial). Same set as
  // the people who touch money, so the menu matches who has a drawer to close.
  {
    key: 'till',
    to: '/till',
    group: 'administration',
    roles: ['admin', 'receptionist', 'pharmacist', 'management'],
  },
  { key: 'users', to: '/users', group: 'administration', roles: ['admin'] },
  // Task 6b.1 — the R10 discount ceiling, an admin-set number now instead of a constant.
  { key: 'settings', to: '/settings', group: 'administration', roles: ['admin'] },
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

/**
 * Task 6b.10 — where a role lands instead of the dashboard, keyed by the ONE nav item
 * that role's actual work queue is. Only for someone holding exactly one of these roles:
 * a receptionist who is also a nurse, or an admin, has no single queue to default to —
 * picking one for them would be a guess, and the dashboard's full menu already serves
 * that case. Admin and management are deliberately absent — neither has an operational
 * queue, only configuration and oversight, which the dashboard already is.
 */
const ROLE_LANDING: Record<string, string> = {
  receptionist: 'reception',
  nurse: 'queue',
  doctor: 'consultations',
  lab_tech: 'lab',
  pharmacist: 'pharmacy',
}

/**
 * The route a single-role user should land on instead of the dashboard, or null when the
 * dashboard is still the right landing — more than one role, no mapped role, or the
 * mapped item's module is off for this facility (checked through navItemsForRoles so this
 * can never send someone to a page their own sidebar would hide).
 */
export function landingPathForRoles(
  userRoles: readonly string[],
  enabledModules: readonly ModuleKey[],
): string | null {
  if (userRoles.length !== 1) return null
  const key = ROLE_LANDING[userRoles[0]]
  if (!key) return null
  const item = navItemsForRoles(userRoles, enabledModules).find((i) => i.key === key)
  return item?.to ?? null
}
