/* Writes documentation only. Source citations are resolved, not guessed. */
const fs=require('node:fs'),path=require('node:path');
const {d,table,row,heads,dependencies}=require('./actions.cjs');
const read=p=>fs.readFileSync(p,'utf8');
const ref=(p,needle='')=>{const s=read(p),i=needle?s.indexOf(needle):0;if(i<0)throw Error('Missing citation: '+p+' '+needle);return '`'+p+':'+s.slice(0,i).split('\n').length+'`';};
const write=(p,s)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s.trim()+'\n');};
const svc=n=>'apps/api/src/modules/'+n;
const staff=svc('staff/staff.service.ts'),hr='apps/web/src/pages/HrPage.tsx',users=svc('users/users.service.ts'),pract=svc('practitioner/practitioner.service.ts'),visit=svc('visit/visit.service.ts'),rec=svc('reception/reception.service.ts'),ops=svc('reception/reception-operations.service.ts'),perm='apps/api/src/auth/permissions.ts';
const scope='Snapshot: **2026-10-31**, repository source audit. No application code or live database was changed. “Source-confirmed” describes inspected code, not a passed browser, deployment or hospital test. ⚠️ UNVERIFIED = unresolved or untested; 🚧 NOT IMPLEMENTED = absent from the inspected ownership/routes; 🐞 SUSPECTED BUG = evidence needs a focused reproduction. Testing VPS and legacy LAN deployments are distinct. Actual VPS state and actual hospital configuration are not inferred from this checkout.';
const depRows=[
 ['Log in and use the application','Facility, active AppUser and correct password; grants for protected app routes','apps/api/src/auth/auth.service.ts','async login','Invalid username or password / Invalid or expired token','Operator bootstrap; admin manages later accounts'],
 ['Open optional module','Enabled FacilityModule and route permission',svc('facility-module/facility-module.service.ts'),'async isEnabled','Module not enabled: <key>','admin (Modules)'],
 ['Create employee','Active same-facility Department and Position',staff,'private async validateReferences','Department is not active in this facility. / Position is not active in this facility.','admin'],
 ['Assign reporting manager','Existing non-exited, non-voided same-facility Employee',staff,'if (!manager)','Reporting manager is not an active employee in this facility.','admin'],
 ['Create clinical login through Users','Use Employee account flow instead',users,'const clinicalRoles','Create clinical user accounts from the employee record so identity and employment stay linked.','admin via HR'],
 ['Create Employee-linked doctor','Employee with clinical Position; no linked user; active/on_leave; doctor Role',staff,'async createAccount','A doctor account can only be assigned to an employee in a clinical position.','admin'],
 ['Create any employee login','Unique username; valid roles; no existing account; not exited/suspended',staff,'async createAccount','Employee already has a user account. / An exited or suspended employee cannot receive a login.','admin'],
 ['Link pre-existing practitioner','Unlinked practitioner code matching employeeNo',staff,'const existingPractitioner','This employee number already belongs to a linked practitioner.','admin; inspect duplicate identities first'],
 ['Create practitioner directly','Unique code; optional valid user/speciality; same-facility departments',pract,'async create','Unknown speciality / Unknown user / One or more departments do not exist in this facility','admin; legacy path does not enforce HR first'],
 ['Create practitioner login directly','Active practitioner without login; unique username; seeded doctor role',pract,'async createAccount','Reactivate this practitioner before creating a login account.','admin; legacy bypass reported in gap report'],
 ['Activate employee login','Employee not exited/suspended; linked user',staff,'async setAccountActive','An exited or suspended employee cannot have an active login.','admin'],
 ['Use HR self service','User linked to Employee; HR enabled',staff,'async me','Your account is not linked to an employee record.','admin creates linked employment identity'],
 ['Create visit','Patient + active department; selected practitioner active and member',visit,'async create','Patient not found / Department is not active / Practitioner does not work in that department','receptionist; admin configures masters'],
 ['Create second open visit','Acknowledge existing open visit in same department',visit,'if (!input.acknowledgeOpenVisit)','This patient already has an open visit in that department','receptionist after duplicate review'],
 ['Reception check-in','Priced active Service items and valid patient/visit inputs',rec,'async checkIn','Exact service and pricing errors are in validation inventory','admin manages services; receptionist checks in'],
 ['Apply discount','Discount authority, reason, bill amount and configured ceiling',rec,'if (discount.greaterThan(ZERO))','A discount needs a reason. / The discount is more than the bill.','admin for above-threshold authority'],
 ['Write clinical sections','Open Visit and section-specific permission',svc('clinical-note/clinical-note.service.ts'),'class ClinicalNoteService','Exact closed-visit errors in validation inventory','doctor; nurse only permitted sections'],
 ['Order lab tests','Visit and active tests; lab enabled',svc('lab-order/lab-order.service.ts'),'class LabOrderService','Exact test/visit/catalog checks in validation inventory','doctor; admin manages catalog'],
 ['Collect sample / enter result','Valid lab order items and settlement/state checks',svc('lab-order/lab-sample.service.ts'),'class LabSampleService','Exact unpaid/sample/state errors in validation inventory','lab_tech; nurse grant R9 unresolved'],
 ['Verify / amend result','Result record, valid state, amendment reason/original linkage',svc('lab-order/lab-result.service.ts'),'class LabResultService','Exact result validation in validation inventory','lab_tech'],
 ['Prescribe','Open visit, valid drug references and prescription fields',svc('prescription/prescription.service.ts'),'class PrescriptionService','Exact errors in validation inventory','doctor; admin manages approved formulary'],
 ['Dispense','Valid prescription/items, pharmacy payment/state checks',svc('pharmacy/dispense.service.ts'),'class DispenseService','Exact quantity/paid/state errors in validation inventory','pharmacist'],
 ['Take payment / refund','Existing scoped invoice; amount, state and refund-window checks',svc('invoice/payment.service.ts'),'class PaymentService','Exact balance/refund/ownership errors in validation inventory','receptionist / pharmacist under R5,R12; admin refund oversight'],
 ['Reserve or occupy bed','Approved care request and available active bed',ops,'reviewCareRequest(','Reserve or occupy a bed through an approved care request. / The requested bed is no longer available.','admin/nurse manages beds; doctor/admin reviews requests'],
 ['Review care request','Different authorized reviewer for approval/rejection; allowed transition',ops,'A different authorised user','A different authorised user must review this request.','doctor or admin; not its requester'],
 ['Book appointment','Patient, department, selected practitioner and valid date/time; overlap protection',svc('appointment/appointment.service.ts'),'async createIn','Exact overlap and provider errors in validation inventory','receptionist/doctor; CRM booking uses CRM authorization'],
 ['CRM patient appointment','Authorized existing-patient link and permitted CRM contact workflow',svc('crm/crm-appointments.service.ts'),'class CrmAppointmentsService','Exact contact/link/booking checks in validation inventory','call_center/admin; contact authorization by admin'],
 ['Assign roster','Employee, active ShiftType, dates; coverage/night/leave checks',svc('staff/staff-operations.service.ts'),'class StaffOperationsService','Exact roster eligibility errors in validation inventory','admin'],
 ['Request leave','Employee + LeaveType + date/window/balance rules',svc('staff/staff-operations.service.ts'),'class StaffOperationsService','Exact leave conflicts/backdating errors in validation inventory','linked employee for self; admin approval'],
 ['Post finance journal / expense','Finance setup, chart, open fiscal period, valid accounts and balanced entries',svc('finance/finance-ledger.service.ts'),'class FinanceLedgerService','Exact account/date/balance/independent-posting errors in validation inventory','accountant/finance_manager/admin per endpoint'],
 ['Import opening GL','Configured cutover; balanced CSV, valid accounts and unique source',svc('finance/finance-opening.ts'),'','Exact opening CSV messages and preview result; invoice allocation is not supplied','accountant/finance_manager/admin; accountant acceptance required'],
 ['Pay supplier bills','Supplier, posted bill/open balance, payment account and open period',svc('finance/finance-payables.service.ts'),'class FinancePayablesService','Exact AP amount/source errors in validation inventory','accountant/finance_manager/admin'],
 ['Payroll accrual/payment','Finance payroll configuration + separate payroll employees, run and independent approvals',svc('finance/finance-payroll.service.ts'),'class FinancePayrollService','Exact payroll state/self-approval/account errors in validation inventory','payroll_officer prepares; finance_manager/admin approves; accountant pays'],
 ['Depreciate / dispose asset','Asset configuration/register, source value, valid dates and open period',svc('finance/finance-assets.service.ts'),'class FinanceAssetsService','Exact asset/source/date errors in validation inventory','finance endpoint holders; inspect controller'],
 ['Close financial period','Balanced controls, processed events and required reconciliation; valid period state',svc('finance/finance-close.service.ts'),'class FinanceCloseService','Exact outstanding-control/close errors in validation inventory','finance_manager/admin'],
];
let dm='# Master dependency matrix\n\n'+scope+'\n\nThe first table is the operator-facing dependency map. It distinguishes required references from optional references that are validated only when supplied. The appendices include every detected service/controller exception and every model relation, so unclassified rules remain visible rather than silently omitted.\n\n';
dm+=table(['To create…','You must first have…','Enforced where (file)','Error shown','Who can create the prerequisite'],depRows.map(([a,b,p,n,e,w])=>[a,b,ref(p,n),e,w]));
dm+='\n## Important exceptions to the example setup order\n\nA separate configurable doctor schedule/fee master is not established by the current schema: Appointments support timed booking and overlap checks; consultation fees are Service fees. A Queue row is a Visit, not evidence of a separate queue-counter master. Till reporting groups Payment records by receiving user/date; the check-in method does not require opening a cash-session record first. Do not invent these prerequisites. Sources: '+ref(visit,'async create')+', '+ref(rec,'async checkIn')+', '+ref(svc('till/till.service.ts'),'async report')+', '+ref(svc('service/service.service.ts'),'class ServiceCatalogService')+'.\n\n## Exhaustive source appendices\n\n- [All 764 exception sites, exact message expressions and service owners](_audit/validation-messages.md). Some are guards rather than create dependencies; classification beyond the table above is ⚠️ UNVERIFIED.\n- [All 119 model field/relation declarations](_inventory.md#prisma-models-and-required-fields--relations). Required FKs do not prove a user-facing setup screen exists.\n- [All HTTP permissions and direct service effects](_audit/endpoint-effects.md).\n\n## HR-first rule: purpose and limits\n\nEmployee records own employment, department, position, salary metadata, documents and credentials. User records own login and permissions. Practitioner records own clinical routing and optional license number. Position.isClinical validates the Doctor selection; the title “Doctor” alone grants no system rights. The account transaction links Employee.userId, AppUser, UserRole and PractitionerDepartment; it reuses the employee number as practitioner code. '+ref(staff,'async createAccount')+'; '+ref('packages/shared/src/hr.ts','const employeeFields')+'.\n\nPayroll ownership is separate: a FinancePayrollEmployee is not proof of an automatic HR-to-payroll link. License data can be copied from a professional-license credential, but this account method does not require a valid unexpired license. “One person, one identity” is an operational goal with unique links, not a proven cross-system person-deduplication guarantee. '+ref(staff,'const professionalLicense')+'; '+ref(svc('finance/finance-payroll.service.ts'),'class FinancePayrollService')+'.\n';
write('docs/03-dependency-matrix.md',dm);
const doctorSteps=`
## Doctor onboarding: exact supported path

1. Sign in as an Administrator. Complete the mandatory password change. An empty database needs the operator bootstrap first; there is no anonymous facility-creation screen. ${ref('output/redmars-testing-vps-kit/bootstrap-testing.cjs','async function main')}; ${ref('apps/web/src/auth/ProtectedRoute.tsx')}.
2. Open **Modules** and enable **HR**. A missing flag is off. ${ref('apps/web/src/pages/ModulesPage.tsx','export function ModulesPage')}; ${ref(svc('facility-module/facility-module.service.ts'),'async list')}.
3. Open **Departments**. Create an active clinical department with a code, name and suitable department type. ${ref('apps/web/src/pages/DepartmentsPage.tsx')}; ${ref(svc('department/department.service.ts'),'async create')}.
4. Open **HR → Settings → Positions**. Enter **English title**, optional Dari/Pashto titles and category. Tick **Clinical position**, then **Add position**. ${ref(hr,'<h2 className="text-lg font-semibold">Positions</h2>')}; ${ref('packages/shared/src/hr.ts','export const createHrPositionSchema')}.
5. Open **HR → Employees**. Enter **First name**, optional **Father name** and **Last name**, **Sex**, optional **Phone**, **Department**, **Position**, **Employment type**, **Joined date (Shamsi)** and salary if authorized. Select the active clinical position, then **Create employee**. The server issues the employee number. ${ref(hr,'function Employees()')}; ${ref(staff,'async create(auth')}.
6. Select the employee row to open its details. If supplied by the hospital, add a **professional_license** credential with its reference and dates using **Save credential**. This is not a demonstrated legal licensing gate. ${ref(hr,'function EmployeeDetail')}; ${ref(staff,'async addCredential')}.
7. In that employee's account form, enter the username, temporary password, optional email, and choose **Doctor**. Click **Create linked account**. It creates the login, Doctor grant and linked practitioner profile together. The employee must not already have an account or be exited/suspended. ${ref(hr,'<option value="doctor">Doctor</option>')}; ${ref(staff,'async createAccount')}.
8. Open **Practitioners** and confirm the doctor is active and assigned to the intended department. Use the row expansion and **Save departments** if additional memberships are required; verify the current translated label in the UI. The employee's home department is added by onboarding. ${ref('apps/web/src/pages/PractitionersPage.tsx','function DepartmentEditor')}; ${ref(pract,'async setDepartments')}.
9. Open **Services** and create the consultation service with its department and fee. Fees belong to Services, not to a demonstrated per-doctor fee/schedule master. ${ref('apps/web/src/pages/ServicesPage.tsx')}; ${ref(svc('service/service.service.ts'),'class ServiceCatalogService')}.
10. Create an Employee-linked Receptionist account or a nonclinical Receptionist account under **Users**. Administrator alone does not hold patient.create or visit.create. ${ref(users,'async create')}; ${ref(perm,"'visit.create'")}.
11. Sign in as that Receptionist. Open **Reception**, choose/register a synthetic patient, choose the department and this doctor, add the consultation service, select payment method and save check-in. This writes Patient when new, Visit/status history, Invoice/items and a positive Payment when payable. ${ref(rec,'async checkIn')}.
12. Sign in as the doctor, change the temporary password, open **My consultations** or **Queue**, and open the assigned visit. Start the clinical visit before completing it. Use **F2** to save; **F4** saves and prints; **F9** saves and completes only when the status transition permits it. ${ref('apps/web/src/pages/MyConsultationsPage.tsx')}; ${ref('apps/web/src/components/ConsultActions.tsx','const saveAndFinish')}.

This sequence was walked through against schemas, form handlers and service validations. **It was not executed against an empty database during this documentation task.** Actual hospital setup remains postponed until authorized. Do not use development seed patients or accounting figures as hospital configuration.


\`\`\`mermaid
flowchart TD
  Facility[Facility and bootstrap Administrator] --> HR[Enable HR]
  Facility --> Dept[Active Department]
  HR --> Position[Active Position: isClinical true]
  Dept --> Employee[Employee: active employment]
  Position --> Employee
  Employee --> Account[Create linked account: select Doctor]
  Account --> User[AppUser and Doctor UserRole]
  Account --> Profile[Practitioner: code equals employee number]
  Dept --> Membership[PractitionerDepartment]
  Profile --> Membership
  Dept --> Service[Service and consultation fee]
  Membership --> Checkin[Receptionist check-in]
  Service --> Checkin
  Checkin --> Visit[Visit assigned to practitioner]
  User --> Queue[Doctor My consultations and Queue]
  Visit --> Queue
\`\`\`

The Users API error explains the HR link but gives no click path. Proposed wording: **“To create a Doctor, open HR → Employees, select or create the employee, choose a Clinical position, then choose Doctor under Create linked account. Ask an Administrator if HR is unavailable.”** The proposal is not implemented. ${ref(users,"code: 'employee_account_required'")}.
`;
write('docs/02-initial-setup-runbook.md',`# Day 0: empty database to first patient

${scope}

## Stop conditions

Use synthetic data on the testing VPS. Real Axon configuration is still postponed. A clean production schema must not be populated with the development seed. The testing bootstrap refuses a database containing any facility or user; do not weaken this guard or rerun it to reset a password. Its checked-in defaults use a synthetic facility and account; operator-customized names are not evidence of a changed repository. ${ref('apps/api/prisma/seed.ts')}; ${ref('output/redmars-testing-vps-kit/bootstrap-testing.cjs')}.

## Strict setup checklist

| Order | Role / screen | Required setup | What breaks if skipped / source |
| --- | --- | --- | --- |
| 1 | VPS operator / terminal | Separate empty testing database; migrations; one facility; initial admin and role grants using the kit | No valid tenant/login. ${ref('output/redmars-testing-vps-kit/README.md')} |
| 2 | Admin / Change password | Replace temporary password; 12+ character permanent password | Protected routes return password_change_required. ${ref('packages/shared/src/auth.ts','export const changePasswordRequestSchema')} |
| 3 | Admin / Modules | Enable HR for staff; Lab, CRM and Finance only for the workflows under test | Gated API returns Module not enabled. An enabled IPD flag does not establish an installed clinical IPD workflow. ${ref(svc('facility-module/facility-module.service.ts'),'async setEnabled')} |
| 4 | Admin / Departments | Active department code, name and type; rooms when required by local operation | Employee/visit references fail. ${ref(svc('department/department.service.ts'),'async create')} |
| 5 | Admin / HR → Settings | Positions; clinical flag for doctors; leave types, shift types and approved coverage policies for pilot | Staff/roster/leave forms cannot use missing references. ${ref(hr,'function HrSettings()')} |
| 6 | Admin / HR → Employees | Required employment fields, then Employee-linked clinical accounts | Users screen rejects clinical role creation. ${ref(staff,'async createAccount')} |
| 7 | Admin / Practitioners | Verify active profile and department memberships after doctor account creation; speciality if needed | Doctor cannot be selected for another department. ${ref(visit,'Practitioner does not work in that department')} |
| 8 | Admin / Services | Active billable services and their fees/departments | Reception requires valid priced items. ${ref(rec,'const services = await this.loadServices')} |
| 9 | Admin / Lab tests / Lab panels | Approved test catalog; reference ranges; panel components if using panels | Orders/results depend on valid catalog references. ${ref(svc('lab-test/lab-test.service.ts'))}; ${ref(svc('reference-range/reference-range.service.ts'))} |
| 10 | Admin / Drugs | Approved formulary and price fields used by current dispensing workflow | Prescription/dispense references fail. Physical stock receiving/batches are not established here. ${ref(svc('drug/drug.service.ts'))}; ${ref(svc('pharmacy/dispense.service.ts'))} |
| 11 | Admin / Settings; Reception | Discount ceiling; use built-in payment methods. Do not assume configurable insurance/price lists | Separate panel master/payment-method editor not established by route inventory. ${ref('apps/web/src/pages/SettingsPage.tsx')}; ${ref(rec,'paymentMethod')} |
| 12 | Finance manager / Finance | Approved test cutover, setup/chart, fiscal year/period, account mappings, cash/bank accounts, supplier/payroll/asset configuration as needed | Posting and subledgers require configuration. Do not invent real opening balances. ${ref(svc('finance/finance-ledger.service.ts'),'setup(actor')} |
| 13 | Admin + staff / print dialogs | Review stored facility letterhead and test invoice, prescription, lab and ID-card layouts | Printing requires browser/printer acceptance. Numbering is server-issued, not a proven editable template screen. ${ref('apps/web/src/lib/print.ts')}; ${ref('apps/api/src/services/number-sequence.service.ts')} |
| 14 | Receptionist + Doctor + Lab + Pharmacy + Finance | Walk one synthetic patient through the supported OPD path and reconcile records | Source inspection does not establish UAT. See 04-workflows.md. |

${doctorSteps}

## Day-0 gaps that cannot be solved by extra clicks

- No proven general-purpose production facility-onboarding UI/API; the kit is explicitly testing-only. Production provisioning needs an approved process.
- No installed full IPD clinical admission-to-discharge module. Bed coordination is a separate reception feature.
- No proven pharmacy stock receiving/batch/expiry master or configurable queue-counter setup in the route inventory. Do not represent drug catalog entries as on-hand stock.
- Opening patient/panel invoices need a controlled migration workflow; a balanced general opening journal does not allocate receivables.

Evidence: ${ref('packages/shared/src/facilityModule.ts')}; ${ref('apps/api/prisma/schema.prisma','/// Reception-side coordination only.')}; ${ref('docs/production-readiness-phase-6.md')}.
`);
write('docs/01-system-overview.md',`# REDMARS system overview

${scope}

## What exists today

**Identity and administration.** Users, system roles, department/room/practitioner masters, services, module flags and settings support one hospital per database. Public login differs from tenant-scoped work. Employee positions are not security roles. ${ref(users)}; ${ref(perm)}; ${ref('apps/api/src/common/guards/jwt-auth.guard.ts')}.

**Reception and OPD.** Reception combines registration, visit creation, billing and settlement in one transaction. Queue and consultations follow the Visit, with demographics, allergies, vitals, complaints, diagnoses, psychiatric notes, prescriptions, lab orders and follow-up. Administrative authority does not include writing psychiatric notes. ${ref(rec,'async checkIn')}; ${ref(visit)}; ${ref(perm,"'clinical_note.read'")}.

**Reception operations and inpatient coordination.** Requests, bed availability/reservation, transfer/discharge coordination, waitlist, patient contacts/documents/coverage, deposits, reminders, handovers and till-close review exist. These do not constitute a full IPD clinical chart, inpatient nursing/MAR or daily inpatient charging system. ${ref(ops)}; ${ref('apps/api/prisma/schema.prisma','/// Reception-side coordination only.')}.

**Laboratory.** Catalog tests, panels/ranges, orders, item-level billing, sample collection, result entry/verification/amendment and browser printing have owners and endpoints. Nurse sample collection has an unresolved policy condition. ${ref(svc('lab-order/lab-order.controller.ts'))}; ${ref(svc('lab-billing/lab-billing.service.ts'))}; ${ref(perm,"'lab.collect_sample'")}.

**Pharmacy.** Catalog, interactions, prescription queue, dispensing, returns and pharmacy-origin billing exist. Drug catalog and dispense quantity do not by themselves prove inventory receipts/batches/stock valuation. ${ref(svc('pharmacy/dispense.service.ts'))}; ${ref(svc('pharmacy/pharmacy.controller.ts'))}; ${ref(svc('drug-interaction/drug-interaction.service.ts'))}.

**Finance and accounting.** AFN ledger/chart, fiscal periods, opening GL import, cash/bank, suppliers/AP, operational patient/panel AR, payroll accounting, assets, statements, closing and reports exist. Hospital acceptance and legacy opening-invoice allocation remain pending. ${ref(svc('finance/finance.controller.ts'))}; ${ref('docs/production-readiness-phase-6.md')}.

**Human resources.** Positions, employment identity, documents/credentials, linked accounts, attendance, leave, rosters, coverage checks and HR configuration exist. Finance payroll is a separate owner; automatic HR attendance-to-payroll linkage must not be assumed. ${ref(staff)}; ${ref(svc('staff/staff-operations.service.ts'))}; ${ref('docs/production-readiness-phase-6.md')}.

**CRM.** Contacts and authorized patient links, consent/verification, leads, interactions/calls, tasks and timed appointment integration are present. Broader marketing, external messaging or campaign scope is not established by these controllers. ${ref(svc('crm/crm.controller.ts'))}; ${ref(svc('crm/crm-appointments.controller.ts'))}; ${ref('docs/crm-roadmap-assessment.md')}.

**Reporting and operations.** Role-scoped hospital reports, audit/error views, finance exports, browser printing, health endpoint and deployment/backup scripts exist. Physical devices, VPS reboot recovery and restore acceptance require runtime evidence. ${ref(svc('reports/reports.controller.ts'))}; ${ref('apps/api/src/health/health.controller.ts')}; ${ref('output/redmars-testing-vps-kit/backup-testing.sh')}.

## Architecture

\`\`\`mermaid
flowchart LR
  Staff[Staff browser: React and Vite build] --> TLS[Caddy HTTPS]
  TLS --> Web[Static web service]
  TLS --> API[NestJS API: JWT, permissions, module guards]
  API --> DB[(PostgreSQL 16: hospital database)]
  API --> Outbox[IntegrationEvent and receipt consumers]
  Outbox --> DB
  Staff --> Print[Browser print dialog and local printer]
  DB --> Dump[Nightly pg_dump: host systemd testing kit]
  Dump --> Local[Local backup files and checksums]
  Local -. optional Restic .-> Remote[Encrypted offsite repository]
\`\`\`

Testing deployment: ${ref('output/redmars-testing-vps-kit/compose.testing.yml')}; backup: ${ref('output/redmars-testing-vps-kit/backup-testing.sh')}; events: ${ref('apps/api/src/prisma/transactional-audit.ts')}; print: ${ref('apps/web/src/lib/print.ts')}. Legacy on-premise configurations are described separately in 05-production-operations.md. Cloud testing requires hospital internet connectivity; there is no verified offline browser synchronization path.

## Visit-centered model

\`\`\`mermaid
erDiagram
  Facility ||--o{ Patient : registers
  Patient ||--o{ Visit : attends
  Department ||--o{ Visit : receives
  Practitioner o|--o{ Visit : treats
  Visit ||--o{ Vitals : records
  Visit ||--o{ Diagnosis : records
  Visit ||--o{ ClinicalNote : records
  Visit ||--o{ Prescription : prescribes
  Visit ||--o{ LabOrder : requests
  Visit o|--o{ Invoice : bills
  Invoice ||--o{ Payment : settles
  AppUser o|--o| Employee : linked_identity
  AppUser o|--o| Practitioner : linked_clinician
  Position ||--o{ Employee : employed_as
  AppUser ||--o{ UserRole : holds
  Role ||--o{ UserRole : grants
\`\`\`

This is a simplified diagram, not the complete relational contract. Actual optionality and composite tenant keys: ${ref('apps/api/prisma/schema.prisma')}; full model inventory: [_inventory.md](_inventory.md).

## Glossary

${table(['Term','Meaning in this system','Source'],[
 ['Facility','Hospital tenant; deployment architecture uses one hospital database',ref('apps/api/src/common/guards/jwt-auth.guard.ts','if (user.facilityId')],
 ['Patient / MRN','Person receiving care; MRN is a generated lifelong identifier',ref('apps/api/prisma/schema.prisma','model Patient {')],
 ['Visit / encounter','One occasion of care; consultation URL is keyed by visitId',ref('apps/web/src/router.tsx',"path: 'consult/:visitId'")],
 ['Queue / token','Working list of open visits; do not assume a separate token-number entity',ref(visit,'async create')],
 ['User','Login identity, active status, password state and grants',ref('apps/api/prisma/schema.prisma','model AppUser {')],
 ['Employee / Staff profile','HR employment identity and related position/department/credentials',ref('apps/api/prisma/schema.prisma','model Employee {')],
 ['Position / job','HR title and clinical flag; does not grant login permission',ref('packages/shared/src/hr.ts','export const createHrPositionSchema')],
 ['System role','Named set of permissions on a User via UserRole',ref(perm,'export const ROLES')],
 ['Practitioner / doctor profile','Clinical routing identity optionally linked one-to-one to User',ref(pract,'async create')],
 ['Panel','Finance payer/receivable concept; Lab panel means a group of catalog tests, a different entity',ref(svc('finance/finance-revenue.service.ts'))+'; '+ref(svc('lab-panel/lab-panel.service.ts'))],
 ['Invoice / Payment','Charge document and signed append-only settlement/refund records',ref(svc('invoice/payment.service.ts'))],
 ['Till','Payments grouped by receiving user and facility day; distinct from Finance cash statements',ref(svc('till/till.service.ts'),'async report')],
 ['Journal / posted / reversal','Balanced accounting entry; posting recognizes it; correction uses controlled reversal',ref(svc('finance/finance-ledger.service.ts'))],
 ['Care request','Reception coordination record; not a full clinical admission',ref('apps/api/prisma/schema.prisma','/// Reception-side coordination only.')],
 ['Jalali / Shamsi','Calendar entry/display; storage and endpoint contracts still use normalized dates',ref('packages/shared/src/shamsi.ts')],
 ['Permission condition','Service-enforced restriction attached to an otherwise granted permission',ref('apps/api/src/common/guards/permissions.guard.ts')],
 ])}
`);
module.exports={d,table,row,heads,dependencies,ref,write,scope,doctorSteps};
