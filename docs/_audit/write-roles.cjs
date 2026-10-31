const {d,table,row,heads,dependencies,ref,write,scope,doctorSteps}=require('./write-guides.cjs');
const navFile='apps/web/src/auth/nav.ts',perm='apps/api/src/auth/permissions.ts';
const labels=require('../../apps/web/src/i18n/locales/en.json').nav;
const recipes={
 admin:[['Onboard a doctor','Follow the numbered Doctor onboarding procedure in 02-initial-setup-runbook.md. Use HR → Employees → Create linked account, rather than Users.'],['Manage an account','Open Users; review the account and its roles. Use Deactivate for an unauthorized/departed account or Reset password to issue a temporary password to another user. You cannot deactivate or reset your own account through that administrative action.'],['Review configuration','Open Modules, Departments, Practitioners, Services and Settings. Check prerequisite references before changing active flags. Keep actual hospital configuration pending until authorized.'],['Review incidents','Open Reports and the permitted audit/error views. Investigate IDs and source records; do not correct financial/clinical history by deleting database rows.']],
 receptionist:[['Register and check in','Open Reception. Search for an existing patient first; otherwise enter the new patient fields. Choose an active department and available practitioner, select priced services and payment method, review the total and save. Review any duplicate/open-visit warning before overriding. Print the saved check-in receipt.'],['Collect outstanding charges','Open Collections. Select the unpaid bill; inspect its patient and origin. For lab charges select eligible lines, receive payment and print the receipt. For pharmacy billing collect the outstanding amount before pharmacy handover.'],['Book a return','Open Appointments, choose the existing patient and department/practitioner, enter the return date and save. Cancellation and no-show are separate actions.'],['Close the desk','Open Till, choose the facility date and compare physical cash with net signed payments. Record any reception till-close/handover in Reception operations when available; a displayed daily total is not a locked cash session.']],
 doctor:[['Receive a patient','Open My consultations or Queue and select the assigned visit. Move the visit into progress before completing care. Confirm identity and allergies.'],['Document consultation','Use the consultation tabs to save complaint, vitals, diagnoses, notes, prescription and lab requests as clinically appropriate. F2 saves dirty sections; a failed section must be resolved before printing or completing.'],['Review and print','Review verified lab results and history where permitted. F4 saves and opens browser printing. Confirm patient identity on the printed sheet.'],['Finish and follow up','Book the appropriate follow-up. F9 saves then completes the visit only from a permitted status. Esc with unsaved work opens a leave/discard prompt.']],
 nurse:[['Work the queue','Open Queue and choose the patient/visit you are caring for. Record permitted vitals, complaint and allergies; do not expect diagnosis or psychiatric-note writing authority.'],['Review roster and leave','Open HR when enabled; review the roster and submit your own leave request from the linked employee identity.'],['Coordinate beds','Use Reception operations for authorized bed-management tasks. Clinical care-request review is a separate doctor/admin permission. Do not treat coordination completion as a full clinical discharge.']],
 lab_tech:[['Prepare the worklist','Open Lab. Find the order and identify the patient and selected tests. Confirm that priced test lines have been paid.'],['Collect and process','Select still-ordered eligible items and collect samples. Enter the results using the configured test units/ranges. Resolve validation before saving.'],['Verify and release','Review resulted items then verify. Print released results using the lab report controls. An incorrect verified result requires amendment with preserved provenance.'],['Review catalog proposals','Use Lab tests under the applicable proposal/approval restrictions. Administrator approval is a distinct catalog responsibility.']],
 pharmacist:[['Review prescription','Open Pharmacy; select the patient prescription and review allergies and drug interaction warnings.'],['Create pharmacy bill','Enter/check the price for every prescription item and create the bill. Catalog sell prices are suggestions; verify the total.'],['Hand over medicine','Wait until Collections confirms the pharmacy invoice is fully paid. Confirm handover only after checking the patient and medicines.'],['Process a return','Use the permitted return workflow within its time/state checks; do not delete the original dispense/payment records. The current workflow does not maintain physical stock batches.']],
 management:[['Review operations','Open the dashboard and permitted Reports tabs. Review aggregate operational, financial and clinical information; do not assume access to patient psychiatric notes.'],['Review finance','Enablement and finance.read permit the Finance workspace. Inspect reports/exports available to this role; posting and configuration are separate permissions.'],['Review governance','Review audit/error records and department handovers where authorized. Departmental sign-off and accountant acceptance are human decisions, not a button implied by management role.']],
 call_center:[['Find a follow-up','Open Follow-ups. Review the due patient, safe contact context and planned date; record the response with the available confirmation/custom-note controls.'],['Work CRM','Open CRM when enabled. Use Contacts, Leads, Calls, Tasks and Appointments according to the tab controls. Verify the caller and authorized relationship before patient-linked scheduling.'],['Arrange an appointment','Use the CRM appointment flow for an authorized existing-patient link; handle provider/patient overlap errors by selecting another time.'],['Hand over pending work','Review unresolved calls/tasks and due follow-ups. Do not add clinical diagnoses or psychiatric notes to CRM free text.']],
 accountant:[['Prepare finance entries','Open Finance when enabled. Select the configured period and accounts. Prepare balanced journal or expense/supplier records with source evidence.'],['Post or settle','Use only the actions granted to your role. Independent posting/approval guards may reject your own prepared record even when finance.post is present.'],['Reconcile','Compare supplier/patient control balances and cash/bank statements with source documents. Investigate failed integration events before closing.'],['Handle payroll payments','Use the Finance payroll workflow after independent approval; reconcile salary liabilities and payment account movements.']],
 finance_manager:[['Configure approved books','Open Finance and use approved cutover, chart/account mappings, fiscal calendar and payroll/asset configuration. Do not invent opening balances.'],['Approve and post','Review prepared entries and payroll through independent-review controls. Resolve rejected self-approval attempts using a different authorized person.'],['Close a period','Review trial balance, subledger controls, bank/cash statements and pending events. Close/lock only when the service checks pass; use the controlled reopening workflow if correction is authorized.'],['Approve reports for review','Export the required report layout for the appointed accountant. Actual statutory approval remains external to the role grant.']],
 payroll_officer:[['Review HR inputs','Open HR for permitted employee/attendance views and marking; verify approved leave and roster evidence.'],['Prepare payroll','Open Finance → Payroll; use separately configured payroll employees and approved manual attendance adjustments. Do not assume automatic HR synchronization.'],['Submit for review','Calculate/review the run and hand it to an independent authorized approver. You cannot use this role alone to approve or pay the run.'],['Resolve differences','Compare payslip amounts and salary-control movements with approved inputs. Correct through the allowed run/reversal workflow, not database edits.']],
 auditor:[['Review finance','Open Finance when enabled. Read the ledger, statements and reports available under finance.read.'],['Export evidence','Use finance.export reports within the authorized facility/access grant. Secure exported files; exports are not permission to read clinical notes.'],['Report exceptions','Record unexplained balances, pending events and missing acceptance evidence for the finance manager and accountant. This role cannot post, pay, close or configure books.']],
};
const commonSources={admin:'apps/web/src/pages/UsersPage.tsx',receptionist:'apps/web/src/pages/ReceptionPage.tsx',doctor:'apps/web/src/components/ConsultActions.tsx',nurse:'apps/web/src/components/VitalsTab.tsx',lab_tech:'apps/web/src/pages/LabQueuePage.tsx',pharmacist:'apps/web/src/pages/PharmacyPage.tsx',management:'apps/web/src/pages/ReportsPage.tsx',call_center:'apps/web/src/pages/CrmPage.tsx',accountant:'apps/web/src/pages/FinancePage.tsx',finance_manager:'apps/web/src/pages/FinancePage.tsx',payroll_officer:'apps/web/src/components/FinancePayroll.tsx',auditor:'apps/web/src/pages/FinancePage.tsx'};
for(const role of d.roles){const code=role.code;const grants=Object.entries(d.permissions).filter(([,g])=>code in g);const grantSet=new Set(grants.map(([p])=>p));const nav=d.nav.filter(n=>n.roles.includes(code));const routeFiles=new Set();for(const n of nav){let r=d.routes.find(r=>r.path===(n.to==='/'?'/':n.to.slice(1)));const element=r?.declaration.match(/element:\s*<(\w+)/)?.[1];if(element){const imp=d.imports['apps/web/src/router.tsx'].find(i=>i.text.includes(element));if(imp)routeFiles.add('apps/web/src/'+imp.module.slice(2)+'.tsx');}}if(code==='doctor'||code==='nurse')routeFiles.add('apps/web/src/pages/ConsultPage.tsx');
 if(nav.some(n=>n.to==='/'))routeFiles.add('apps/web/src/pages/HomePage.tsx');
 const actions=d.actions.filter(a=>code==='admin'||a.screens.some(p=>routeFiles.has(p))||!a.file.includes('/pages/')&&a.screens.some(p=>p.startsWith('Shared shell'))||a.endpoints.some(e=>grantSet.has(e.permission)));
 const resources=[...new Set(Object.keys(d.permissions).map(p=>p.split('.')[0]))];
 function cell(resource,re){const found=grants.filter(([p])=>p.split('.')[0]===resource&&re.test(p.slice(p.indexOf('.')+1)));return found.map(([p,g])=>p+(g[code]?' ('+g[code]+')':'')).join('; ')||'No matching grant';}
 const rows=resources.map(r=>[r,cell(r,/read|view|search|list|check|operational|financial|aggregate|me|login/),cell(r,/create|write|record|upload|request|receive|dispense|respond|collect/),cell(r,/edit|manage|configure|mark|change|reassign|assign|reconcile|post/),cell(r,/delete|cancel|void|deactivate|refund|return|exit/),cell(r,/approve|verify|authorize|close/),cell(r,/print|export/),grants.filter(([p])=>p.startsWith(r+'.')).map(([p])=>d.permissionSources[p]).join('; ')||'Denied by absence: '+ref(perm)]);
 let text=`# ${role.name}

${scope}

## 1. Purpose — who this person is in the hospital

${role.description} This is a **system role**, not an HR Position. An Employee's job title grants no access by itself; an AppUser must hold this role through UserRole. ${ref(perm,"code: '"+code+"'")}; ${ref('apps/api/prisma/schema.prisma','model UserRole {')}.

## 2. Responsibilities — daily / per-shift / monthly

The procedures below describe the coded work this role supports. Daily: check assigned work and correct patient/source identity before saving. Per shift: hand over unresolved work and sign out of shared devices. Monthly: review unresolved exceptions with the designated supervisor. These frequencies are **recommended SOP assignments, ⚠️ not application-enforced duties**. The hospital must approve ownership and cadence. Capability source: ${ref(commonSources[code])}.

## 3. Prerequisites — before this person can work

An active User, facility, password change completion and the listed permission grants are required. Optional module screens also require enablement. Clinical accounts created through Users are refused; use Employee-linked onboarding for Doctor, Nurse, Lab technician and Pharmacist. HR self service requires an Employee link even for nonclinical accounts. Doctor accounts additionally require a clinical Position and linked Practitioner/department membership. Required workflow-specific catalogs and balances are in [the dependency matrix](../03-dependency-matrix.md). ${ref('apps/api/src/common/guards/jwt-auth.guard.ts')}; ${ref('apps/api/src/modules/users/users.service.ts','const clinicalRoles')}; ${ref('apps/api/src/modules/staff/staff.service.ts','async createAccount')}.

## 4. Permissions

Each cell lists exact permission codes, rather than implying every action in a module is allowed. Verb grouping is for reading only; some permissions appear in more than one column. Conditional rules and all denied permissions are in [the master matrix](../07-permission-matrix.md). Database grant drift is ⚠️ UNVERIFIED on the VPS.

${table(['Module','View','Create','Edit','Delete/Cancel','Approve','Print/Export','Source (file:line)'],rows)}

## 5. What they CANNOT do (and who does it instead)

Anything absent from this role's grants is denied, including on a screen reached by manually entering its URL. Multiple roles may expand authority; this document assumes this role alone. Admin manages configuration and users; receptionist registers patients and takes lab collections; doctor writes diagnoses/notes/prescriptions; lab_tech enters/verifies lab results; pharmacist confirms medicine handover; finance roles follow independent approval and posting checks. **Admin alone is not a clinical author.** Exact exceptions and conditions: ${ref(perm)}; ${ref('apps/api/src/common/guards/permissions.guard.ts')}.

## 6. Screens they use — navigation path

English menu labels below come from the locale file. The Main group has no translated heading in the current English dictionary. Listed visibility does not prove every button is authorized. ${ref('apps/web/src/i18n/locales/en.json')}.

${table(['Menu group › item','URL','Module prerequisite','Source'],nav.map(n=>[(labels.groups[n.group]||'Main')+' › '+(labels[n.key]||n.key),n.to,n.module||'Core',ref(navFile)]))}

${code==='call_center'?'⚠️ The shared ALL_ROLES menu array omits call_center even though HR self/leave permissions include it. CRM and Follow-ups have explicit call_center entries. See the gap report. '+ref(navFile,'const ALL_ROLES'):''}

## 7. Button & action reference

These are source locations on menu-linked or permission-linked screens, including reusable controls. **Rows are an inventory, not a grant.** Read the endpoint permission against Section 4; branch-dependent visibility not proven for this role is ⚠️ UNVERIFIED. Administrator includes the complete UI inventory to guarantee no source location is silently omitted, including clinical controls the administrator cannot use. Side effects are direct static service effects; nested helpers may add effects. Runtime behavior and physical printing are not verified by this table.

${table(heads,actions.map(a=>{const r=row(a);const missing=a.endpoints.filter(e=>e.permission&&!grantSet.has(e.permission)).map(e=>e.permission);if(missing.length)r[9]+='; ⚠️ This role lacks: '+[...new Set(missing)].join(', ');return r;}))}

## 8. Step-by-step procedures

${recipes[code].map(([title,steps],i)=>`${i+1}. **${title}.** ${steps} Sources: ${ref(commonSources[code])}; [action reference](../_audit/ui-actions.md); [workflow service traces](../_audit/endpoint-effects.md).`).join('\n\n')}

For account onboarding use [Day 0](../02-initial-setup-runbook.md); for status-sensitive money, lab and dispensing operations use [Workflows](../04-workflows.md). These steps describe code paths and have not been executed as hospital UAT in this task.

## 9. Status flows they touch

Only execute transitions allowed by the endpoint and current role. These diagrams show a supported path; they do not imply this role can perform every transition.

\`\`\`mermaid
stateDiagram-v2
  [*] --> arrived: reception check-in
  arrived --> in_progress: authorized clinician starts
  in_progress --> on_hold: authorized hold
  on_hold --> in_progress: resume
  in_progress --> completed: finish care
\`\`\`

Visit contract: ${ref('packages/shared/src/visit.ts','export const VISIT_STATUSES')}. Cancel/entered_in_error are separate controlled actions, not an undo button. Other role-specific states are in [04-workflows.md](../04-workflows.md) and the [enum inventory](../_inventory.md#enums-and-declared-states).

## 10. Common errors & what to do

| Exact message | Cause | What to do |
| --- | --- | --- |
| Change your temporary password before using the system. | Password-change flag is set | Open Change password; set a different permanent password. ${ref('apps/api/src/common/guards/jwt-auth.guard.ts',"code: 'password_change_required'")} |
| Missing permission: <permission> | This account does not hold the endpoint grant | Ask the administrator to check intended roles; do not share another user's login. ${ref('apps/api/src/common/guards/permissions.guard.ts','Missing permission:')} |
| Module not enabled: <module> | Optional module is off | Ask the administrator to review Modules. ${ref('apps/api/src/common/guards/module.guard.ts','Module not enabled:')} |
| Your account is not linked to an employee record. | HR self-service account has no Employee link | Ask the administrator to inspect employee/account onboarding. ${ref('apps/api/src/modules/staff/staff.service.ts',"code: 'employee_profile_missing'")} |

All exact business-rule messages, including amount/state/date/reference errors, are in [validation messages](../_audit/validation-messages.md). A generic UI error can hide a more specific API response; report the screen, action and timestamp without passwords or patient notes.

## 11. Handover / end-of-shift duties

Recommended SOP: finish or explicitly hand over pending records; reconcile any physical cash handled against Till and source receipts; identify uncollected samples/unverified results/undispensed paid prescriptions appropriate to the role; lock or sign out of shared devices. A saved shift handover does not itself reconcile GL balances. These duties need hospital approval. Relevant implemented screens: ${ref('apps/web/src/pages/ReceptionOperationsPage.tsx')}; ${ref('apps/web/src/pages/TillPage.tsx')}; ${ref('apps/web/src/layouts/RootLayout.tsx')}.

## 12. Reports they can see

${table(['Permission','Qualification','Source'],grants.filter(([p])=>/^(report\.|finance\.(read|export)|hr\.report\.view|audit_log\.read|error_log\.read|payroll\.read)/.test(p)).map(([p,g])=>[p,g[code]||'Unconditional matrix grant; service may further scope content',d.permissionSources[p]]))}

If this table is empty, no report permission in those families is granted to this role. Screen visibility and exact filter/export affordances are in Section 7. Do not treat aggregate reporting authority as permission to read psychiatric notes.
`;
 write('docs/roles/'+code.replaceAll('_','-')+'.md',text);
}
console.log('Wrote '+d.roles.length+' role guides.');
