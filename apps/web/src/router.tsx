import { createBrowserRouter } from 'react-router'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { RootLayout } from '@/layouts/RootLayout'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { DepartmentPage } from '@/pages/DepartmentsPage'
import { PractitionersPage } from '@/pages/PractitionersPage'
import { UsersPage } from '@/pages/UsersPage'

/**
 * /login is the only route outside the gate. Everything else sits under
 * ProtectedRoute, which sends an unauthenticated visitor there and back.
 *
 * The feature paths render placeholders — their real screens land in later phases.
 * They exist now so the role-based nav has honest destinations, and their keys
 * match auth/nav.ts so the menu and the routes cannot drift apart.
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <RootLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'queue', element: <PlaceholderPage sectionKey="queue" /> },
          { path: 'patients', element: <PlaceholderPage sectionKey="patients" /> },
          { path: 'consultations', element: <PlaceholderPage sectionKey="consultations" /> },
          { path: 'lab', element: <PlaceholderPage sectionKey="lab" /> },
          { path: 'pharmacy', element: <PlaceholderPage sectionKey="pharmacy" /> },
          { path: 'users', element: <UsersPage /> },
          { path: 'departments', element: <DepartmentPage /> },
          { path: 'practitioners', element: <PractitionersPage /> },
          { path: 'reports', element: <PlaceholderPage sectionKey="reports" /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
