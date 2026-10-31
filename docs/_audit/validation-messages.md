# Service and controller exception inventory

Exact source expressions, including interpolated messages. A thrown exception is not proof that its branch was exercised. Use this to resolve prerequisite errors; never bypass a validation with direct database edits.

| Owner | Type | Message expression | Source |
| --- | --- | --- | --- |
| login | BadRequestException | { message: 'Invalid login request', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/auth/auth.controller.ts:58 |
| me | UnauthorizedException | 'Invalid or expired token' | apps/api/src/auth/auth.controller.ts:88 |
| changePassword | UnauthorizedException | 'Invalid or expired token' | apps/api/src/auth/auth.controller.ts:98 |
| changePassword | BadRequestException | { message: 'Invalid password change', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/auth/auth.controller.ts:101 |
| refresh | BadRequestException | { message: 'Invalid refresh request', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/auth/auth.controller.ts:123 |
| logout | BadRequestException | { message: 'Invalid logout request', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/auth/auth.controller.ts:144 |
| sessionEndedException | UnauthorizedException | { message: 'Session ended', reason } | apps/api/src/auth/auth.service.ts:35 |
| login | UnauthorizedException | 'Invalid username or password' | apps/api/src/auth/auth.service.ts:119 |
| login | UnauthorizedException | 'Invalid username or password' | apps/api/src/auth/auth.service.ts:155 |
| me | UnauthorizedException | 'Invalid or expired token' | apps/api/src/auth/auth.service.ts:308 |
| changePassword | HttpException | { message: 'Too many attempts. Try again later.', retryAfter: limit.retryAfter }, 429 | apps/api/src/auth/auth.service.ts:357 |
| changePassword | BadRequestException | 'Current password is incorrect' | apps/api/src/auth/auth.service.ts:365 |
| changePassword | ConflictException | 'Account changed. Sign in again before retrying.' | apps/api/src/auth/auth.service.ts:381 |
| rejectDemoPassword | BadRequestException | 'Choose a password that is not a development or demo password.' | apps/api/src/auth/temporary-password.ts:8 |
| issueTemporaryPassword | BadRequestException | 'Use Change password for your own account.' | apps/api/src/auth/temporary-password.ts:21 |
| issueTemporaryPassword | NotFoundException | 'User not found' | apps/api/src/auth/temporary-password.ts:30 |
| canActivate | UnauthorizedException | 'Missing or malformed Authorization header' | apps/api/src/common/guards/jwt-auth.guard.ts:46 |
| canActivate | UnauthorizedException | 'Invalid or expired token' | apps/api/src/common/guards/jwt-auth.guard.ts:62 |
| canActivate | UnauthorizedException | 'Invalid or expired token' | apps/api/src/common/guards/jwt-auth.guard.ts:106 |
| canActivate | UnauthorizedException | 'Invalid or expired token' | apps/api/src/common/guards/jwt-auth.guard.ts:118 |
| canActivate | UnauthorizedException | 'Invalid or expired token' | apps/api/src/common/guards/jwt-auth.guard.ts:122 |
| canActivate | ForbiddenException | { code: 'password_change_required', message: 'Change your temporary password before using the system.', } | apps/api/src/common/guards/jwt-auth.guard.ts:131 |
| canActivate | ForbiddenException | 'Forbidden' | apps/api/src/common/guards/module.guard.ts:62 |
| canActivate | ForbiddenException | `Module not enabled: ${required}` | apps/api/src/common/guards/module.guard.ts:71 |
| canActivate | ForbiddenException | 'Forbidden' | apps/api/src/common/guards/permissions.guard.ts:63 |
| canActivate | ForbiddenException | 'Forbidden' | apps/api/src/common/guards/permissions.guard.ts:83 |
| canActivate | ForbiddenException | `Missing permission: ${required}` | apps/api/src/common/guards/permissions.guard.ts:93 |
| idempotentCommand | ConflictException | { code: 'idempotency_mismatch', message: 'This request key was already used for a different command.', } | apps/api/src/common/idempotent-command.ts:36 |
| check | ServiceUnavailableException | { status: 'error', database: 'down', } | apps/api/src/health/health.controller.ts:46 |
| pending | BadRequestException | 'Choose event types and a limit between 1 and 500' | apps/api/src/integration/integration.service.ts:13 |
| consume | NotFoundException | 'Integration event not found' | apps/api/src/integration/integration.service.ts:35 |
| validateConsumer | BadRequestException | 'Invalid consumer name' | apps/api/src/integration/integration.service.ts:49 |
| record | BadRequestException | { message: 'Invalid allergy', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/allergy/allergy.controller.ts:59 |
| update | BadRequestException | { message: 'Invalid allergy', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/allergy/allergy.controller.ts:84 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/allergy/allergy.controller.ts:97 |
| update | NotFoundException | 'Allergy not found' | apps/api/src/modules/allergy/allergy.service.ts:144 |
| requirePatient | NotFoundException | 'Patient not found' | apps/api/src/modules/allergy/allergy.service.ts:186 |
| requireKnownDrug | BadRequestException | { message: 'Unknown drug', code: 'unknown_drug' } | apps/api/src/modules/allergy/allergy.service.ts:198 |
| create | BadRequestException | { message: 'Invalid appointment', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/appointment/appointment.controller.ts:52 |
| list | BadRequestException | { message: 'Invalid appointment filter', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/appointment/appointment.controller.ts:67 |
| close | BadRequestException | { message: 'Invalid appointment change', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/appointment/appointment.controller.ts:91 |
| close | ForbiddenException | `Missing permission: ${needed}` | apps/api/src/modules/appointment/appointment.controller.ts:101 |
| reschedule | BadRequestException | { message: 'Invalid appointment reschedule', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/appointment/appointment.controller.ts:116 |
| reschedule | ForbiddenException | 'Missing permission: appointment.create' | apps/api/src/modules/appointment/appointment.controller.ts:123 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/appointment/appointment.controller.ts:130 |
| createIn | NotFoundException | 'Patient not found' | apps/api/src/modules/appointment/appointment.service.ts:98 |
| createIn | BadRequestException | 'Unknown department' | apps/api/src/modules/appointment/appointment.service.ts:104 |
| createIn | BadRequestException | 'Department is not active' | apps/api/src/modules/appointment/appointment.service.ts:105 |
| createIn | ForbiddenException | 'A doctor may only book a follow-up with themselves.' | apps/api/src/modules/appointment/appointment.service.ts:120 |
| createIn | BadRequestException | 'Unknown practitioner' | apps/api/src/modules/appointment/appointment.service.ts:135 |
| createIn | BadRequestException | 'Practitioner is not active' | apps/api/src/modules/appointment/appointment.service.ts:136 |
| createIn | BadRequestException | 'Practitioner does not work in that department' | apps/api/src/modules/appointment/appointment.service.ts:140 |
| createIn | BadRequestException | 'That date has already passed.' | apps/api/src/modules/appointment/appointment.service.ts:148 |
| createIn | BadRequestException | 'Choose a future time and duration within the selected day.' | apps/api/src/modules/appointment/appointment.service.ts:163 |
| createIn | ConflictException | 'The provider or patient already has a booking in this interval. Date-only bookings must be reviewed before adding timed appointments.' | apps/api/src/modules/appointment/appointment.service.ts:179 |
| reschedule | NotFoundException | 'Appointment not found' | apps/api/src/modules/appointment/appointment.service.ts:255 |
| reschedule | ConflictException | 'Only an open appointment can be rescheduled.' | apps/api/src/modules/appointment/appointment.service.ts:257 |
| closeIn | NotFoundException | 'Appointment not found' | apps/api/src/modules/appointment/appointment.service.ts:297 |
| closeIn | BadRequestException | { message: `A ${current.status} appointment cannot be marked ${input.status}.`, code: 'illegal_transition', from: current.status, } | apps/api/src/modules/appointment/appointment.service.ts:300 |
| closeIn | ConflictException | 'Appointment changed; reload before cancelling.' | apps/api/src/modules/appointment/appointment.service.ts:322 |
| fulfilOnArrival | ConflictException | 'Appointment changed during arrival; retry check-in.' | apps/api/src/modules/appointment/appointment.service.ts:371 |
| save | BadRequestException | { message: 'Invalid clinical note', errors: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message, })), } | apps/api/src/modules/clinical-note/clinical-note.controller.ts:67 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/clinical-note/clinical-note.controller.ts:83 |
| requireVisit | NotFoundException | 'Visit not found' | apps/api/src/modules/clinical-note/clinical-note.service.ts:125 |
| requireOpenVisit | BadRequestException | { message: 'This visit is closed. A clinical note can only be written during the visit.', code: 'visit_closed', } | apps/api/src/modules/clinical-note/clinical-note.service.ts:132 |
| toNote | BadRequestException | `Clinical notes of type '${row.noteType}' are not supported yet.` | apps/api/src/modules/clinical-note/clinical-note.service.ts:185 |
| list | BadRequestException | { message: 'Invalid collections filter', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/collections/collections.controller.ts:31 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/collections/collections.controller.ts:43 |
| parse | BadRequestException | 'Check the relationship, provider, date and duration.' | apps/api/src/modules/crm/crm-appointments.controller.ts:30 |
| auth | UnauthorizedException |  | apps/api/src/modules/crm/crm-appointments.controller.ts:34 |
| access | ForbiddenException | 'Verify the caller and scheduling authority before accessing appointments.' | apps/api/src/modules/crm/crm-appointments.service.ts:57 |
| access | NotFoundException |  | apps/api/src/modules/crm/crm-appointments.service.ts:63 |
| availability | NotFoundException |  | apps/api/src/modules/crm/crm-appointments.service.ts:142 |
| create | BadRequestException | 'This lead is linked to a different patient. Review the patient mapping.' | apps/api/src/modules/crm/crm-appointments.service.ts:171 |
| create | BadRequestException | 'Choose a lead belonging to this contact.' | apps/api/src/modules/crm/crm-appointments.service.ts:181 |
| detail | NotFoundException |  | apps/api/src/modules/crm/crm-appointments.service.ts:232 |
| cancel | NotFoundException |  | apps/api/src/modules/crm/crm-appointments.service.ts:242 |
| parse | BadRequestException | { code: 'invalid_crm_call', message: 'Check call direction, state, times, outcome and next action.', } | apps/api/src/modules/crm/crm-calls.controller.ts:25 |
| auth | UnauthorizedException |  | apps/api/src/modules/crm/crm-calls.controller.ts:32 |
| row | NotFoundException |  | apps/api/src/modules/crm/crm-calls.service.ts:57 |
| create | BadRequestException | { code: 'crm_call_time', message: 'The call end time cannot be in the future.', } | apps/api/src/modules/crm/crm-calls.service.ts:126 |
| create | BadRequestException | { code: 'crm_call_callback', message: 'A callback must retain the original caller and subject. Record a separate call if they differ.', } | apps/api/src/modules/crm/crm-calls.service.ts:151 |
| complete | ConflictException | { code: 'crm_call_conflict', message: 'This action changed or is no longer pending. Reload the call.', } | apps/api/src/modules/crm/crm-calls.service.ts:189 |
| parse | BadRequestException | { code: 'invalid_crm_contact', message: 'Check the required fields and confirmations.', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/crm/crm-contacts.controller.ts:35 |
| auth | UnauthorizedException |  | apps/api/src/modules/crm/crm-contacts.controller.ts:43 |
| contact | NotFoundException |  | apps/api/src/modules/crm/crm-contacts.service.ts:56 |
| contact | ConflictException | { code: 'crm_contact_conflict', message: 'This contact changed. Reload before saving.', } | apps/api/src/modules/crm/crm-contacts.service.ts:58 |
| duplicates | ConflictException | { code: 'crm_duplicates', message: 'Similar contacts exist. Review them before saving a separate person.', candidates: matches, } | apps/api/src/modules/crm/crm-contacts.service.ts:120 |
| link | BadRequestException | 'Restore the contact first' | apps/api/src/modules/crm/crm-contacts.service.ts:167 |
| link | BadRequestException | { code: 'crm_patient_not_matched', message: 'MRN and full name must match an active patient at this facility.', } | apps/api/src/modules/crm/crm-contacts.service.ts:177 |
| link | ConflictException | { code: 'crm_link_exists', message: 'This patient is already linked. Update the existing relationship.', } | apps/api/src/modules/crm/crm-contacts.service.ts:186 |
| authority | NotFoundException |  | apps/api/src/modules/crm/crm-contacts.service.ts:209 |
| consent | NotFoundException |  | apps/api/src/modules/crm/crm-contacts.service.ts:234 |
| consent | BadRequestException | { code: 'crm_consent_blocked', message: 'Restore the contact, clear do-not-contact and provide a destination before recording a grant.', } | apps/api/src/modules/crm/crm-contacts.service.ts:237 |
| verify | NotFoundException |  | apps/api/src/modules/crm/crm-contacts.service.ts:266 |
| verify | BadRequestException | { code: 'crm_not_authorized', message: 'An active, authorized patient relationship is required.', } | apps/api/src/modules/crm/crm-contacts.service.ts:273 |
| parse | BadRequestException | { code: 'invalid_crm_lead', message: 'Check the required lead fields, qualification confirmations and closure reason.', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/crm/crm-leads.controller.ts:31 |
| auth | UnauthorizedException |  | apps/api/src/modules/crm/crm-leads.controller.ts:39 |
| row | NotFoundException |  | apps/api/src/modules/crm/crm-leads.service.ts:146 |
| row | ConflictException | { code: 'crm_lead_conflict', message: 'This lead changed. Reload before saving.', } | apps/api/src/modules/crm/crm-leads.service.ts:148 |
| references | BadRequestException | { code: 'crm_lead_contact', message: 'Choose an active contact from this facility.', } | apps/api/src/modules/crm/crm-leads.service.ts:190 |
| references | BadRequestException | { code: 'crm_lead_owner', message: 'Choose an active CRM owner from this facility.', } | apps/api/src/modules/crm/crm-leads.service.ts:202 |
| duplicates | ConflictException | { code: 'crm_lead_duplicates', message: 'Similar open inquiries exist. Review them before creating a separate lead.', candidates, } | apps/api/src/modules/crm/crm-leads.service.ts:236 |
| create | ForbiddenException | { code: 'crm_lead_assignment', message: 'New leads must be assigned to you. Ask an administrator to reassign them.', } | apps/api/src/modules/crm/crm-leads.service.ts:245 |
| update | ConflictException | 'Correct the patient mapping before changing the lead contact.' | apps/api/src/modules/crm/crm-leads.service.ts:292 |
| update | ForbiddenException | { code: 'crm_lead_assignment', message: 'Only the assigned agent or an administrator may edit this lead.', } | apps/api/src/modules/crm/crm-leads.service.ts:296 |
| update | BadRequestException | { code: 'crm_lead_closed', message: 'An administrator must reopen this lead to New with a reason before editing.', } | apps/api/src/modules/crm/crm-leads.service.ts:304 |
| update | BadRequestException | { code: 'crm_lead_transition', message: 'This stage change is not allowed. Record contact before qualifying a new inquiry.', } | apps/api/src/modules/crm/crm-leads.service.ts:312 |
| update | BadRequestException | { code: 'crm_lead_requalify', message: 'Return to Contacted before changing the contact on a qualified lead.', } | apps/api/src/modules/crm/crm-leads.service.ts:322 |
| claim | ConflictException | { code: 'crm_lead_claim', message: 'Only an open unassigned lead can be claimed. Reload the lead.', } | apps/api/src/modules/crm/crm-leads.service.ts:364 |
| parse | BadRequestException | 'Confirm identity and duplicate review; check required fields.' | apps/api/src/modules/crm/crm-patients.controller.ts:28 |
| auth | UnauthorizedException |  | apps/api/src/modules/crm/crm-patients.controller.ts:32 |
| lead | NotFoundException |  | apps/api/src/modules/crm/crm-patients.service.ts:32 |
| change | ForbiddenException |  | apps/api/src/modules/crm/crm-patients.service.ts:140 |
| change | ForbiddenException | 'Qualify the lead and select an active contact before linking.' | apps/api/src/modules/crm/crm-patients.service.ts:143 |
| change | ForbiddenException | 'Registration requires existing patient registration and authorization permissions.' | apps/api/src/modules/crm/crm-patients.service.ts:147 |
| change | ForbiddenException | 'Verify the caller and patient relationship before linking.' | apps/api/src/modules/crm/crm-patients.service.ts:153 |
| change | ForbiddenException |  | apps/api/src/modules/crm/crm-patients.service.ts:159 |
| change | ConflictException | 'Lead changed. Reload before saving.' | apps/api/src/modules/crm/crm-patients.service.ts:173 |
| change | ConflictException | 'No active mapping.' | apps/api/src/modules/crm/crm-patients.service.ts:178 |
| change | ConflictException | 'Correct the existing mapping before linking another patient.' | apps/api/src/modules/crm/crm-patients.service.ts:185 |
| change | ConflictException | { code: 'duplicate_patient', message: 'Review possible duplicates before registering.', matches, } | apps/api/src/modules/crm/crm-patients.service.ts:197 |
| change | BadRequestException |  | apps/api/src/modules/crm/crm-patients.service.ts:224 |
| change | ConflictException | 'Lead changed. Reload before saving.' | apps/api/src/modules/crm/crm-patients.service.ts:241 |
| canActivate | UnauthorizedException |  | apps/api/src/modules/crm/crm-rate-limit.guard.ts:18 |
| canActivate | HttpException | { code: 'crm_rate_limit', message: 'Too many requests. Wait a minute and try again.' }, HttpStatus.TOO_MANY_REQUESTS | apps/api/src/modules/crm/crm-rate-limit.guard.ts:28 |
| parse | BadRequestException | { code: 'invalid_crm_task', message: 'Check the task, owner, schedule, status and required outcome or reason.', } | apps/api/src/modules/crm/crm-tasks.controller.ts:32 |
| auth | UnauthorizedException |  | apps/api/src/modules/crm/crm-tasks.controller.ts:39 |
| row | NotFoundException |  | apps/api/src/modules/crm/crm-tasks.service.ts:85 |
| row | ConflictException | 'This task changed. Reload before saving.' | apps/api/src/modules/crm/crm-tasks.service.ts:87 |
| source | NotFoundException |  | apps/api/src/modules/crm/crm-tasks.service.ts:96 |
| owner | BadRequestException | 'Choose active CRM staff in this facility.' | apps/api/src/modules/crm/crm-tasks.service.ts:107 |
| editable | ForbiddenException | 'Only the owner or a CRM administrator may change this task.' | apps/api/src/modules/crm/crm-tasks.service.ts:111 |
| schedule | BadRequestException | 'Due time must be before source retention expiry; reminder must be at or before due time.' | apps/api/src/modules/crm/crm-tasks.service.ts:118 |
| create | ForbiddenException | 'Agents create tasks assigned to themselves.' | apps/api/src/modules/crm/crm-tasks.service.ts:290 |
| create | ForbiddenException |  | apps/api/src/modules/crm/crm-tasks.service.ts:299 |
| create | NotFoundException |  | apps/api/src/modules/crm/crm-tasks.service.ts:312 |
| update | ForbiddenException | 'Only a CRM administrator may reassign tasks.' | apps/api/src/modules/crm/crm-tasks.service.ts:337 |
| update | BadRequestException | 'Reopen this task before editing it.' | apps/api/src/modules/crm/crm-tasks.service.ts:339 |
| update | BadRequestException | 'Assign an owner before starting work.' | apps/api/src/modules/crm/crm-tasks.service.ts:341 |
| action | ConflictException | 'This task is closed.' | apps/api/src/modules/crm/crm-tasks.service.ts:389 |
| action | ConflictException | 'This task already has an owner.' | apps/api/src/modules/crm/crm-tasks.service.ts:392 |
| action | ConflictException | 'No pending reminder for this schedule.' | apps/api/src/modules/crm/crm-tasks.service.ts:403 |
| parse | BadRequestException | { code: 'invalid_crm_interaction', message: 'Check the interaction fields and subject references.', } | apps/api/src/modules/crm/crm-timeline.controller.ts:30 |
| auth | UnauthorizedException |  | apps/api/src/modules/crm/crm-timeline.controller.ts:37 |
| subject | NotFoundException |  | apps/api/src/modules/crm/crm-timeline.service.ts:143 |
| subject | NotFoundException |  | apps/api/src/modules/crm/crm-timeline.service.ts:151 |
| row | NotFoundException |  | apps/api/src/modules/crm/crm-timeline.service.ts:185 |
| recordInTransaction | BadRequestException |  | apps/api/src/modules/crm/crm-timeline.service.ts:216 |
| recordInTransaction | BadRequestException | { code: 'crm_timeline_contact', message: 'Restore the contact before recording a new interaction.', } | apps/api/src/modules/crm/crm-timeline.service.ts:221 |
| recordInTransaction | BadRequestException | { code: 'crm_timeline_subject', message: 'The lead contact changed. Reload before recording the interaction.', } | apps/api/src/modules/crm/crm-timeline.service.ts:229 |
| recordInTransaction | ForbiddenException | { code: 'crm_timeline_authority', message: 'A current caller check and authorized patient relationship are required for this purpose.', } | apps/api/src/modules/crm/crm-timeline.service.ts:243 |
| recordInTransaction | BadRequestException | { code: 'crm_timeline_time', message: 'Choose an event time within the timeline retention period and not in the future.', } | apps/api/src/modules/crm/crm-timeline.service.ts:258 |
| correct | BadRequestException | { code: 'crm_call_outcome', message: 'Call outcomes are fixed. Withdraw an incorrect call and record its replacement.', } | apps/api/src/modules/crm/crm-timeline.service.ts:308 |
| correct | ForbiddenException | { code: 'crm_timeline_correction', message: 'Only the author or an administrator may correct an active entry.', } | apps/api/src/modules/crm/crm-timeline.service.ts:314 |
| correct | ConflictException | { code: 'crm_timeline_conflict', message: 'This interaction changed. Reload before correcting it.', } | apps/api/src/modules/crm/crm-timeline.service.ts:319 |
| workspace | UnauthorizedException |  | apps/api/src/modules/crm/crm.controller.ts:29 |
| configure | UnauthorizedException |  | apps/api/src/modules/crm/crm.controller.ts:36 |
| configure | BadRequestException | { code: 'invalid_crm_settings', message: 'Check the CRM settings and try again.', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/crm/crm.controller.ts:39 |
| conflict | ConflictException | { code: 'crm_settings_conflict', message: 'CRM settings changed at another workstation. Reload before saving.', } | apps/api/src/modules/crm/crm.service.ts:71 |
| create | BadRequestException | { message: 'Invalid department', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/department/department.controller.ts:46 |
| setActive | BadRequestException | { message: 'Invalid request', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/department/department.controller.ts:63 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/department/department.controller.ts:74 |
| create | ConflictException | `Department code '${input.code}' already exists` | apps/api/src/modules/department/department.service.ts:78 |
| setActive | NotFoundException | 'Department not found' | apps/api/src/modules/department/department.service.ts:107 |
| record | BadRequestException | { message: 'Invalid diagnosis', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/diagnosis/diagnosis.controller.ts:58 |
| update | BadRequestException | { message: 'Invalid diagnosis', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/diagnosis/diagnosis.controller.ts:78 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/diagnosis/diagnosis.controller.ts:107 |
| requireVisit | NotFoundException | 'Visit not found' | apps/api/src/modules/diagnosis/diagnosis.service.ts:176 |
| requireOpenVisit | BadRequestException | { message: 'This visit is closed. A diagnosis can only be written during the visit.', code: 'visit_closed', } | apps/api/src/modules/diagnosis/diagnosis.service.ts:183 |
| requireDiagnosis | NotFoundException | 'Diagnosis not found' | apps/api/src/modules/diagnosis/diagnosis.service.ts:197 |
| requireKnownCode | BadRequestException | { message: `Unknown ICD code: ${code}`, code: 'unknown_icd' } | apps/api/src/modules/diagnosis/diagnosis.service.ts:210 |
| create | BadRequestException | { message: 'Invalid drug', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/drug/drug.controller.ts:57 |
| import | BadRequestException | { message: 'Invalid import', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/drug/drug.controller.ts:71 |
| update | BadRequestException | { message: 'Invalid drug', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/drug/drug.controller.ts:88 |
| setActive | BadRequestException | { message: 'Invalid request', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/drug/drug.controller.ts:105 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/drug/drug.controller.ts:116 |
| create | ConflictException | `Drug code '${input.code}' already exists` | apps/api/src/modules/drug/drug.service.ts:129 |
| assertDrugInFacility | NotFoundException | 'Drug not found' | apps/api/src/modules/drug/drug.service.ts:256 |
| check | BadRequestException | { message: 'Invalid interaction check', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/drug-interaction/drug-interaction.controller.ts:31 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/drug-interaction/drug-interaction.controller.ts:42 |
| setEnabled | BadRequestException | `Unknown module: ${moduleParam}` | apps/api/src/modules/facility-module/facility-module.controller.ts:54 |
| setEnabled | BadRequestException | { message: 'Invalid module update', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/facility-module/facility-module.controller.ts:58 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/facility-module/facility-module.controller.ts:69 |
| setEnabled | BadRequestException | 'This module has an integration key but is not installed yet.' | apps/api/src/modules/facility-module/facility-module.service.ts:50 |
| parse | BadRequestException | { message: 'Invalid asset/budget request', errors: r.error.flatten(), } | apps/api/src/modules/finance/finance-assets.controller.ts:22 |
| actor | UnauthorizedException |  | apps/api/src/modules/finance/finance-assets.controller.ts:33 |
| accounts | ConflictException | 'An asset posting account is inactive.' | apps/api/src/modules/finance/finance-assets.service.ts:89 |
| cash | BadRequestException | 'Choose an active cash/bank account in this facility.' | apps/api/src/modules/finance/finance-assets.service.ts:108 |
| create | BadRequestException | 'Depreciation must start in an open period on or after acquisition.' | apps/api/src/modules/finance/finance-assets.service.ts:118 |
| create | BadRequestException | 'Invalid department.' | apps/api/src/modules/finance/finance-assets.service.ts:127 |
| create | BadRequestException | 'Choose a posted, unreversed supplier bill debit line.' | apps/api/src/modules/finance/finance-assets.service.ts:152 |
| create | BadRequestException | 'Capitalization cannot precede the bill.' | apps/api/src/modules/finance/finance-assets.service.ts:154 |
| create | ConflictException | 'Capitalization exceeds the remaining bill line amount, including drafts.' | apps/api/src/modules/finance/finance-assets.service.ts:159 |
| dueOnce | BadRequestException | 'Asset not found.' | apps/api/src/modules/finance/finance-assets.service.ts:291 |
| dueOnce | ConflictException | 'Post the pending asset reversal first.' | apps/api/src/modules/finance/finance-assets.service.ts:299 |
| dueOnce | ConflictException | 'Create the missing Shamsi fiscal year before generating depreciation.' | apps/api/src/modules/finance/finance-assets.service.ts:325 |
| dueOnce | ConflictException | `Depreciation is missing in closed period ${p.label}; accountant correction is required.` | apps/api/src/modules/finance/finance-assets.service.ts:330 |
| generate | BadRequestException | 'Depreciation can only be generated for completed months.' | apps/api/src/modules/finance/finance-assets.service.ts:370 |
| dispose | BadRequestException | 'Asset not found.' | apps/api/src/modules/finance/finance-assets.service.ts:419 |
| dispose | ConflictException | 'Post acquisition/depreciation and finish reversals before disposal.' | apps/api/src/modules/finance/finance-assets.service.ts:427 |
| dispose | BadRequestException | 'Disposal cannot precede existing asset entries.' | apps/api/src/modules/finance/finance-assets.service.ts:431 |
| dispose | ConflictException | 'Generate and post all completed months of depreciation before disposal.' | apps/api/src/modules/finance/finance-assets.service.ts:447 |
| budget | ConflictException | 'Choose an open Shamsi budget period.' | apps/api/src/modules/finance/finance-assets.service.ts:528 |
| budget | BadRequestException | 'Choose an active expense or revenue account.' | apps/api/src/modules/finance/finance-assets.service.ts:540 |
| budget | BadRequestException | 'Choose an active department.' | apps/api/src/modules/finance/finance-assets.service.ts:547 |
| budget | ConflictException | 'Use either a whole-facility budget or department budgets for an account/period.' | apps/api/src/modules/finance/finance-assets.service.ts:556 |
| budget | ConflictException | 'Budget changed; refresh before saving.' | apps/api/src/modules/finance/finance-assets.service.ts:561 |
| checklist | NotFoundException | 'Period not found.' | apps/api/src/modules/finance/finance-close.service.ts:21 |
| action | NotFoundException | 'Period not found.' | apps/api/src/modules/finance/finance-close.service.ts:240 |
| action | ConflictException | 'Use the year-end workflow while a year closing is prepared or finalized.' | apps/api/src/modules/finance/finance-close.service.ts:242 |
| action | ConflictException | checklist.checks .filter((c) => !c.passed) .map((c) => c.label + ': ' + c.detail) .join('; ') &#124;&#124; 'Period is already closed.' | apps/api/src/modules/finance/finance-close.service.ts:247 |
| action | ConflictException | 'Close the period before locking it.' | apps/api/src/modules/finance/finance-close.service.ts:254 |
| action | ConflictException | 'Period is already open.' | apps/api/src/modules/finance/finance-close.service.ts:256 |
| year | NotFoundException | 'Fiscal year not found.' | apps/api/src/modules/finance/finance-close.service.ts:285 |
| year | ConflictException | 'This fiscal year is finalized.' | apps/api/src/modules/finance/finance-close.service.ts:286 |
| year | ConflictException | 'Only an unposted year closing can be cancelled.' | apps/api/src/modules/finance/finance-close.service.ts:289 |
| year | ConflictException | 'The fiscal year has not ended.' | apps/api/src/modules/finance/finance-close.service.ts:301 |
| year | ConflictException | 'Close months 1–11 first.' | apps/api/src/modules/finance/finance-close.service.ts:303 |
| year | ConflictException | 'Reopen month 12 before preparing a new year closing.' | apps/api/src/modules/finance/finance-close.service.ts:307 |
| year | ConflictException | check.checks .filter((c) => !c.passed) .map((c) => c.label + ': ' + c.detail) .join('; ') | apps/api/src/modules/finance/finance-close.service.ts:310 |
| year | ConflictException | 'Finalize earlier fiscal years with posted activity first.' | apps/api/src/modules/finance/finance-close.service.ts:326 |
| year | ConflictException | 'An independent reviewer must post the year-end journal first.' | apps/api/src/modules/finance/finance-close.service.ts:391 |
| year | ConflictException | 'An independent reviewer must finalize the fiscal year.' | apps/api/src/modules/finance/finance-close.service.ts:395 |
| year | ConflictException | check.checks .filter((c) => !c.passed) .map((c) => c.label) .join('; ') | apps/api/src/modules/finance/finance-close.service.ts:399 |
| decimal | BadRequestException | 'Money must be finite.' | apps/api/src/modules/finance/finance-ledger.service.ts:42 |
| command | ConflictException | 'A record with this reference already exists. Reload before retrying.' | apps/api/src/modules/finance/finance-ledger.service.ts:128 |
| settings | BadRequestException | 'Initialize finance before entering transactions.' | apps/api/src/modules/finance/finance-ledger.service.ts:138 |
| settings | BadRequestException | 'This release supports AFN books only.' | apps/api/src/modules/finance/finance-ledger.service.ts:140 |
| setup | BadRequestException | 'The facility must use AFN for this finance release.' | apps/api/src/modules/finance/finance-ledger.service.ts:148 |
| setup | ConflictException | 'Finance is already initialized; its cutover date cannot be reset.' | apps/api/src/modules/finance/finance-ledger.service.ts:150 |
| closePeriod | NotFoundException | 'Period not found' | apps/api/src/modules/finance/finance-ledger.service.ts:215 |
| closePeriod | ConflictException | 'Period is already closed.' | apps/api/src/modules/finance/finance-ledger.service.ts:216 |
| closePeriod | ConflictException | 'Post or remove draft journals before closing the period.' | apps/api/src/modules/finance/finance-ledger.service.ts:218 |
| closePeriod | ConflictException | 'Complete payroll review and approval before closing the period.' | apps/api/src/modules/finance/finance-ledger.service.ts:220 |
| closePeriod | ConflictException | 'Process the outstanding hospital billing events before closing this period.' | apps/api/src/modules/finance/finance-ledger.service.ts:237 |
| periodFor | BadRequestException | 'The date precedes the finance cutover date.' | apps/api/src/modules/finance/finance-ledger.service.ts:252 |
| periodFor | ConflictException | 'This date belongs to a closed legacy accounting period.' | apps/api/src/modules/finance/finance-ledger.service.ts:263 |
| periodFor | BadRequestException | `Create Shamsi fiscal year ${utcToShamsi(instant).slice(0, 4)} before posting.` | apps/api/src/modules/finance/finance-ledger.service.ts:268 |
| periodFor | ConflictException | 'The accounting period is closed.' | apps/api/src/modules/finance/finance-ledger.service.ts:272 |
| validateLines | BadRequestException | `A journal requires 2–${limit} lines.` | apps/api/src/modules/finance/finance-ledger.service.ts:284 |
| validateLines | BadRequestException | 'Choose active accounts from this facility.' | apps/api/src/modules/finance/finance-ledger.service.ts:290 |
| validateLines | BadRequestException | 'Control accounts are reserved for hospital and supplier transactions.' | apps/api/src/modules/finance/finance-ledger.service.ts:292 |
| validateLines | BadRequestException | 'Choose active cost centres from this facility.' | apps/api/src/modules/finance/finance-ledger.service.ts:301 |
| validateLines | BadRequestException | 'Use decimal money with at most two places and twelve whole digits.' | apps/api/src/modules/finance/finance-ledger.service.ts:308 |
| validateLines | BadRequestException | 'Each line requires one positive debit or credit.' | apps/api/src/modules/finance/finance-ledger.service.ts:314 |
| draftIn | BadRequestException | 'Posting date and source instant disagree.' | apps/api/src/modules/finance/finance-ledger.service.ts:328 |
| editJournal | ConflictException | 'Only the current version of a manual draft can be edited.' | apps/api/src/modules/finance/finance-ledger.service.ts:367 |
| deleteDraft | ConflictException | 'Only the current version of an eligible draft can be removed.' | apps/api/src/modules/finance/finance-ledger.service.ts:412 |
| deleteDraft | ConflictException | 'Remove or reverse later asset entries first.' | apps/api/src/modules/finance/finance-ledger.service.ts:434 |
| deleteDraft | ConflictException | 'Recalculate affected payroll before removing this loan.' | apps/api/src/modules/finance/finance-ledger.service.ts:442 |
| postIn | ConflictException | 'Journal changed or is already posted.' | apps/api/src/modules/finance/finance-ledger.service.ts:462 |
| postIn | ConflictException | 'A different accountant must review and post this entry.' | apps/api/src/modules/finance/finance-ledger.service.ts:464 |
| postIn | ConflictException | 'Journal period does not match its date.' | apps/api/src/modules/finance/finance-ledger.service.ts:467 |
| postIn | ConflictException | 'A finalized cash/bank reconciliation covers this date. Use a later open date for the adjustment.' | apps/api/src/modules/finance/finance-ledger.service.ts:491 |
| postIn | BadRequestException | 'Total debits must equal total credits and be greater than zero.' | apps/api/src/modules/finance/finance-ledger.service.ts:497 |
| reverse | ConflictException | 'Only an unreversed posted journal can be reversed.' | apps/api/src/modules/finance/finance-ledger.service.ts:545 |
| reverse | ConflictException | 'Reverse later asset entries before this one.' | apps/api/src/modules/finance/finance-ledger.service.ts:564 |
| reverse | ConflictException | 'Reverse capitalized assets before their supplier bill.' | apps/api/src/modules/finance/finance-ledger.service.ts:579 |
| reverse | BadRequestException | 'Correct hospital charges or payments in their source workflow, then synchronize finance.' | apps/api/src/modules/finance/finance-ledger.service.ts:581 |
| reverse | ConflictException | 'Approved payroll accrual is immutable. Record corrections in a subsequent payroll period.' | apps/api/src/modules/finance/finance-ledger.service.ts:585 |
| reverse | ConflictException | 'This loan has payroll deductions and cannot be reversed.' | apps/api/src/modules/finance/finance-ledger.service.ts:592 |
| reverse | BadRequestException | 'Reversal date must not precede the original posting.' | apps/api/src/modules/finance/finance-ledger.service.ts:594 |
| reverse | ConflictException | 'Reverse supplier payments before reversing the bill.' | apps/api/src/modules/finance/finance-ledger.service.ts:600 |
| reverse | ConflictException | 'This transaction is in a finalized statement. Enter an adjusting journal in an open period.' | apps/api/src/modules/finance/finance-ledger.service.ts:606 |
| systemAccount | BadRequestException | `Missing active system account: ${systemKey}` | apps/api/src/modules/finance/finance-ledger.service.ts:640 |
| requireJournal | NotFoundException | 'Journal not found' | apps/api/src/modules/finance/finance-ledger.service.ts:649 |
| previewOpening | BadRequestException | `Unknown or nonposting account: ${r.accountCode}` | apps/api/src/modules/finance/finance-ledger.service.ts:812 |
| previewOpening | BadRequestException | 'Opening debits and credits must balance exactly.' | apps/api/src/modules/finance/finance-ledger.service.ts:826 |
| importOpening | ConflictException | 'An opening import already exists. Reverse the posted import before replacing it.' | apps/api/src/modules/finance/finance-ledger.service.ts:847 |
| ledger | NotFoundException | 'Account not found' | apps/api/src/modules/finance/finance-ledger.service.ts:902 |
| csvRows | BadRequestException | 'Malformed CSV quote.' | apps/api/src/modules/finance/finance-opening.ts:29 |
| csvRows | BadRequestException | 'Use UTF-8 CSV with normal line endings.' | apps/api/src/modules/finance/finance-opening.ts:36 |
| csvRows | BadRequestException | 'Unexpected text after a quoted field.' | apps/api/src/modules/finance/finance-opening.ts:39 |
| csvRows | BadRequestException | 'Unclosed CSV quote.' | apps/api/src/modules/finance/finance-opening.ts:43 |
| openingCsv | BadRequestException | 'CSV headings must be accountCode,debit,credit,description.' | apps/api/src/modules/finance/finance-opening.ts:52 |
| openingCsv | BadRequestException | 'Opening balances require 2–1,000 rows.' | apps/api/src/modules/finance/finance-opening.ts:54 |
| openingCsv | BadRequestException | `CSV row ${i + 2} must contain four columns.` | apps/api/src/modules/finance/finance-opening.ts:58 |
| openingCsv | BadRequestException | `CSV row ${i + 2}: missing or repeated account code.` | apps/api/src/modules/finance/finance-opening.ts:61 |
| openingCsv | BadRequestException | `CSV row ${i + 2}: use plain decimal amounts and a description of at most 240 characters.` | apps/api/src/modules/finance/finance-opening.ts:67 |
| account | BadRequestException | cash ? 'Choose an active cash/bank account.' : 'Choose an active expense account.' | apps/api/src/modules/finance/finance-operations.service.ts:223 |
| bill | NotFoundException | 'Active supplier not found' | apps/api/src/modules/finance/finance-operations.service.ts:267 |
| settle | NotFoundException | 'Supplier bill not found' | apps/api/src/modules/finance/finance-operations.service.ts:322 |
| settle | ConflictException | 'Post the bill before preparing payment.' | apps/api/src/modules/finance/finance-operations.service.ts:324 |
| settle | ConflictException | 'This bill has been reversed.' | apps/api/src/modules/finance/finance-operations.service.ts:325 |
| settle | BadRequestException | 'Payment date cannot precede the bill date.' | apps/api/src/modules/finance/finance-operations.service.ts:327 |
| settle | BadRequestException | 'Payment exceeds the outstanding supplier balance.' | apps/api/src/modules/finance/finance-operations.service.ts:332 |
| statement | BadRequestException | 'Statement opening balance plus movements must equal its closing balance.' | apps/api/src/modules/finance/finance-operations.service.ts:383 |
| statement | ConflictException | 'Statements for the same account must not overlap.' | apps/api/src/modules/finance/finance-operations.service.ts:394 |
| match | NotFoundException | 'Statement line not found' | apps/api/src/modules/finance/finance-operations.service.ts:427 |
| match | ConflictException | 'The statement is finalized.' | apps/api/src/modules/finance/finance-operations.service.ts:428 |
| match | BadRequestException | 'Match a posted entry in the same account with the same signed amount and a date no later than the statement end.' | apps/api/src/modules/finance/finance-operations.service.ts:441 |
| match | ConflictException | 'This ledger entry is already matched.' | apps/api/src/modules/finance/finance-operations.service.ts:445 |
| reconcile | NotFoundException | 'Statement not found' | apps/api/src/modules/finance/finance-operations.service.ts:461 |
| reconcile | ConflictException | 'Statement is already finalized.' | apps/api/src/modules/finance/finance-operations.service.ts:462 |
| reconcile | ConflictException | 'Match every statement line before finalizing.' | apps/api/src/modules/finance/finance-operations.service.ts:464 |
| reconcile | ConflictException | 'Finalize the preceding statement and carry forward its closing balance.' | apps/api/src/modules/finance/finance-operations.service.ts:477 |
| reconcile | ConflictException | 'Bank and ledger do not reconcile. Check opening balances and outstanding entries.' | apps/api/src/modules/finance/finance-operations.service.ts:500 |
| parse | BadRequestException | { message: 'Invalid payables request', errors: result.error.flatten(), } | apps/api/src/modules/finance/finance-payables.controller.ts:24 |
| actor | UnauthorizedException |  | apps/api/src/modules/finance/finance-payables.controller.ts:35 |
| receiptPreview | BadRequestException | 'Use the supplied CSV template headings.' | apps/api/src/modules/finance/finance-payables.controller.ts:84 |
| receiptPreview | BadRequestException | `CSV row ${i + 2} must have five columns.` | apps/api/src/modules/finance/finance-payables.controller.ts:86 |
| account | BadRequestException | kind === 'cash' ? 'Choose an active cash/bank account.' : 'Choose an active expense or non-cash asset account.' | apps/api/src/modules/finance/finance-payables.service.ts:99 |
| centreCheck | BadRequestException | 'Choose an active cost centre in this facility.' | apps/api/src/modules/finance/finance-payables.service.ts:111 |
| updateSupplier | NotFoundException | 'Supplier not found.' | apps/api/src/modules/finance/finance-payables.service.ts:128 |
| supplier | NotFoundException | 'Active supplier not found.' | apps/api/src/modules/finance/finance-payables.service.ts:138 |
| mapped | BadRequestException | `Configure expense mapping for ${input.category}.` | apps/api/src/modules/finance/finance-payables.service.ts:152 |
| mapped | BadRequestException | 'Choose an account or mapped category.' | apps/api/src/modules/finance/finance-payables.service.ts:154 |
| payment | BadRequestException | 'Duplicate bill allocation.' | apps/api/src/modules/finance/finance-payables.service.ts:272 |
| payment | NotFoundException | 'Supplier bill not found.' | apps/api/src/modules/finance/finance-payables.service.ts:280 |
| payment | ConflictException | 'Post the bill and resolve reversals before paying.' | apps/api/src/modules/finance/finance-payables.service.ts:282 |
| payment | BadRequestException | 'Payment cannot precede the bill.' | apps/api/src/modules/finance/finance-payables.service.ts:284 |
| payment | ConflictException | `Allocation exceeds available balance for ${b.reference}, including reserved drafts.` | apps/api/src/modules/finance/finance-payables.service.ts:289 |
| receipt | BadRequestException | 'Received line amounts must be positive and total below one trillion AFN.' | apps/api/src/modules/finance/finance-payables.service.ts:341 |
| receiptBill | NotFoundException | 'Goods receipt not found.' | apps/api/src/modules/finance/finance-payables.service.ts:366 |
| receiptBill | ConflictException | 'This goods receipt already has a bill.' | apps/api/src/modules/finance/finance-payables.service.ts:367 |
| receiptBill | BadRequestException | 'Bill date cannot precede the goods receipt.' | apps/api/src/modules/finance/finance-payables.service.ts:369 |
| discardReceipt | NotFoundException | 'Goods receipt not found.' | apps/api/src/modules/finance/finance-payables.service.ts:401 |
| discardReceipt | ConflictException | 'Remove the unposted bill first. Posted procurement records cannot be removed.' | apps/api/src/modules/finance/finance-payables.service.ts:403 |
| statement | NotFoundException | 'Supplier not found.' | apps/api/src/modules/finance/finance-payables.service.ts:486 |
| parse | BadRequestException | { message: 'Invalid payroll request', errors: r.error.flatten(), } | apps/api/src/modules/finance/finance-payroll.controller.ts:21 |
| actor | UnauthorizedException |  | apps/api/src/modules/finance/finance-payroll.controller.ts:32 |
| period | NotFoundException | 'Fiscal period not found.' | apps/api/src/modules/finance/finance-payroll.service.ts:48 |
| period | ConflictException | 'Payroll period is closed.' | apps/api/src/modules/finance/finance-payroll.service.ts:49 |
| employee | NotFoundException | 'Payroll employee not found.' | apps/api/src/modules/finance/finance-payroll.service.ts:54 |
| cash | BadRequestException | 'Choose an active cash or bank account in this facility.' | apps/api/src/modules/finance/finance-payroll.service.ts:63 |
| saveEmployee | BadRequestException | 'Choose an active cost centre in this facility.' | apps/api/src/modules/finance/finance-payroll.service.ts:134 |
| issueLoan | BadRequestException | 'Loan date must fall within active employment.' | apps/api/src/modules/finance/finance-payroll.service.ts:158 |
| issueLoan | BadRequestException | 'First deduction period precedes the loan.' | apps/api/src/modules/finance/finance-payroll.service.ts:161 |
| issueLoan | ConflictException | 'First deduction period is already approved.' | apps/api/src/modules/finance/finance-payroll.service.ts:167 |
| calculate | BadRequestException | 'Accrual date must be inside the payroll period.' | apps/api/src/modules/finance/finance-payroll.service.ts:216 |
| calculate | BadRequestException | 'Configure payroll tax before calculating.' | apps/api/src/modules/finance/finance-payroll.service.ts:219 |
| calculate | ConflictException | 'Approved payroll is immutable.' | apps/api/src/modules/finance/finance-payroll.service.ts:225 |
| calculate | ConflictException | 'Calculate payroll in chronological order. A later period is already approved.' | apps/api/src/modules/finance/finance-payroll.service.ts:235 |
| calculate | BadRequestException | 'No active employees in this period.' | apps/api/src/modules/finance/finance-payroll.service.ts:248 |
| calculate | BadRequestException | 'Payroll supports up to 500 employees per facility.' | apps/api/src/modules/finance/finance-payroll.service.ts:250 |
| calculate | BadRequestException | 'Adjustment employee is not eligible in this facility and period.' | apps/api/src/modules/finance/finance-payroll.service.ts:253 |
| calculate | BadRequestException | `Activate the cost centre for ${e.code}.` | apps/api/src/modules/finance/finance-payroll.service.ts:279 |
| calculate | ConflictException | 'Post earlier approved payroll journals before calculating this period.' | apps/api/src/modules/finance/finance-payroll.service.ts:316 |
| calculate | BadRequestException | `${e.code}: ${error instanceof Error ? error.message : 'Invalid payroll'}` | apps/api/src/modules/finance/finance-payroll.service.ts:339 |
| action | NotFoundException | 'Payroll run not found.' | apps/api/src/modules/finance/finance-payroll.service.ts:390 |
| action | ConflictException | 'Payroll changed; reload the current run.' | apps/api/src/modules/finance/finance-payroll.service.ts:395 |
| action | ConflictException | 'A different payroll approver must approve this run.' | apps/api/src/modules/finance/finance-payroll.service.ts:403 |
| action | ConflictException | 'A later payroll period was approved. Payroll must be approved in chronological order.' | apps/api/src/modules/finance/finance-payroll.service.ts:413 |
| action | ConflictException | 'Loan balances changed. Recalculate payroll before approval.' | apps/api/src/modules/finance/finance-payroll.service.ts:446 |
| action | ConflictException | 'A loan was issued after calculation. Recalculate payroll.' | apps/api/src/modules/finance/finance-payroll.service.ts:469 |
| payment | NotFoundException | 'Payroll item not found.' | apps/api/src/modules/finance/finance-payroll.service.ts:534 |
| payment | ConflictException | 'Approve payroll and post its accrual journal before paying.' | apps/api/src/modules/finance/finance-payroll.service.ts:541 |
| payment | BadRequestException | 'Salary payment cannot precede the payroll accrual.' | apps/api/src/modules/finance/finance-payroll.service.ts:543 |
| payment | ConflictException | 'Payment exceeds net salary after pending payments.' | apps/api/src/modules/finance/finance-payroll.service.ts:548 |
| detail | NotFoundException | 'Payroll run not found.' | apps/api/src/modules/finance/finance-payroll.service.ts:594 |
| source | NotFoundException | 'Journal not found.' | apps/api/src/modules/finance/finance-payroll.service.ts:646 |
| mapping | BadRequestException | 'Choose an active revenue account from this facility.' | apps/api/src/modules/finance/finance-revenue.service.ts:62 |
| mapping | BadRequestException | 'Service not found.' | apps/api/src/modules/finance/finance-revenue.service.ts:63 |
| assignPanel | NotFoundException | 'Invoice or panel not found.' | apps/api/src/modules/finance/finance-revenue.service.ts:76 |
| assignPanel | ConflictException | 'Panel activity already exists; its payer cannot be reassigned.' | apps/api/src/modules/finance/finance-revenue.service.ts:77 |
| mappingAccounts | BadRequestException | 'Configure an active revenue account for '+category+'.' | apps/api/src/modules/finance/finance-revenue.service.ts:87 |
| sync | ConflictException | 'An earlier event must be processed first.' | apps/api/src/modules/finance/finance-revenue.service.ts:105 |
| sync | BadRequestException | 'Source invoice is missing; review its audit history.' | apps/api/src/modules/finance/finance-revenue.service.ts:111 |
| sync | BadRequestException | 'Source invoice predates cutover; reconcile opening receivables first.' | apps/api/src/modules/finance/finance-revenue.service.ts:112 |
| sync | BadRequestException | 'Only AFN billing is supported.' | apps/api/src/modules/finance/finance-revenue.service.ts:113 |
| sync | BadRequestException | 'Negative invoice charges need a source correction.' | apps/api/src/modules/finance/finance-revenue.service.ts:136 |
| sync | BadRequestException | 'Invoice line charges do not explain its total.' | apps/api/src/modules/finance/finance-revenue.service.ts:142 |
| sync | BadRequestException | 'Assign an active panel to this invoice before importing its panel payment.' | apps/api/src/modules/finance/finance-revenue.service.ts:168 |
| sync | BadRequestException | 'This invoice exceeds 100 accounting lines; consolidate revenue mappings.' | apps/api/src/modules/finance/finance-revenue.service.ts:176 |
| panelReceipt | NotFoundException | 'Panel invoice not found.' | apps/api/src/modules/finance/finance-revenue.service.ts:220 |
| panelReceipt | BadRequestException | 'Receipt exceeds posted panel debt after reserved drafts.' | apps/api/src/modules/finance/finance-revenue.service.ts:226 |
| cash | BadRequestException | 'Choose an active cash or bank account.' | apps/api/src/modules/finance/finance-revenue.service.ts:235 |
| tillPreview | BadRequestException | 'Choose a completed shift of at most 24 hours.' | apps/api/src/modules/finance/finance-revenue.service.ts:241 |
| tillPreview | NotFoundException | 'Cashier not found.' | apps/api/src/modules/finance/finance-revenue.service.ts:242 |
| closeTill | BadRequestException | 'Explain the cash difference before closing.' | apps/api/src/modules/finance/finance-revenue.service.ts:254 |
| approveTill | NotFoundException | 'Till close not found.' | apps/api/src/modules/finance/finance-revenue.service.ts:262 |
| approveTill | ConflictException | 'A different accountant must approve this unapproved count.' | apps/api/src/modules/finance/finance-revenue.service.ts:263 |
| deposit | BadRequestException | 'Choose different cash and bank accounts.' | apps/api/src/modules/finance/finance-revenue.service.ts:271 |
| deposit | BadRequestException | 'Choose an approved till count.' | apps/api/src/modules/finance/finance-revenue.service.ts:275 |
| deposit | BadRequestException | 'Deposit date must be on or after the shift end.' | apps/api/src/modules/finance/finance-revenue.service.ts:276 |
| deposit | BadRequestException | 'Deposit exceeds counted cash after existing deposits and drafts.' | apps/api/src/modules/finance/finance-revenue.service.ts:278 |
| source | NotFoundException | 'Journal not found.' | apps/api/src/modules/finance/finance-revenue.service.ts:289 |
| panelStatement | NotFoundException | 'Panel not found.' | apps/api/src/modules/finance/finance-revenue.service.ts:302 |
| parse | BadRequestException | { message: 'Invalid report request', errors: r.error.flatten() } | apps/api/src/modules/finance/finance-statements.controller.ts:24 |
| actor | UnauthorizedException |  | apps/api/src/modules/finance/finance-statements.controller.ts:35 |
| scope | ForbiddenException | 'Consolidated access is not granted for every selected facility.' | apps/api/src/modules/finance/finance-statements.service.ts:60 |
| scope | ForbiddenException | 'Your current role does not permit consolidated reporting.' | apps/api/src/modules/finance/finance-statements.service.ts:77 |
| scope | ForbiddenException | 'A selected facility is inactive or finance is disabled.' | apps/api/src/modules/finance/finance-statements.service.ts:87 |
| grant | BadRequestException | 'Use the exact report-access ID of an eligible user at another facility.' | apps/api/src/modules/finance/finance-statements.service.ts:172 |
| grant | ConflictException | 'Access grant changed; reload.' | apps/api/src/modules/finance/finance-statements.service.ts:179 |
| pack | BadRequestException | 'Choose a department from the selected single facility.' | apps/api/src/modules/finance/finance-statements.service.ts:209 |
| classify | ConflictException | 'Choose a posted cash journal in an open period.' | apps/api/src/modules/finance/finance-statements.service.ts:625 |
| classify | BadRequestException | 'Classifications must total the journal’s external cash movement.' | apps/api/src/modules/finance/finance-statements.service.ts:632 |
| classify | BadRequestException | 'Choose income/expense accounts from this facility.' | apps/api/src/modules/finance/finance-statements.service.ts:646 |
| classify | BadRequestException | 'Cash P&L allocations must be operating cash flows.' | apps/api/src/modules/finance/finance-statements.service.ts:648 |
| classify | ConflictException | 'Classification changed; reload.' | apps/api/src/modules/finance/finance-statements.service.ts:650 |
| template | BadRequestException | 'Report rows must use accounts and departments in this facility.' | apps/api/src/modules/finance/finance-statements.service.ts:678 |
| template | ConflictException | 'Report definition changed; reload.' | apps/api/src/modules/finance/finance-statements.service.ts:685 |
| custom | NotFoundException | 'Report template not found.' | apps/api/src/modules/finance/finance-statements.service.ts:707 |
| parse | BadRequestException | { message: 'Invalid finance request', errors: result.error.flatten(), } | apps/api/src/modules/finance/finance.controller.ts:26 |
| actor | UnauthorizedException |  | apps/api/src/modules/finance/finance.controller.ts:43 |
| receivables | BadRequestException | 'Choose patient or panel receivables.' | apps/api/src/modules/finance/finance.controller.ts:230 |
| ledgerReport | BadRequestException | 'Choose an account.' | apps/api/src/modules/finance/finance.controller.ts:255 |
| list | BadRequestException | { message: 'Invalid follow-up filter', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/follow-up/follow-up.controller.ts:42 |
| respond | BadRequestException | { message: 'Invalid follow-up response', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/follow-up/follow-up.controller.ts:67 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/follow-up/follow-up.controller.ts:79 |
| respond | NotFoundException | 'Follow-up not found' | apps/api/src/modules/follow-up/follow-up.service.ts:125 |
| respond | BadRequestException | 'This prescription has no follow-up date to respond to' | apps/api/src/modules/follow-up/follow-up.service.ts:127 |
| forPatient | BadRequestException | { message: 'Invalid history window', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/history/history.controller.ts:51 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/history/history.controller.ts:63 |
| requirePatient | NotFoundException | 'Patient not found' | apps/api/src/modules/history/history.service.ts:152 |
| search | BadRequestException | { message: 'Invalid search', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/icd/icd.controller.ts:32 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/icd/icd.controller.ts:43 |
| apply | NotFoundException | 'Invoice not found' | apps/api/src/modules/invoice/discount.service.ts:61 |
| apply | BadRequestException | { message: 'This bill was cancelled — there is nothing to discount.', code: 'cancelled', } | apps/api/src/modules/invoice/discount.service.ts:63 |
| apply | BadRequestException | { message: 'The discount is more than the bill.', code: 'over_subtotal', } | apps/api/src/modules/invoice/discount.service.ts:69 |
| apply | BadRequestException | { message: 'This bill is already paid above the discounted total — a refund is needed first.', code: 'would_owe_refund', } | apps/api/src/modules/invoice/discount.service.ts:93 |
| authoriseCeiling | ForbiddenException | { message: `A discount over ${maxPercent}% needs an administrator's approval (up to ${ceiling.toFixed(2)} without).`, code: 'over_ceiling', } | apps/api/src/modules/invoice/discount.service.ts:168 |
| verifyApprover | UnauthorizedException | { message: 'That approval was not accepted — check the username and password.', code: 'approval_invalid', } | apps/api/src/modules/invoice/discount.service.ts:207 |
| verifyApprover | ForbiddenException | { message: 'An over-ceiling discount must be approved by a second person.', code: 'approval_self', } | apps/api/src/modules/invoice/discount.service.ts:213 |
| verifyApprover | ForbiddenException | { message: 'That user cannot approve a discount over the ceiling.', code: 'approval_insufficient', } | apps/api/src/modules/invoice/discount.service.ts:223 |
| list | BadRequestException | { message: 'Invalid invoice query', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/invoice/invoice.controller.ts:67 |
| pay | BadRequestException | { message: 'Invalid payment', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/invoice/invoice.controller.ts:117 |
| refund | BadRequestException | { message: 'Invalid refund', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/invoice/invoice.controller.ts:143 |
| discount | BadRequestException | { message: 'Invalid discount', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/invoice/invoice.controller.ts:175 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/invoice/invoice.controller.ts:187 |
| detail | NotFoundException | 'Invoice not found' | apps/api/src/modules/invoice/invoice.service.ts:219 |
| detail | ForbiddenException | "This bill is not this permission's to read." | apps/api/src/modules/invoice/invoice.service.ts:226 |
| byVisit | NotFoundException | 'Visit not found' | apps/api/src/modules/invoice/invoice.service.ts:345 |
| pay | NotFoundException | 'Invoice not found' | apps/api/src/modules/invoice/payment.service.ts:60 |
| pay | BadRequestException | { message: 'This bill was cancelled — there is nothing to pay.', code: 'cancelled', } | apps/api/src/modules/invoice/payment.service.ts:62 |
| pay | BadRequestException | { message: 'This bill is already fully paid.', code: 'already_paid', } | apps/api/src/modules/invoice/payment.service.ts:70 |
| pay | BadRequestException | { message: `That is more than the ${outstanding.toFixed(2)} still owed on this bill.`, code: 'overpayment', } | apps/api/src/modules/invoice/payment.service.ts:78 |
| pay | ConflictException | { message: 'This bill was just paid at another window. Reload and check the balance.', code: 'balance_changed', } | apps/api/src/modules/invoice/payment.service.ts:98 |
| refund | NotFoundException | 'Payment not found' | apps/api/src/modules/invoice/payment.service.ts:200 |
| refund | BadRequestException | { message: 'That payment has already been reversed.', code: 'already_reversed', } | apps/api/src/modules/invoice/payment.service.ts:202 |
| refund | BadRequestException | { message: 'That row is a refund, not a payment.', code: 'not_a_payment', } | apps/api/src/modules/invoice/payment.service.ts:209 |
| refund | ForbiddenException | { message: 'Only today’s payments can be refunded here. Ask an administrator.', code: 'outside_r5_window', } | apps/api/src/modules/invoice/payment.service.ts:223 |
| refund | ConflictException | { message: 'That payment was just reversed elsewhere. Reload.', code: 'already_reversed', } | apps/api/src/modules/invoice/payment.service.ts:237 |
| charges | BadRequestException | { message: 'Invalid lab charges query', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/lab-billing/lab-billing.controller.ts:38 |
| pay | BadRequestException | { message: 'Invalid lab payment', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/lab-billing/lab-billing.controller.ts:51 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/lab-billing/lab-billing.controller.ts:63 |
| charges | NotFoundException | 'Patient not found' | apps/api/src/modules/lab-billing/lab-billing.service.ts:40 |
| pay | BadRequestException | { message: 'One of those charges is not on this facility’s lab orders.', code: 'unknown_charge', } | apps/api/src/modules/lab-billing/lab-billing.service.ts:158 |
| pay | BadRequestException | { message: 'One of those tests is already paid.', code: 'already_paid', } | apps/api/src/modules/lab-billing/lab-billing.service.ts:165 |
| pay | BadRequestException | { message: 'One of those tests was just paid at another window. Reload.', code: 'already_paid', } | apps/api/src/modules/lab-billing/lab-billing.service.ts:188 |
| pay | BadRequestException | 'This invoice cannot accept payment' | apps/api/src/modules/lab-billing/lab-billing.service.ts:207 |
| pay | BadRequestException | 'Settle a discounted lab bill through the invoice payment screen' | apps/api/src/modules/lab-billing/lab-billing.service.ts:209 |
| pay | BadRequestException | 'Payment exceeds the remaining balance' | apps/api/src/modules/lab-billing/lab-billing.service.ts:214 |
| save | BadRequestException | { message: 'Invalid lab order', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/lab-order/lab-order.controller.ts:58 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/lab-order/lab-order.controller.ts:71 |
| save | BadRequestException | { message: 'This visit is closed. Lab tests can only be ordered during the visit.', code: 'visit_closed', } | apps/api/src/modules/lab-order/lab-order.service.ts:71 |
| save | BadRequestException | { message: 'A test is listed twice.', code: 'test_repeated' } | apps/api/src/modules/lab-order/lab-order.service.ts:81 |
| save | BadRequestException | { message: 'One of those tests is unknown or no longer offered.', code: 'unknown_test', } | apps/api/src/modules/lab-order/lab-order.service.ts:95 |
| requireVisit | NotFoundException | 'Visit not found' | apps/api/src/modules/lab-order/lab-order.service.ts:428 |
| list | BadRequestException | { message: 'Invalid lab queue filter', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/lab-order/lab-queue.controller.ts:61 |
| collect | BadRequestException | { message: 'Invalid sample collection', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/lab-order/lab-queue.controller.ts:74 |
| saveResult | BadRequestException | { message: 'Invalid result', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/lab-order/lab-queue.controller.ts:92 |
| verify | BadRequestException | { message: 'Invalid verification', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/lab-order/lab-queue.controller.ts:106 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/lab-order/lab-queue.controller.ts:118 |
| save | NotFoundException | 'Lab test not found' | apps/api/src/modules/lab-order/lab-result.service.ts:73 |
| save | BadRequestException | { message: 'This result is verified. Amending it is a separate action.', code: 'already_verified', } | apps/api/src/modules/lab-order/lab-result.service.ts:80 |
| save | BadRequestException | { message: 'A result can only be entered once the sample has been collected.', code: 'no_sample', } | apps/api/src/modules/lab-order/lab-result.service.ts:86 |
| verify | BadRequestException | { message: 'One of those results is not on this facility’s orders.', code: 'unknown_item', } | apps/api/src/modules/lab-order/lab-result.service.ts:203 |
| verify | BadRequestException | { message: 'Only a result that has been entered can be verified.', code: 'not_verifiable', } | apps/api/src/modules/lab-order/lab-result.service.ts:210 |
| verify | ConflictException | { message: 'One of those results just changed. Reload the queue.', code: 'result_changed', } | apps/api/src/modules/lab-order/lab-result.service.ts:222 |
| forVisit | NotFoundException | 'Visit not found' | apps/api/src/modules/lab-order/lab-result.service.ts:270 |
| collect | BadRequestException | { message: 'One of those tests is not on this facility’s orders.', code: 'unknown_item', } | apps/api/src/modules/lab-order/lab-sample.service.ts:46 |
| collect | BadRequestException | { message: 'A sample can only be taken for a test still waiting to be drawn.', code: 'not_collectable', } | apps/api/src/modules/lab-order/lab-sample.service.ts:54 |
| collect | BadRequestException | { message: 'The reception has not been paid for this test yet.', code: 'unpaid', } | apps/api/src/modules/lab-order/lab-sample.service.ts:76 |
| collect | ConflictException | { message: 'One of those samples was just taken by someone else. Reload the queue.', code: 'already_collected', } | apps/api/src/modules/lab-order/lab-sample.service.ts:88 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/lab-order/visit-lab-results.controller.ts:33 |
| create | BadRequestException | { message: 'Invalid lab panel', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/lab-panel/lab-panel.controller.ts:49 |
| update | BadRequestException | { message: 'Invalid lab panel', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/lab-panel/lab-panel.controller.ts:66 |
| setActive | BadRequestException | { message: 'Invalid request', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/lab-panel/lab-panel.controller.ts:83 |
| setTests | BadRequestException | { message: 'Invalid request', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/lab-panel/lab-panel.controller.ts:101 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/lab-panel/lab-panel.controller.ts:112 |
| create | ConflictException | `Lab panel code '${input.code}' already exists` | apps/api/src/modules/lab-panel/lab-panel.service.ts:67 |
| assertTestsInFacility | BadRequestException | 'One or more tests do not exist in this facility' | apps/api/src/modules/lab-panel/lab-panel.service.ts:157 |
| assertPanelInFacility | NotFoundException | 'Lab panel not found' | apps/api/src/modules/lab-panel/lab-panel.service.ts:167 |
| create | BadRequestException | { message: 'Invalid lab test', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/lab-test/lab-test.controller.ts:61 |
| update | BadRequestException | { message: 'Invalid lab test', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/lab-test/lab-test.controller.ts:78 |
| setActive | BadRequestException | { message: 'Invalid request', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/lab-test/lab-test.controller.ts:95 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/lab-test/lab-test.controller.ts:106 |
| create | ConflictException | `Lab test code '${input.code}' already exists` | apps/api/src/modules/lab-test/lab-test.service.ts:106 |
| assertTestInFacility | NotFoundException | 'Lab test not found' | apps/api/src/modules/lab-test/lab-test.service.ts:150 |
| create | BadRequestException | { message: 'Invalid patient', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/patient/patient.controller.ts:43 |
| search | BadRequestException | { message: 'Invalid search', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/patient/patient.controller.ts:62 |
| duplicates | BadRequestException | { message: 'Invalid duplicate check', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/patient/patient.controller.ts:89 |
| update | BadRequestException | { message: 'Invalid patient', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/patient/patient.controller.ts:116 |
| addIdentifier | BadRequestException | { message: 'Invalid identifier', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/patient/patient.controller.ts:136 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/patient/patient.controller.ts:160 |
| create | ConflictException | { message: 'Possible duplicate patient', code: 'duplicate_patient', matches: blocking, } | apps/api/src/modules/patient/patient.service.ts:208 |
| findById | NotFoundException | 'Patient not found' | apps/api/src/modules/patient/patient.service.ts:411 |
| update | ConflictException | { message: 'Possible duplicate patient', code: 'duplicate_patient', matches: blocking, } | apps/api/src/modules/patient/patient.service.ts:433 |
| addIdentifier | ConflictException | 'That number is already registered to a patient' | apps/api/src/modules/patient/patient.service.ts:503 |
| removeIdentifier | NotFoundException | 'Identifier not found' | apps/api/src/modules/patient/patient.service.ts:522 |
| bill | NotFoundException | 'Prescription not found' | apps/api/src/modules/pharmacy/dispense.service.ts:69 |
| bill | BadRequestException | { message: 'This prescription has already been dispensed.', code: 'already_dispensed', } | apps/api/src/modules/pharmacy/dispense.service.ts:71 |
| bill | BadRequestException | { message: 'There is nothing to dispense on this prescription.', code: 'nothing_to_dispense', } | apps/api/src/modules/pharmacy/dispense.service.ts:77 |
| bill | ConflictException | { message: 'This prescription was just billed at another bench. Reload.', code: 'already_billed', } | apps/api/src/modules/pharmacy/dispense.service.ts:93 |
| bill | BadRequestException | { message: 'Every drug on this sheet needs a price, and only those drugs.', code: 'price_mismatch', } | apps/api/src/modules/pharmacy/dispense.service.ts:107 |
| confirmHandover | NotFoundException | 'Prescription not found' | apps/api/src/modules/pharmacy/dispense.service.ts:205 |
| confirmHandover | BadRequestException | { message: 'This prescription has already been handed over.', code: 'already_dispensed', } | apps/api/src/modules/pharmacy/dispense.service.ts:207 |
| confirmHandover | BadRequestException | { message: 'This prescription has not been billed yet.', code: 'not_billed', } | apps/api/src/modules/pharmacy/dispense.service.ts:219 |
| confirmHandover | ForbiddenException | { message: 'The bill for this prescription is not fully paid yet.', code: 'not_paid', } | apps/api/src/modules/pharmacy/dispense.service.ts:229 |
| confirmHandover | ConflictException | { message: 'This prescription was just handed over at another bench. Reload.', code: 'already_dispensed', } | apps/api/src/modules/pharmacy/dispense.service.ts:243 |
| returnMedicine | NotFoundException | 'Prescription not found' | apps/api/src/modules/pharmacy/dispense.service.ts:273 |
| returnMedicine | BadRequestException | { message: 'This prescription has not been dispensed, so there is nothing to return.', code: 'not_dispensed', } | apps/api/src/modules/pharmacy/dispense.service.ts:275 |
| returnMedicine | ForbiddenException | { message: 'Only medicine dispensed today can be returned here.', code: 'outside_r5_window', } | apps/api/src/modules/pharmacy/dispense.service.ts:287 |
| returnMedicine | BadRequestException | { message: 'No pharmacy bill was found for this prescription.', code: 'no_bill', } | apps/api/src/modules/pharmacy/dispense.service.ts:300 |
| returnMedicine | BadRequestException | { message: 'This medicine has already been returned.', code: 'already_returned', } | apps/api/src/modules/pharmacy/dispense.service.ts:319 |
| returnMedicine | ConflictException | { message: 'This medicine was just returned at another bench. Reload.', code: 'already_returned', } | apps/api/src/modules/pharmacy/dispense.service.ts:331 |
| search | BadRequestException | { message: 'Invalid search', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/pharmacy/pharmacy.controller.ts:73 |
| bill | BadRequestException | { message: 'Invalid bill', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/pharmacy/pharmacy.controller.ts:113 |
| returnMedicine | BadRequestException | { message: 'Invalid return', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/pharmacy/pharmacy.controller.ts:153 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/pharmacy/pharmacy.controller.ts:165 |
| prescription | NotFoundException | 'Prescription not found' | apps/api/src/modules/pharmacy/pharmacy.service.ts:227 |
| create | BadRequestException | { message: 'Invalid practitioner', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/practitioner/practitioner.controller.ts:48 |
| createAccount | BadRequestException | { code: 'invalid_practitioner_account', message: 'Check the username, email and temporary password.', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/practitioner/practitioner.controller.ts:66 |
| setActive | BadRequestException | { message: 'Invalid request', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/practitioner/practitioner.controller.ts:93 |
| setDepartments | BadRequestException | { message: 'Invalid request', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/practitioner/practitioner.controller.ts:111 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/practitioner/practitioner.controller.ts:122 |
| create | ConflictException | `Practitioner code '${input.code}' already exists` | apps/api/src/modules/practitioner/practitioner.service.ts:86 |
| createAccount | NotFoundException | 'Practitioner not found' | apps/api/src/modules/practitioner/practitioner.service.ts:126 |
| createAccount | BadRequestException | { code: 'inactive_practitioner', message: 'Reactivate this practitioner before creating a login account.', } | apps/api/src/modules/practitioner/practitioner.service.ts:128 |
| createAccount | ConflictException | { code: 'practitioner_account_exists', message: 'This practitioner already has a linked login account.', } | apps/api/src/modules/practitioner/practitioner.service.ts:134 |
| createAccount | ConflictException | { code: 'username_exists', message: 'That username is already in use.', } | apps/api/src/modules/practitioner/practitioner.service.ts:144 |
| createAccount | BadRequestException | 'Doctor role is not configured.' | apps/api/src/modules/practitioner/practitioner.service.ts:150 |
| createAccount | ConflictException | { code: 'practitioner_account_changed', message: 'This practitioner changed. Reload before creating a login account.', } | apps/api/src/modules/practitioner/practitioner.service.ts:174 |
| grantDoctorRole | NotFoundException | 'Practitioner not found' | apps/api/src/modules/practitioner/practitioner.service.ts:189 |
| grantDoctorRole | BadRequestException | { code: 'inactive_practitioner', message: 'Reactivate this practitioner before granting Doctor access.', } | apps/api/src/modules/practitioner/practitioner.service.ts:191 |
| grantDoctorRole | BadRequestException | { code: 'practitioner_account_missing', message: 'Create a login account for this practitioner first.', } | apps/api/src/modules/practitioner/practitioner.service.ts:197 |
| grantDoctorRole | BadRequestException | 'Doctor role is not configured.' | apps/api/src/modules/practitioner/practitioner.service.ts:203 |
| assertSpecialityExists | BadRequestException | 'Unknown speciality' | apps/api/src/modules/practitioner/practitioner.service.ts:260 |
| assertUserLinkable | BadRequestException | 'Unknown user' | apps/api/src/modules/practitioner/practitioner.service.ts:282 |
| assertUserLinkable | ConflictException | 'That user is already linked to a practitioner' | apps/api/src/modules/practitioner/practitioner.service.ts:290 |
| assertDepartmentsInFacility | BadRequestException | 'One or more departments do not exist in this facility' | apps/api/src/modules/practitioner/practitioner.service.ts:307 |
| assertPractitionerInFacility | NotFoundException | 'Practitioner not found' | apps/api/src/modules/practitioner/practitioner.service.ts:317 |
| save | BadRequestException | { message: 'Invalid prescription', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/prescription/prescription.controller.ts:78 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/prescription/prescription.controller.ts:91 |
| save | BadRequestException | { message: 'This visit is closed. A prescription can only be written during the visit.', code: 'visit_closed', } | apps/api/src/modules/prescription/prescription.service.ts:121 |
| save | ConflictException | { code: 'prescription_changed', message: 'This prescription changed. Reload before saving.', } | apps/api/src/modules/prescription/prescription.service.ts:143 |
| save | ConflictException | { code: 'prescription_locked', message: 'A billed or dispensed prescription cannot be rewritten.', } | apps/api/src/modules/prescription/prescription.service.ts:156 |
| save | NotFoundException | 'Prescription item not found or repeated' | apps/api/src/modules/prescription/prescription.service.ts:167 |
| save | BadRequestException | { message: 'Unknown drug', code: 'unknown_drug' } | apps/api/src/modules/prescription/prescription.service.ts:194 |
| save | BadRequestException | { message: `${drug.genericName} is no longer in the formulary.`, code: 'inactive_drug', } | apps/api/src/modules/prescription/prescription.service.ts:199 |
| save | ConflictException | { code: 'allergy_conflict', message: 'This patient is recorded as allergic to a drug on this prescription.', // Listed explicitly rather than by spreading minus a key: `overridden` is internal // bookkeeping and must not leak into a response the browser parses. conflicts: unresolved.map((conflict) => ({ drugId: conflict.drugId, drugName: conflict.drugName, allergyId: conflict.allergyId, substance: conflict.substance, severity: conflict.severity, reaction: conflict.reaction, matchedOn: conflict.matchedOn, })), } | apps/api/src/modules/prescription/prescription.service.ts:213 |
| save | ConflictException | { code: 'interaction_warning', message: 'These drugs interact. Say why the combination is intended.', interactions: serious, } | apps/api/src/modules/prescription/prescription.service.ts:241 |
| save | BadRequestException | { message: 'Your account is not linked to a practitioner, so it cannot sign a prescription.', code: 'no_practitioner', } | apps/api/src/modules/prescription/prescription.service.ts:253 |
| save | NotFoundException | 'Prescription item not found' | apps/api/src/modules/prescription/prescription.service.ts:322 |
| resolveFollowUpDate | BadRequestException | { message: 'A follow-up cannot be before the visit it was decided in.', code: 'follow_up_in_past', } | apps/api/src/modules/prescription/prescription.service.ts:585 |
| resolveFollowUpDate | BadRequestException | { message: `A follow-up cannot be more than ${FOLLOW_UP_MAX_MONTHS} months ahead.`, code: 'follow_up_too_far', } | apps/api/src/modules/prescription/prescription.service.ts:595 |
| requireVisit | NotFoundException | 'Visit not found' | apps/api/src/modules/prescription/prescription.service.ts:617 |
| parse | BadRequestException | { message: 'Invalid reception request', errors: parsed.error.flatten().fieldErrors } | apps/api/src/modules/reception/reception-operations.controller.ts:225 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/reception/reception-operations.controller.ts:230 |
| createBed | BadRequestException | 'Reserve or occupy a bed through an approved care request.' | apps/api/src/modules/reception/reception-operations.service.ts:259 |
| createBed | BadRequestException | 'Choose an active room in that department.' | apps/api/src/modules/reception/reception-operations.service.ts:265 |
| updateBed | NotFoundException | 'Bed not found.' | apps/api/src/modules/reception/reception-operations.service.ts:292 |
| updateBed | BadRequestException | 'Reserve or occupy a bed through an approved care request.' | apps/api/src/modules/reception/reception-operations.service.ts:298 |
| createCareRequest | NotFoundException | 'Patient not found.' | apps/api/src/modules/reception/reception-operations.service.ts:327 |
| createCareRequest | BadRequestException | 'A patient cannot be merged with the same record.' | apps/api/src/modules/reception/reception-operations.service.ts:330 |
| createCareRequest | NotFoundException | 'Possible duplicate patient not found.' | apps/api/src/modules/reception/reception-operations.service.ts:332 |
| createCareRequest | BadRequestException | 'The visit does not belong to this patient.' | apps/api/src/modules/reception/reception-operations.service.ts:338 |
| createCareRequest | BadRequestException | 'The appointment does not belong to this patient.' | apps/api/src/modules/reception/reception-operations.service.ts:345 |
| createCareRequest | ConflictException | `An open ${input.kind.replace('_', ' ')} request already exists.` | apps/api/src/modules/reception/reception-operations.service.ts:360 |
| reviewCareRequest | NotFoundException | 'Reception request not found.' | apps/api/src/modules/reception/reception-operations.service.ts:398 |
| reviewCareRequest | ConflictException | 'A different authorised user must review this request.' | apps/api/src/modules/reception/reception-operations.service.ts:400 |
| reviewCareRequest | ConflictException | `A ${current.status} request cannot become ${input.status}.` | apps/api/src/modules/reception/reception-operations.service.ts:408 |
| reviewCareRequest | BadRequestException | 'A rejection needs a reason.' | apps/api/src/modules/reception/reception-operations.service.ts:410 |
| reviewCareRequest | ConflictException | 'The requested bed is no longer available.' | apps/api/src/modules/reception/reception-operations.service.ts:418 |
| createWaitlist | ConflictException | 'This patient is already waiting for that department.' | apps/api/src/modules/reception/reception-operations.service.ts:490 |
| updateWaitlist | NotFoundException | 'Waitlist entry not found.' | apps/api/src/modules/reception/reception-operations.service.ts:515 |
| updateWaitlist | ConflictException | 'This waitlist entry is already closed.' | apps/api/src/modules/reception/reception-operations.service.ts:517 |
| updateWaitlist | BadRequestException | 'Choose the booked appointment.' | apps/api/src/modules/reception/reception-operations.service.ts:519 |
| updateWaitlist | BadRequestException | 'The appointment does not match this waitlist entry.' | apps/api/src/modules/reception/reception-operations.service.ts:528 |
| addDocument | BadRequestException | 'The document data is not valid base64.' | apps/api/src/modules/reception/reception-operations.service.ts:615 |
| addDocument | BadRequestException | 'The document data is not valid base64.' | apps/api/src/modules/reception/reception-operations.service.ts:619 |
| addDocument | BadRequestException | 'Documents must be between 1 byte and 2 MB.' | apps/api/src/modules/reception/reception-operations.service.ts:622 |
| addDocument | BadRequestException | 'The file content does not match its declared type.' | apps/api/src/modules/reception/reception-operations.service.ts:627 |
| document | NotFoundException | 'Document not found.' | apps/api/src/modules/reception/reception-operations.service.ts:650 |
| addContact | BadRequestException | 'A contact method needs a phone number.' | apps/api/src/modules/reception/reception-operations.service.ts:667 |
| archiveContact | NotFoundException | 'Contact not found.' | apps/api/src/modules/reception/reception-operations.service.ts:705 |
| addCoverage | BadRequestException | 'Choose an active panel.' | apps/api/src/modules/reception/reception-operations.service.ts:723 |
| closeDeposit | NotFoundException | 'Patient deposit not found.' | apps/api/src/modules/reception/reception-operations.service.ts:768 |
| closeDeposit | ConflictException | 'This deposit is already closed.' | apps/api/src/modules/reception/reception-operations.service.ts:769 |
| closeDeposit | BadRequestException | 'Choose an invoice for the same patient.' | apps/api/src/modules/reception/reception-operations.service.ts:774 |
| createReminder | BadRequestException | 'Choose a contact with recorded communication permission.' | apps/api/src/modules/reception/reception-operations.service.ts:794 |
| createReminder | BadRequestException | 'That contact has not permitted this channel.' | apps/api/src/modules/reception/reception-operations.service.ts:803 |
| createReminder | BadRequestException | 'Appointment does not match the patient.' | apps/api/src/modules/reception/reception-operations.service.ts:808 |
| updateReminder | NotFoundException | 'Reminder not found.' | apps/api/src/modules/reception/reception-operations.service.ts:835 |
| updateReminder | ConflictException | 'Reminder is already final.' | apps/api/src/modules/reception/reception-operations.service.ts:836 |
| updateReminder | BadRequestException | 'Record why delivery failed.' | apps/api/src/modules/reception/reception-operations.service.ts:838 |
| createHandover | BadRequestException | 'Choose an active staff member.' | apps/api/src/modules/reception/reception-operations.service.ts:857 |
| updateHandover | NotFoundException | 'Handover not found.' | apps/api/src/modules/reception/reception-operations.service.ts:874 |
| updateHandover | ConflictException | 'Only an open handover can be acknowledged.' | apps/api/src/modules/reception/reception-operations.service.ts:876 |
| updateHandover | ConflictException | 'A handover must be acknowledged before it closes.' | apps/api/src/modules/reception/reception-operations.service.ts:878 |
| updateHandover | ConflictException | 'The receiving staff member must acknowledge the handover.' | apps/api/src/modules/reception/reception-operations.service.ts:880 |
| closeTill | BadRequestException | 'Choose a completed reception shift of at most 24 hours.' | apps/api/src/modules/reception/reception-operations.service.ts:897 |
| closeTill | BadRequestException | 'Explain the cash difference before closing.' | apps/api/src/modules/reception/reception-operations.service.ts:925 |
| approveTill | NotFoundException | 'Reception till close not found.' | apps/api/src/modules/reception/reception-operations.service.ts:957 |
| approveTill | ConflictException | 'A different supervisor must approve this till close.' | apps/api/src/modules/reception/reception-operations.service.ts:959 |
| approveTill | ConflictException | 'This till close is already approved.' | apps/api/src/modules/reception/reception-operations.service.ts:960 |
| audit | BadRequestException | 'Unknown reception entity.' | apps/api/src/modules/reception/reception-operations.service.ts:985 |
| requirePatient | NotFoundException | 'Patient not found.' | apps/api/src/modules/reception/reception-operations.service.ts:1109 |
| requireDepartment | BadRequestException | type === 'ipd' ? 'Choose an active IPD department.' : 'Choose an active department.' | apps/api/src/modules/reception/reception-operations.service.ts:1124 |
| requireBeds | BadRequestException | 'Source bed not found.' | apps/api/src/modules/reception/reception-operations.service.ts:1139 |
| requireBeds | BadRequestException | 'Choose an available destination bed.' | apps/api/src/modules/reception/reception-operations.service.ts:1151 |
| requireBeds | BadRequestException | 'Source and destination beds must be different.' | apps/api/src/modules/reception/reception-operations.service.ts:1154 |
| checkIn | BadRequestException | { message: 'Invalid check-in', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/reception/reception.controller.ts:48 |
| require | ForbiddenException | `Missing permission: ${permission}` | apps/api/src/modules/reception/reception.controller.ts:66 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/reception/reception.controller.ts:73 |
| checkIn | BadRequestException | 'A discount needs a reason.' | apps/api/src/modules/reception/reception.service.ts:67 |
| checkIn | BadRequestException | 'The discount is more than the bill.' | apps/api/src/modules/reception/reception.service.ts:139 |
| loadServices | BadRequestException | 'A service is listed twice. Use the quantity instead.' | apps/api/src/modules/reception/reception.service.ts:297 |
| loadServices | BadRequestException | 'One of those services is unknown or no longer offered.' | apps/api/src/modules/reception/reception.service.ts:306 |
| assertMayDiscount | ForbiddenException | 'Missing permission: discount.apply' | apps/api/src/modules/reception/reception.service.ts:319 |
| assertWithinCeiling | ForbiddenException | `A discount over ${maxPercent}% needs approval (maximum ${money(ceiling)}).` | apps/api/src/modules/reception/reception.service.ts:339 |
| create | BadRequestException | { message: 'Invalid reference range', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/reference-range/reference-range.controller.ts:54 |
| update | BadRequestException | { message: 'Invalid reference range', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/reference-range/reference-range.controller.ts:72 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/reference-range/reference-range.controller.ts:93 |
| assertTestInFacility | NotFoundException | 'Lab test not found' | apps/api/src/modules/reference-range/reference-range.service.ts:122 |
| assertRangeOnTest | NotFoundException | 'Reference range not found' | apps/api/src/modules/reference-range/reference-range.service.ts:137 |
| auditLog | BadRequestException | { message: 'Invalid audit log query', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/reports/reports.controller.ts:108 |
| errorLog | BadRequestException | { message: 'Invalid error log query', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/reports/reports.controller.ts:126 |
| patientExport | BadRequestException | { message: 'A reason is required to export the patient list.', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/reports/reports.controller.ts:142 |
| parseRange | BadRequestException | { message: 'Invalid report range', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/reports/reports.controller.ts:154 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/reports/reports.controller.ts:165 |
| create | BadRequestException | { message: 'Invalid room', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/room/room.controller.ts:44 |
| setActive | BadRequestException | { message: 'Invalid request', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/room/room.controller.ts:61 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/room/room.controller.ts:72 |
| create | NotFoundException | 'Department not found' | apps/api/src/modules/room/room.service.ts:70 |
| create | ConflictException | `Room code '${input.code}' already exists` | apps/api/src/modules/room/room.service.ts:80 |
| setActive | NotFoundException | 'Room not found' | apps/api/src/modules/room/room.service.ts:101 |
| create | BadRequestException | { message: 'Invalid service', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/service/service.controller.ts:49 |
| update | BadRequestException | { message: 'Invalid service', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/service/service.controller.ts:66 |
| setActive | BadRequestException | { message: 'Invalid request', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/service/service.controller.ts:83 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/service/service.controller.ts:94 |
| create | NotFoundException | 'Department not found' | apps/api/src/modules/service/service.service.ts:62 |
| create | ConflictException | `Service code '${input.code}' already exists` | apps/api/src/modules/service/service.service.ts:69 |
| assertServiceInFacility | NotFoundException | 'Service not found' | apps/api/src/modules/service/service.service.ts:120 |
| setDiscountCeiling | BadRequestException | { message: 'Invalid discount ceiling', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/settings/settings.controller.ts:43 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/settings/settings.controller.ts:58 |
| create | BadRequestException | { message: 'Invalid speciality', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/speciality/speciality.controller.ts:46 |
| assertAuth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/speciality/speciality.controller.ts:56 |
| create | ConflictException | `Speciality code '${input.code}' already exists` | apps/api/src/modules/speciality/speciality.service.ts:35 |
| parse | BadRequestException | { code: 'invalid_hr_input', message: 'Check the HR form fields.', errors: r.error.flatten().fieldErrors, } | apps/api/src/modules/staff/staff-operations.controller.ts:35 |
| auth | UnauthorizedException |  | apps/api/src/modules/staff/staff-operations.controller.ts:43 |
| updateLeaveType | NotFoundException | 'Leave type not found' | apps/api/src/modules/staff/staff-operations.service.ts:70 |
| leaveDays | BadRequestException | 'Leave end date must be on or after the start date.' | apps/api/src/modules/staff/staff-operations.service.ts:146 |
| leaveDays | BadRequestException | { code: 'hr_calendar_not_configured', message: 'Configure weekly rest days before entering leave.', } | apps/api/src/modules/staff/staff-operations.service.ts:149 |
| createLeaveRequest | BadRequestException | 'Employee is required.' | apps/api/src/modules/staff/staff-operations.service.ts:206 |
| createLeaveRequest | BadRequestException | 'You may submit leave only for your own employee record.' | apps/api/src/modules/staff/staff-operations.service.ts:212 |
| createLeaveRequest | BadRequestException | 'Employee or leave type is invalid.' | apps/api/src/modules/staff/staff-operations.service.ts:231 |
| createLeaveRequest | ConflictException | 'This employee already has overlapping leave.' | apps/api/src/modules/staff/staff-operations.service.ts:241 |
| createLeaveRequest | BadRequestException | 'This leave type requires an attachment.' | apps/api/src/modules/staff/staff-operations.service.ts:243 |
| createLeaveRequest | BadRequestException | 'Leave is outside the permitted backdating window.' | apps/api/src/modules/staff/staff-operations.service.ts:249 |
| createLeaveRequest | BadRequestException | 'The selected range contains no working days.' | apps/api/src/modules/staff/staff-operations.service.ts:251 |
| createLeaveRequest | BadRequestException | { code: 'insufficient_leave_balance', message: `Only ${balance.remaining} day(s) remain for this leave type.`, } | apps/api/src/modules/staff/staff-operations.service.ts:255 |
| decideLeave | NotFoundException | 'Submitted leave request not found.' | apps/api/src/modules/staff/staff-operations.service.ts:324 |
| cancelLeave | NotFoundException | 'Active leave request not found.' | apps/api/src/modules/staff/staff-operations.service.ts:385 |
| cancelLeave | BadRequestException | 'You cannot cancel this leave request.' | apps/api/src/modules/staff/staff-operations.service.ts:387 |
| markAttendance | BadRequestException | 'Attendance contains an invalid employee.' | apps/api/src/modules/staff/staff-operations.service.ts:465 |
| markAttendance | ConflictException | 'Approved leave attendance cannot be overwritten.' | apps/api/src/modules/staff/staff-operations.service.ts:485 |
| updateShiftType | NotFoundException | 'Shift type not found' | apps/api/src/modules/staff/staff-operations.service.ts:579 |
| createRoster | BadRequestException | 'Employee, department or shift is invalid.' | apps/api/src/modules/staff/staff-operations.service.ts:652 |
| createRoster | ConflictException | 'Employee is on approved leave on this date.' | apps/api/src/modules/staff/staff-operations.service.ts:662 |
| cancelRoster | NotFoundException | 'Roster entry not found' | apps/api/src/modules/staff/staff-operations.service.ts:770 |
| parse | BadRequestException | { code: 'invalid_hr_input', message: 'Check the HR form fields.', errors: result.error.flatten().fieldErrors, } | apps/api/src/modules/staff/staff.controller.ts:43 |
| auth | UnauthorizedException |  | apps/api/src/modules/staff/staff.controller.ts:51 |
| scopedEmployee | NotFoundException | 'Employee not found' | apps/api/src/modules/staff/staff.service.ts:121 |
| validateReferences | BadRequestException | 'Department is not active in this facility.' | apps/api/src/modules/staff/staff.service.ts:142 |
| validateReferences | BadRequestException | 'Position is not active in this facility.' | apps/api/src/modules/staff/staff.service.ts:143 |
| validateReferences | BadRequestException | 'Reporting manager is not an active employee in this facility.' | apps/api/src/modules/staff/staff.service.ts:145 |
| updatePosition | NotFoundException | 'Position not found' | apps/api/src/modules/staff/staff.service.ts:200 |
| me | NotFoundException | { code: 'employee_profile_missing', message: 'Your account is not linked to an employee record.', } | apps/api/src/modules/staff/staff.service.ts:265 |
| create | ForbiddenException |  | apps/api/src/modules/staff/staff.service.ts:285 |
| update | BadRequestException | 'An employee cannot report to themself.' | apps/api/src/modules/staff/staff.service.ts:317 |
| update | ForbiddenException |  | apps/api/src/modules/staff/staff.service.ts:319 |
| exit | NotFoundException | 'Employee not found' | apps/api/src/modules/staff/staff.service.ts:347 |
| exit | ConflictException | 'Employee has already exited.' | apps/api/src/modules/staff/staff.service.ts:348 |
| addDocument | BadRequestException | 'A file up to 10 MB is required.' | apps/api/src/modules/staff/staff.service.ts:377 |
| addDocument | BadRequestException | 'Only PDF, JPEG and PNG documents are allowed.' | apps/api/src/modules/staff/staff.service.ts:380 |
| document | NotFoundException | 'Document not found' | apps/api/src/modules/staff/staff.service.ts:405 |
| updateCredential | NotFoundException | 'Credential not found' | apps/api/src/modules/staff/staff.service.ts:457 |
| removeCredential | NotFoundException | 'Credential not found' | apps/api/src/modules/staff/staff.service.ts:478 |
| createAccount | ConflictException | 'Employee already has a user account.' | apps/api/src/modules/staff/staff.service.ts:572 |
| createAccount | BadRequestException | 'An exited or suspended employee cannot receive a login.' | apps/api/src/modules/staff/staff.service.ts:574 |
| createAccount | BadRequestException | 'One or more roles are invalid.' | apps/api/src/modules/staff/staff.service.ts:578 |
| createAccount | BadRequestException | { code: 'clinical_position_required', message: 'A doctor account can only be assigned to an employee in a clinical position.', } | apps/api/src/modules/staff/staff.service.ts:581 |
| createAccount | ConflictException | 'That username is already in use.' | apps/api/src/modules/staff/staff.service.ts:592 |
| createAccount | ConflictException | 'This employee number already belongs to a linked practitioner.' | apps/api/src/modules/staff/staff.service.ts:606 |
| createAccount | ConflictException | 'Employee changed. Reload before creating an account.' | apps/api/src/modules/staff/staff.service.ts:623 |
| createAccount | ConflictException | 'Practitioner already has an account or was removed.' | apps/api/src/modules/staff/staff.service.ts:635 |
| setAccountActive | NotFoundException | 'Employee has no user account.' | apps/api/src/modules/staff/staff.service.ts:712 |
| setAccountActive | BadRequestException | 'You cannot deactivate your own account.' | apps/api/src/modules/staff/staff.service.ts:714 |
| setAccountActive | BadRequestException | 'An exited or suspended employee cannot have an active login.' | apps/api/src/modules/staff/staff.service.ts:716 |
| resetPassword | NotFoundException | 'Employee has no user account.' | apps/api/src/modules/staff/staff.service.ts:731 |
| list | BadRequestException | { message: 'Invalid template filter', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/template/template.controller.ts:38 |
| create | BadRequestException | { message: 'Invalid template', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/template/template.controller.ts:59 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/template/template.controller.ts:92 |
| create | ForbiddenException | { message: 'Only an administrator can add to the hospital’s shared templates.', code: 'shared_template_denied', } | apps/api/src/modules/template/template.service.ts:106 |
| create | BadRequestException | { message: 'Your account is not linked to a practitioner, so it has no own templates.', code: 'no_practitioner', } | apps/api/src/modules/template/template.service.ts:116 |
| remove | NotFoundException | 'Template not found' | apps/api/src/modules/template/template.service.ts:163 |
| remove | ForbiddenException | { message: 'Only an administrator can remove a shared template.', code: 'shared_template_denied', } | apps/api/src/modules/template/template.service.ts:167 |
| remove | NotFoundException | 'Template not found' | apps/api/src/modules/template/template.service.ts:174 |
| requireDispensableDrugs | BadRequestException | { message: 'Unknown drug', code: 'unknown_drug' } | apps/api/src/modules/template/template.service.ts:202 |
| requireDispensableDrugs | BadRequestException | { message: `${drug.genericName} is no longer in the formulary.`, code: 'inactive_drug', } | apps/api/src/modules/template/template.service.ts:205 |
| toTemplate | BadRequestException | `Templates of type '${row.type}' are not supported yet.` | apps/api/src/modules/template/template.service.ts:244 |
| mine | BadRequestException | { message: 'Invalid till query', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/till/till.controller.ts:35 |
| all | BadRequestException | { message: 'Invalid till query', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/till/till.controller.ts:50 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/till/till.controller.ts:61 |
| create | BadRequestException | { message: 'Invalid user', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/users/users.controller.ts:52 |
| setActive | BadRequestException | { message: 'Invalid request', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/users/users.controller.ts:69 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/users/users.controller.ts:87 |
| resetPassword | BadRequestException | 'Invalid temporary password: use 10–256 characters and avoid demo passwords.' | apps/api/src/modules/users/users.controller.ts:102 |
| create | BadRequestException | { code: 'employee_account_required', message: 'Create clinical user accounts from the employee record so identity and employment stay linked.', } | apps/api/src/modules/users/users.service.ts:77 |
| create | BadRequestException | `Unknown role(s): ${missing.join(', ')}` | apps/api/src/modules/users/users.service.ts:91 |
| create | ConflictException | `Username '${input.username}' already exists` | apps/api/src/modules/users/users.service.ts:101 |
| setActive | BadRequestException | 'You cannot deactivate your own account.' | apps/api/src/modules/users/users.service.ts:145 |
| setActive | NotFoundException | 'User not found' | apps/api/src/modules/users/users.service.ts:154 |
| setActive | BadRequestException | 'An exited or suspended employee cannot have an active login.' | apps/api/src/modules/users/users.service.ts:167 |
| create | BadRequestException | { message: 'Invalid visit', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/visit/visit.controller.ts:55 |
| queue | BadRequestException | { message: 'Invalid queue filter', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/visit/visit.controller.ts:92 |
| changeStatus | BadRequestException | { message: 'Invalid status change', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/visit/visit.controller.ts:126 |
| updateComplaint | BadRequestException | { message: 'Invalid complaint', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/visit/visit.controller.ts:153 |
| cancel | BadRequestException | { message: 'Invalid cancellation', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/visit/visit.controller.ts:184 |
| reassignPractitioner | BadRequestException | { message: 'Invalid reassignment', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/visit/visit.controller.ts:212 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/visit/visit.controller.ts:261 |
| create | NotFoundException | 'Patient not found' | apps/api/src/modules/visit/visit.service.ts:141 |
| create | BadRequestException | 'Unknown department' | apps/api/src/modules/visit/visit.service.ts:147 |
| create | BadRequestException | 'Department is not active' | apps/api/src/modules/visit/visit.service.ts:150 |
| create | BadRequestException | 'Unknown practitioner' | apps/api/src/modules/visit/visit.service.ts:163 |
| create | BadRequestException | 'Practitioner is not active' | apps/api/src/modules/visit/visit.service.ts:164 |
| create | BadRequestException | 'Practitioner does not work in that department' | apps/api/src/modules/visit/visit.service.ts:170 |
| create | ConflictException | { code: 'open_visit', message: 'This patient already has an open visit in that department', visits: open, } | apps/api/src/modules/visit/visit.service.ts:180 |
| findById | NotFoundException | 'Visit not found' | apps/api/src/modules/visit/visit.service.ts:222 |
| consult | ForbiddenException | { message: 'Your role may not open a consultation record.', code: 'clinical_read_scoped', } | apps/api/src/modules/visit/visit.service.ts:253 |
| consult | NotFoundException | 'Visit not found' | apps/api/src/modules/visit/visit.service.ts:275 |
| updateComplaint | NotFoundException | 'Visit not found' | apps/api/src/modules/visit/visit.service.ts:348 |
| updateComplaint | BadRequestException | { message: 'This visit is closed. The complaint can only be written during the visit.', code: 'visit_closed', } | apps/api/src/modules/visit/visit.service.ts:354 |
| changeStatus | NotFoundException | 'Visit not found' | apps/api/src/modules/visit/visit.service.ts:400 |
| changeStatus | BadRequestException | { message: `A ${current.status} visit cannot become ${input.status}.`, code: 'illegal_transition', from: current.status, allowed: allowedStatusChanges(current.status), } | apps/api/src/modules/visit/visit.service.ts:411 |
| changeStatus | ConflictException | { message: 'Someone else moved this visit first.', code: 'status_changed', } | apps/api/src/modules/visit/visit.service.ts:447 |
| cancel | NotFoundException | 'Visit not found' | apps/api/src/modules/visit/visit.service.ts:519 |
| cancel | BadRequestException | 'That visit is already cancelled.' | apps/api/src/modules/visit/visit.service.ts:522 |
| cancel | BadRequestException | { message: `A ${visit.status} visit cannot be cancelled.`, code: 'illegal_transition', from: visit.status, } | apps/api/src/modules/visit/visit.service.ts:525 |
| cancel | ForbiddenException | { message: 'Only today’s visits can be cancelled here. Ask an administrator.', code: 'outside_r5_window', } | apps/api/src/modules/visit/visit.service.ts:540 |
| cancel | ForbiddenException | { message: 'The doctor has already started this visit. Ask an administrator.', code: 'next_step_occurred', } | apps/api/src/modules/visit/visit.service.ts:546 |
| cancel | ForbiddenException | 'Missing permission: payment.refund' | apps/api/src/modules/visit/visit.service.ts:577 |
| cancel | ForbiddenException | 'Only today’s payments can be refunded here.' | apps/api/src/modules/visit/visit.service.ts:606 |
| reassignPractitioner | NotFoundException | 'Visit not found' | apps/api/src/modules/visit/visit.service.ts:672 |
| reassignPractitioner | BadRequestException | { message: `A ${visit.status} visit cannot be reassigned.`, code: 'illegal_transition', from: visit.status, } | apps/api/src/modules/visit/visit.service.ts:675 |
| reassignPractitioner | ForbiddenException | { message: 'Only today’s visits can be reassigned here. Ask an administrator.', code: 'outside_r5_window', } | apps/api/src/modules/visit/visit.service.ts:691 |
| reassignPractitioner | ForbiddenException | { message: 'The doctor has already started this visit. Ask an administrator.', code: 'next_step_occurred', } | apps/api/src/modules/visit/visit.service.ts:697 |
| reassignPractitioner | BadRequestException | 'Unknown practitioner' | apps/api/src/modules/visit/visit.service.ts:716 |
| reassignPractitioner | BadRequestException | 'Practitioner is not active' | apps/api/src/modules/visit/visit.service.ts:717 |
| reassignPractitioner | BadRequestException | 'Practitioner does not work in that department' | apps/api/src/modules/visit/visit.service.ts:719 |
| history | NotFoundException | 'Visit not found' | apps/api/src/modules/visit/visit.service.ts:765 |
| record | BadRequestException | { message: 'Invalid vitals', errors: parsed.error.flatten().fieldErrors, } | apps/api/src/modules/vitals/vitals.controller.ts:51 |
| auth | UnauthorizedException | 'Invalid or expired token' | apps/api/src/modules/vitals/vitals.controller.ts:79 |
| record | NotFoundException | 'Visit not found' | apps/api/src/modules/vitals/vitals.service.ts:63 |
| record | BadRequestException | { message: 'This visit is closed. Vitals can only be recorded during the visit.', code: 'visit_closed', } | apps/api/src/modules/vitals/vitals.service.ts:69 |
| list | NotFoundException | 'Visit not found' | apps/api/src/modules/vitals/vitals.service.ts:107 |
| transaction | ConflictException | { code: 'concurrent_change', message: 'This record changed at another workstation. Reload before retrying.', } | apps/api/src/prisma/transactional-audit.ts:231 |
| mutate | ConflictException | 'Cross-facility reference refused' | apps/api/src/prisma/transactional-audit.ts:376 |
| mutate | ConflictException | 'Cross-facility mutation refused' | apps/api/src/prisma/transactional-audit.ts:381 |
| next | BadRequestException | `Unknown number sequence key: ${key}` | apps/api/src/services/number-sequence.service.ts:77 |
