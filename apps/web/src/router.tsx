import { createBrowserRouter, Navigate } from 'react-router'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { RootLayout } from '@/layouts/RootLayout'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { AppointmentsPage } from '@/pages/AppointmentsPage'
import { CollectionsPage } from '@/pages/CollectionsPage'
import { ConsultPage } from '@/pages/ConsultPage'
import { MyConsultationsPage } from '@/pages/MyConsultationsPage'
import { FollowUpsPage } from '@/pages/FollowUpsPage'
import { DepartmentPage } from '@/pages/DepartmentsPage'
import { DrugsPage } from '@/pages/DrugsPage'
import { IcdLookupPage } from '@/pages/IcdLookupPage'
import { InvoicesPage } from '@/pages/InvoicesPage'
import { InteractionCheckerPage } from '@/pages/InteractionCheckerPage'
import { LabPanelsPage } from '@/pages/LabPanelsPage'
import { LabQueuePage } from '@/pages/LabQueuePage'
import { ModulesPage } from '@/pages/ModulesPage'
import { LabTestsPage } from '@/pages/LabTestsPage'
import { PatientDetailPage } from '@/pages/PatientDetailPage'
import { PatientsPage } from '@/pages/PatientsPage'
import { PharmacyPage } from '@/pages/PharmacyPage'
import { PractitionersPage } from '@/pages/PractitionersPage'
import { TillPage } from '@/pages/TillPage'
import { QueuePage } from '@/pages/QueuePage'
import { ReceptionPage } from '@/pages/ReceptionPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { ServicesPage } from '@/pages/ServicesPage'
import { SettingsPage } from '@/pages/SettingsPage'
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
          { path: 'reception', element: <ReceptionPage /> },
          { path: 'queue', element: <QueuePage /> },
          { path: 'appointments', element: <AppointmentsPage /> },
          { path: 'patients', element: <PatientsPage /> },
          // Task 6b.2 — registration without a visit is retired: it left patients created
          // with no department and no billable line, and nothing ever forced reception to
          // come back and add one. Every registration now goes through check-in instead.
          { path: 'patients/new', element: <Navigate to="/reception" replace /> },
          { path: 'patients/:id', element: <PatientDetailPage /> },
          { path: 'patients/:id/visit', element: <StartVisitPage /> },
          // The doctor's own day. A placeholder since task 1.6 — the sidebar has pointed
          // a doctor at a dead page the whole time, while their real entry point was the
          // queue. It is NOT a second queue: see the page for what the two questions are.
          { path: 'consultations', element: <MyConsultationsPage /> },
          // Keyed by the VISIT, not the patient (task 4.1): a consultation is one
          // occasion, and the same patient has many. /consult/:patientId would have no
          // answer to "which visit am I writing this prescription against".
          { path: 'consult/:visitId', element: <ConsultPage /> },
          // Task 4.15 — who was told to come back. Beside the appointment book rather than
          // inside it, because they are lists of different people.
          { path: 'follow-ups', element: <FollowUpsPage /> },
          { path: 'icd', element: <IcdLookupPage /> },
          { path: 'interactions', element: <InteractionCheckerPage /> },
          { path: 'lab', element: <LabQueuePage /> },
          { path: 'invoices', element: <InvoicesPage /> },
          { path: 'collections', element: <CollectionsPage /> },
          { path: 'till', element: <TillPage /> },
          { path: 'pharmacy', element: <PharmacyPage /> },
          { path: 'users', element: <UsersPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'modules', element: <ModulesPage /> },
          { path: 'departments', element: <DepartmentPage /> },
          { path: 'practitioners', element: <PractitionersPage /> },
          { path: 'services', element: <ServicesPage /> },
          { path: 'lab-tests', element: <LabTestsPage /> },
          { path: 'lab-panels', element: <LabPanelsPage /> },
          { path: 'drugs', element: <DrugsPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
