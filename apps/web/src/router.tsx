import { createBrowserRouter } from 'react-router'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { RootLayout } from '@/layouts/RootLayout'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { CreatePatientPage } from '@/pages/CreatePatientPage'
import { DepartmentPage } from '@/pages/DepartmentsPage'
import { DrugsPage } from '@/pages/DrugsPage'
import { IcdLookupPage } from '@/pages/IcdLookupPage'
import { InteractionCheckerPage } from '@/pages/InteractionCheckerPage'
import { LabPanelsPage } from '@/pages/LabPanelsPage'
import { ModulesPage } from '@/pages/ModulesPage'
import { LabTestsPage } from '@/pages/LabTestsPage'
import { PatientDetailPage } from '@/pages/PatientDetailPage'
import { PatientsPage } from '@/pages/PatientsPage'
import { PractitionersPage } from '@/pages/PractitionersPage'
import { ServicesPage } from '@/pages/ServicesPage'
import { StartVisitPage } from '@/pages/StartVisitPage'
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
          { path: 'patients', element: <PatientsPage /> },
          { path: 'patients/new', element: <CreatePatientPage /> },
          { path: 'patients/:id', element: <PatientDetailPage /> },
          { path: 'patients/:id/visit', element: <StartVisitPage /> },
          { path: 'consultations', element: <PlaceholderPage sectionKey="consultations" /> },
          { path: 'icd', element: <IcdLookupPage /> },
          { path: 'interactions', element: <InteractionCheckerPage /> },
          { path: 'lab', element: <PlaceholderPage sectionKey="lab" /> },
          { path: 'pharmacy', element: <PlaceholderPage sectionKey="pharmacy" /> },
          { path: 'users', element: <UsersPage /> },
          { path: 'modules', element: <ModulesPage /> },
          { path: 'departments', element: <DepartmentPage /> },
          { path: 'practitioners', element: <PractitionersPage /> },
          { path: 'services', element: <ServicesPage /> },
          { path: 'lab-tests', element: <LabTestsPage /> },
          { path: 'lab-panels', element: <LabPanelsPage /> },
          { path: 'drugs', element: <DrugsPage /> },
          { path: 'reports', element: <PlaceholderPage sectionKey="reports" /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
