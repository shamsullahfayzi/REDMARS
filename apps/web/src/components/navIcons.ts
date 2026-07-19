import {
  BarChart3,
  Building2,
  Clock,
  FlaskConical,
  LayoutDashboard,
  Pill,
  Receipt,
  Tablets,
  Stethoscope,
  Users,
  UserCog,
  UserRound,
  type LucideIcon,
} from 'lucide-react'

/** One icon per nav key. Shared by the sidebar and the dashboard so they never drift. */
export const NAV_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  queue: Clock,
  patients: UserRound,
  consultations: Stethoscope,
  lab: FlaskConical,
  pharmacy: Pill,
  users: UserCog,
  departments: Building2,
  practitioners: Users,
  services: Receipt,
  drugs: Tablets,
  reports: BarChart3,
}
