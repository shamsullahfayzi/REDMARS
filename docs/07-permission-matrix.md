# Master permission matrix

Executable source: `apps/api/src/auth/permissions.ts`. Database grants are seeded copies; inspect deployment drift separately. ✅ = unconditional matrix grant, ❌ = no grant, qualified cells name the rule and are not blanket authority. System roles accumulate; menu visibility is not authorization. Permissions not implemented as endpoints remain policy declarations.

| Permission | auditor | payroll_officer | accountant | finance_manager | admin | receptionist | nurse | doctor | lab_tech | pharmacist | management | call_center | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| reception.read | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:121 |
| reception.coordinate | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:122 |
| reception.manage_beds | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:123 |
| reception.clinical_review | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:124 |
| reception.supervise | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | apps/api/src/auth/permissions.ts:125 |
| hr.employee.view | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | apps/api/src/auth/permissions.ts:126 |
| hr.employee.create | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:127 |
| hr.employee.edit | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:128 |
| hr.employee.exit | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:129 |
| hr.salary.view | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | apps/api/src/auth/permissions.ts:130 |
| hr.salary.edit | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:131 |
| hr.document.manage | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:132 |
| hr.credential.manage | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:133 |
| hr.attendance.view | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | apps/api/src/auth/permissions.ts:134 |
| hr.attendance.mark | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:135 |
| hr.leave.request | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | apps/api/src/auth/permissions.ts:136 |
| hr.leave.approve | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:141 |
| hr.roster.view | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | apps/api/src/auth/permissions.ts:142 |
| hr.roster.edit | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:146 |
| hr.report.view | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | apps/api/src/auth/permissions.ts:147 |
| hr.self.view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | apps/api/src/auth/permissions.ts:148 |
| crm.read | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | apps/api/src/auth/permissions.ts:153 |
| crm.configure | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:154 |
| crm.contacts.write | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | apps/api/src/auth/permissions.ts:155 |
| crm.contacts.authorize | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:156 |
| crm.leads.write | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | apps/api/src/auth/permissions.ts:157 |
| crm.leads.assign | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:158 |
| crm.interactions.write | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | apps/api/src/auth/permissions.ts:159 |
| crm.interactions.correct | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:160 |
| crm.calls.write | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | apps/api/src/auth/permissions.ts:161 |
| crm.tasks.write | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | apps/api/src/auth/permissions.ts:162 |
| crm.tasks.assign | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:163 |
| crm.appointments.write | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | apps/api/src/auth/permissions.ts:164 |
| crm.patients.link | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | apps/api/src/auth/permissions.ts:165 |
| payroll.read | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | apps/api/src/auth/permissions.ts:166 |
| payroll.write | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:173 |
| payroll.configure | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:174 |
| payroll.approve | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:175 |
| payroll.pay | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:176 |
| finance.consolidation.manage | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:177 |
| finance.export | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | apps/api/src/auth/permissions.ts:178 |
| finance.read | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | apps/api/src/auth/permissions.ts:185 |
| finance.write | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:193 |
| finance.configure | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:194 |
| finance.post | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:195 |
| finance.close | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:196 |
| finance.reconcile | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:197 |
| auth.login | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | apps/api/src/auth/permissions.ts:199 |
| auth.me | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | apps/api/src/auth/permissions.ts:222 |
| user.create | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:236 |
| user.read | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:238 |
| user.edit | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:239 |
| user.deactivate | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:240 |
| user.reset_password | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:241 |
| role.assign | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:242 |
| facility.manage | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:245 |
| department.manage | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:246 |
| room.manage | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:247 |
| practitioner.manage | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:248 |
| service.manage | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:250 |
| price.change | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:251 |
| drug.manage | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | R9: Proposal only; nurse sample grant unresolved | ❌ | ❌ | apps/api/src/auth/permissions.ts:253 |
| drug.read | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | apps/api/src/auth/permissions.ts:267 |
| labtest.manage | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | R9: Proposal only; nurse sample grant unresolved | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:269 |
| panel.manage | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:271 |
| template.manage.own | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:272 |
| template.manage.shared | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:273 |
| template.read | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:284 |
| setting.manage | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:285 |
| patient.create | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:288 |
| patient.edit_demographics | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:289 |
| patient.search | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:301 |
| patient.read_demographics | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | apps/api/src/auth/permissions.ts:307 |
| patient.read_clinical | ❌ | ❌ | ❌ | ❌ | R2: Restricted clinical read; admin cannot write psychiatric notes | ❌ | R7: Nurse clinical subset | ✅ | R8: Task-scoped / operational subset | R6: Pharmacist clinical subset | ❌ | ❌ | apps/api/src/auth/permissions.ts:320 |
| patient.read_history | ❌ | ❌ | ❌ | ❌ | R2: Restricted clinical read; admin cannot write psychiatric notes | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:328 |
| patient.merge_duplicates | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:329 |
| patient.void | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:331 |
| patient.delete | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:341 |
| allergy.record | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:342 |
| allergy.read | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | apps/api/src/auth/permissions.ts:344 |
| visit.create | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:347 |
| visit.read_queue | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | apps/api/src/auth/permissions.ts:348 |
| visit.change_status | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:361 |
| visit.record_complaint | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:375 |
| visit.cancel | ❌ | ❌ | ❌ | ❌ | ✅ | R5: State, ownership and time-window restrictions | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:376 |
| visit.reassign_practitioner | ❌ | ❌ | ❌ | ❌ | ✅ | R5: State, ownership and time-window restrictions | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:382 |
| visit.void | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:384 |
| appointment.create | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:394 |
| appointment.read | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | apps/api/src/auth/permissions.ts:400 |
| appointment.cancel | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:407 |
| appointment.mark_no_show | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:413 |
| vitals.record | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:418 |
| vitals.read | ❌ | ❌ | ❌ | ❌ | R2: Restricted clinical read; admin cannot write psychiatric notes | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:419 |
| diagnosis.record | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:420 |
| diagnosis.read | ❌ | ❌ | ❌ | ❌ | R2: Restricted clinical read; admin cannot write psychiatric notes | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:421 |
| clinical_note.write | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:422 |
| clinical_note.read | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:428 |
| attachment.upload | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:429 |
| attachment.read | ❌ | ❌ | ❌ | ❌ | R2: Restricted clinical read; admin cannot write psychiatric notes | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:430 |
| prescription.write | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:433 |
| prescription.read | ❌ | ❌ | ❌ | ❌ | R2: Restricted clinical read; admin cannot write psychiatric notes | ❌ | R7: Nurse clinical subset | ✅ | ❌ | ✅ | ❌ | ❌ | apps/api/src/auth/permissions.ts:435 |
| prescription.print | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | apps/api/src/auth/permissions.ts:436 |
| prescription.cancel | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | R5: State, ownership and time-window restrictions | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:437 |
| interaction.check | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | apps/api/src/auth/permissions.ts:447 |
| follow_up.read | ❌ | ❌ | ❌ | ❌ | R2: Restricted clinical read; admin cannot write psychiatric notes | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | apps/api/src/auth/permissions.ts:469 |
| follow_up.respond | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | apps/api/src/auth/permissions.ts:477 |
| lab_order.create | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:480 |
| lab_order.read_queue | ❌ | ❌ | ❌ | ❌ | ✅ | R8: Task-scoped / operational subset | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:481 |
| lab.collect_sample | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | R9: Proposal only; nurse sample grant unresolved | ❌ | ✅ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:483 |
| lab.enter_result | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:484 |
| lab.verify_result | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:486 |
| lab.print_result | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:487 |
| lab_result.read | ❌ | ❌ | ❌ | ❌ | R2: Restricted clinical read; admin cannot write psychiatric notes | ❌ | R7: Nurse clinical subset | ✅ | ✅ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:488 |
| lab.amend_result | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | R4: Preserve original; amendment / no hard deletion | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:490 |
| pharmacy.read_queue | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | apps/api/src/auth/permissions.ts:493 |
| pharmacy.dispense | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | apps/api/src/auth/permissions.ts:494 |
| pharmacy.return_medicine | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | R5: State, ownership and time-window restrictions | ❌ | ❌ | apps/api/src/auth/permissions.ts:495 |
| invoice.create | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | apps/api/src/auth/permissions.ts:498 |
| invoice.read | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | R12: Pharmacy origin; excludes lab bills | ✅ | ❌ | apps/api/src/auth/permissions.ts:503 |
| invoice.list | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | R12: Pharmacy origin; excludes lab bills | ✅ | ❌ | apps/api/src/auth/permissions.ts:516 |
| invoice.print | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | apps/api/src/auth/permissions.ts:517 |
| payment.receive | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | apps/api/src/auth/permissions.ts:518 |
| payment.refund | ❌ | ❌ | ❌ | ❌ | ✅ | R5: State, ownership and time-window restrictions | ❌ | ❌ | ❌ | R5: State, ownership and time-window restrictions | ❌ | ❌ | apps/api/src/auth/permissions.ts:519 |
| refund.print | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | apps/api/src/auth/permissions.ts:520 |
| discount.apply | ❌ | ❌ | ❌ | ❌ | ✅ | R10: Configured discount ceiling | ❌ | ❌ | ❌ | R10: Configured discount ceiling | ❌ | ❌ | apps/api/src/auth/permissions.ts:522 |
| discount.approve_over_threshold | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:523 |
| invoice.void | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:524 |
| lab_charge.read | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | apps/api/src/auth/permissions.ts:533 |
| lab_charge.collect | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:534 |
| report.operational | ❌ | ❌ | ❌ | ❌ | ✅ | R8: Task-scoped / operational subset | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | apps/api/src/auth/permissions.ts:538 |
| report.financial | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | apps/api/src/auth/permissions.ts:539 |
| report.clinical_aggregate | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | apps/api/src/auth/permissions.ts:541 |
| audit_log.read | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | apps/api/src/auth/permissions.ts:542 |
| error_log.read | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | apps/api/src/auth/permissions.ts:544 |
| data.export | ❌ | ❌ | ❌ | ❌ | R11: Export justification | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | apps/api/src/auth/permissions.ts:546 |

## Conditional enforcement

`PermissionsGuard.canActivate` checks presence only; services must enforce the condition. See `_audit/validation-messages.md` and the gap report. Do not interpret R5 as universally “own records only”: cancellation/refund paths have different checks. Role-dependent report and self-service scoping can narrow even an unconditional grant.
