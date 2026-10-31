# Frontend API call inventory

Literal/template call expressions from all frontend files; dynamic path-to-controller matching requires semantic review.

| Owner | Call | Source |
| --- | --- | --- |
| AuthProvider | apiGet('/auth/me', meResponseSchema) | apps/web/src/auth/AuthProvider.tsx:53 |
| AuthProvider | apiPost('/auth/login', { username, password }, loginResponseSchema) | apps/web/src/auth/AuthProvider.tsx:91 |
| AuthProvider | apiPost('/auth/logout', { refreshToken }, logoutResponseSchema) | apps/web/src/auth/AuthProvider.tsx:112 |
| CrmAppointments | apiGet('/crm/appointments/options', crmAppointmentOptionsSchema) | apps/web/src/components/CrmAppointments.tsx:44 |
| CrmAppointments | apiGet( `/crm/appointments?${new URLSearchParams({ linkId, date })}`, crmAppointmentListSchema, ) | apps/web/src/components/CrmAppointments.tsx:59 |
| CrmAppointments | apiGet( `/crm/appointments/availability?${new URLSearchParams({ practitionerId, date })}`, crmAvailabilitySchema, ) | apps/web/src/components/CrmAppointments.tsx:70 |
| CrmAppointments | apiPost('/crm/appointments', input, crmAppointmentSchema) | apps/web/src/components/CrmAppointments.tsx:84 |
| CrmAppointments | apiPost( `/crm/appointments/${id}/cancel`, { linkId, idempotencyKey: key }, crmAppointmentSchema, ) | apps/web/src/components/CrmAppointments.tsx:92 |
| CrmCalls | apiGet( `/crm/calls?${new URLSearchParams({ page: String(page), q: search, state, direction, pending })}`, crmCallListSchema, ) | apps/web/src/components/CrmCalls.tsx:101 |
| CallForm | apiGet( `/crm/contacts?q=${encodeURIComponent(searchTerm)}`, crmContactListSchema, ) | apps/web/src/components/CrmCalls.tsx:349 |
| CallForm | apiGet( `/crm/leads?q=${encodeURIComponent(searchTerm)}`, crmLeadListSchema, ) | apps/web/src/components/CrmCalls.tsx:359 |
| CallForm | apiGet(`/crm/contacts/${contactId}`, crmContactDetailSchema) | apps/web/src/components/CrmCalls.tsx:368 |
| CallForm | apiPost('/crm/calls', input, crmCallDetailSchema) | apps/web/src/components/CrmCalls.tsx:386 |
| CallDetail | apiGet(`/crm/calls/${id}`, crmCallDetailSchema) | apps/web/src/components/CrmCalls.tsx:722 |
| CallDetail | apiPost( `/crm/calls/${id}/complete`, completeCrmCallSchema.parse({ expectedVersion: version, completionNote: note, }), crmCallDetailSchema, ) | apps/web/src/components/CrmCalls.tsx:733 |
| CallDetail | apiPut( `/crm/timeline/${c.id}`, correctCrmInteractionSchema.parse({ expectedVersion: c.version, summary, outcome: c.outcome, reason, voided: withdraw, }), crmInteractionDetailSchema, ) | apps/web/src/components/CrmCalls.tsx:746 |
| CrmContacts | apiGet( `/crm/contacts?q=${encodeURIComponent(search)}&page=${page}&archived=${archived}`, crmContactListSchema, ) | apps/web/src/components/CrmContacts.tsx:79 |
| ContactForm | apiPut( `/crm/contacts/${contact.id}`, { ...data, duplicateReviewed: reviewed, expectedVersion: contact.version, }, crmContactDetailSchema, ) | apps/web/src/components/CrmContacts.tsx:242 |
| ContactForm | apiPost( '/crm/contacts', { ...data, duplicateReviewed: reviewed }, crmContactDetailSchema, ) | apps/web/src/components/CrmContacts.tsx:251 |
| ContactDetail | apiGet(`/crm/contacts/${id}`, crmContactDetailSchema) | apps/web/src/components/CrmContacts.tsx:399 |
| CrmLeads | apiGet('/crm/leads/options', crmLeadOptionsSchema) | apps/web/src/components/CrmLeads.tsx:78 |
| CrmLeads | apiGet( `/crm/leads?q=${encodeURIComponent(search)}&page=${page}&status=${status}&source=${source}&owner=${owner}`, crmLeadListSchema, ) | apps/web/src/components/CrmLeads.tsx:84 |
| LeadDetail | apiGet(`/crm/leads/${id}`, crmLeadDetailSchema) | apps/web/src/components/CrmLeads.tsx:300 |
| LeadDetail | apiPost( `/crm/leads/${id}/claim`, { expectedVersion: version }, crmLeadDetailSchema, ) | apps/web/src/components/CrmLeads.tsx:305 |
| LeadForm | apiGet( `/crm/contacts?q=${encodeURIComponent(search)}`, crmContactListSchema, ) | apps/web/src/components/CrmLeads.tsx:491 |
| LeadForm | apiPut(`/crm/leads/${lead.id}`, input, crmLeadDetailSchema) | apps/web/src/components/CrmLeads.tsx:501 |
| LeadForm | apiPost('/crm/leads', input, crmLeadDetailSchema) | apps/web/src/components/CrmLeads.tsx:502 |
| CrmPatientLink | apiGet(`/crm/leads/${leadId}/patient`, crmPatientMappingSchema) | apps/web/src/components/CrmPatientLink.tsx:37 |
| CrmPatientLink | apiPost( `/crm/leads/${leadId}/patient/${operation}`, body, crmPatientMappingSchema, ) | apps/web/src/components/CrmPatientLink.tsx:43 |
| CrmTasks | apiGet( `/crm/tasks?${new URLSearchParams({ page: String(page), owner, status, queue, priority, q: search })}`, crmTaskListSchema, ) | apps/web/src/components/CrmTasks.tsx:90 |
| CrmTasks | apiGet('/crm/tasks?owner=mine&queue=reminders', crmTaskListSchema) | apps/web/src/components/CrmTasks.tsx:100 |
| TaskForm | apiGet(`/crm/timeline/${sourceId}`, crmInteractionDetailSchema) | apps/web/src/components/CrmTasks.tsx:351 |
| TaskForm | apiGet('/crm/tasks/options', crmTaskOptionsSchema) | apps/web/src/components/CrmTasks.tsx:357 |
| TaskForm | apiGet(`/crm/tasks/follow-ups/${sourceId}`, crmTaskFollowUpsSchema) | apps/web/src/components/CrmTasks.tsx:363 |
| TaskForm | apiPut( `/crm/tasks/${existing.id}`, updateCrmTaskSchema.parse({ ...fields, expectedVersion: existing.version, status, outcome: ['completed', 'cancelled'].includes(status) ? outcome : '', reason, }), crmTaskDetailSchema, ) | apps/web/src/components/CrmTasks.tsx:381 |
| TaskForm | apiPost( '/crm/tasks', createCrmTaskSchema.parse({ ...fields, interactionId: sourceId, prescriptionId: prescription &#124;&#124; null, idempotencyKey: key, }), crmTaskDetailSchema, ) | apps/web/src/components/CrmTasks.tsx:394 |
| TaskDetail | apiGet(`/crm/tasks/${id}`, crmTaskDetailSchema) | apps/web/src/components/CrmTasks.tsx:616 |
| TaskDetail | apiPost( `/crm/tasks/${id}/${action}`, action === 'escalate' ? escalateCrmTaskSchema.parse({ expectedVersion: query.data!.task.version, reason, }) : { expectedVersion: query.data!.task.version }, crmTaskDetailSchema, ) | apps/web/src/components/CrmTasks.tsx:626 |
| CrmTimeline | apiGet( `/crm/timeline?${subject}&page=${page}&channel=${channel}&direction=${direction}`, crmTimelineSchema, ) | apps/web/src/components/CrmTimeline.tsx:84 |
| RevisionHistory | apiGet(`/crm/timeline/${id}`, crmInteractionDetailSchema) | apps/web/src/components/CrmTimeline.tsx:262 |
| InteractionForm | apiGet(`/crm/contacts/${contactId}`, crmContactDetailSchema) | apps/web/src/components/CrmTimeline.tsx:327 |
| InteractionForm | apiPut( `/crm/timeline/${original.id}`, input, crmInteractionDetailSchema, ) | apps/web/src/components/CrmTimeline.tsx:341 |
| InteractionForm | apiPost('/crm/timeline', input, crmInteractionDetailSchema) | apps/web/src/components/CrmTimeline.tsx:346 |
| FinanceAssets | apiGet("/finance/assets", assetsWorkspaceSchema) | apps/web/src/components/FinanceAssets.tsx:43 |
| FinanceAssets | apiPost( "/finance/assets/depreciation", { through: today(), idempotencyKey: crypto.randomUUID() }, z.object({ created: z.number(), errors: z.array(z.string()) }), ) | apps/web/src/components/FinanceAssets.tsx:140 |
| FinanceBudgets | apiGet(`/finance/assets/budgets?year=${year}`, budgetReportSchema) | apps/web/src/components/FinanceAssets.tsx:437 |
| FinanceBudgets | apiGet("/finance/assets", assetsWorkspaceSchema) | apps/web/src/components/FinanceAssets.tsx:441 |
| usePayables | apiGet('/finance/payables', payablesWorkspaceSchema) | apps/web/src/components/FinancePayables.tsx:37 |
| FinancePayables | apiGet( `/finance/payables/aging?asOf=${asOf}${supplier ? '&supplierId=' + supplier : ''}`, payablesReportSchema, ) | apps/web/src/components/FinancePayables.tsx:194 |
| FinancePayables | apiGet( `/finance/payables/suppliers/${supplier}/statement?from=${from}&to=${asOf}`, supplierStatementSchema, ) | apps/web/src/components/FinancePayables.tsx:203 |
| ReceiptForm | apiPost( '/finance/payables/receipts/preview', { csv }, z.object({ lines: procurementReceiptSchema.shape.lines }), ) | apps/web/src/components/FinancePayables.tsx:980 |
| FinancePayroll | apiGet('/finance/payroll', payrollWorkspaceSchema) | apps/web/src/components/FinancePayroll.tsx:50 |
| Calculate | apiGet('/finance/payroll/runs/' + existing!.id, payrollRunSchema) | apps/web/src/components/FinancePayroll.tsx:525 |
| RunDetail | apiGet('/finance/payroll/runs/' + id, payrollRunSchema) | apps/web/src/components/FinancePayroll.tsx:697 |
| FinanceSource | apiGet(`/finance/journals/${journalId}/source`, financeSourceSchema) | apps/web/src/components/FinanceRevenue.tsx:171 |
| FinanceSource | apiGet( `/finance/payables/journals/${journalId}/source`, payableSourceSchema, ) | apps/web/src/components/FinanceRevenue.tsx:176 |
| FinanceSource | apiGet(`/finance/assets/journals/${journalId}/source`, z.object({assetId:z.string(),code:z.string(),name:z.string(),kind:z.string()}).nullable()) | apps/web/src/components/FinanceRevenue.tsx:184 |
| FinanceSource | apiGet(`/finance/payroll/journals/${journalId}/source`,payrollSourceSchema) | apps/web/src/components/FinanceRevenue.tsx:189 |
| FinanceRevenue | apiGet('/finance/revenue', financeRevenueWorkspaceSchema) | apps/web/src/components/FinanceRevenue.tsx:333 |
| FinanceRevenue | apiGet( `/finance/receivables/${kind}?asOf=${asOf}${kind === 'panel' && panel ? '&panelId=' + panel : ''}`, financeArSchema, ) | apps/web/src/components/FinanceRevenue.tsx:347 |
| FinanceRevenue | apiGet( `/finance/panels/${panel}/statement?from=${statementFrom}&to=${asOf}`, financePanelStatementSchema, ) | apps/web/src/components/FinanceRevenue.tsx:356 |
| FinanceRevenue | apiPost( '/finance/tills/preview', { ...input, idempotencyKey: crypto.randomUUID() }, z.object({ expected: z.string(), difference: z.string(), paymentCount: z.number(), }), ) | apps/web/src/components/FinanceRevenue.tsx:823 |
| excel | apiGet(path, fileSchema) | apps/web/src/components/FinanceStatements.tsx:48 |
| FinanceStatements | apiGet("/finance/statements/workspace", c.reportingWorkspaceSchema) | apps/web/src/components/FinanceStatements.tsx:92 |
| FinanceStatements | apiGet("/finance/statements?" + query, c.statementPackSchema) | apps/web/src/components/FinanceStatements.tsx:103 |
| exportReport | apiGet( "/finance/statements/print?" + query, c.statementPackSchema, ) | apps/web/src/components/FinanceStatements.tsx:115 |
| Closing | apiGet( "/finance/statements/periods/" + period, c.financeCloseChecklistSchema, ) | apps/web/src/components/FinanceStatements.tsx:860 |
| CustomReports | apiGet( `/finance/statements/templates/${id}?${query}`, c.customReportResultSchema, ) | apps/web/src/components/FinanceStatements.tsx:1050 |
| useAllergies | apiGet(`/patients/${patientId}/allergies`, allergyListResponseSchema) | apps/web/src/hooks/useAllergies.ts:15 |
| useAllergyWriters | apiPost(`/patients/${patientId}/allergies`, input, allergySchema) | apps/web/src/hooks/useAllergies.ts:33 |
| useAllergyWriters | apiPatch(`/patients/${patientId}/allergies/${id}`, input, allergySchema) | apps/web/src/hooks/useAllergies.ts:39 |
| useAppointments | apiGet(`/appointments${query ? `?${query}` : ''}`, appointmentListResponseSchema) | apps/web/src/hooks/useAppointments.ts:30 |
| useCreateAppointment | apiPost('/appointments', input, appointmentSummarySchema) | apps/web/src/hooks/useAppointments.ts:38 |
| useCloseAppointment | apiPatch(`/appointments/${id}/close`, input, appointmentSummarySchema) | apps/web/src/hooks/useAppointments.ts:50 |
| useRescheduleAppointment | apiPatch(`/appointments/${id}/reschedule`, input, rescheduleResultSchema) | apps/web/src/hooks/useAppointments.ts:63 |
| useClinicalNotes | apiGet(`/visits/${visitId}/notes`, clinicalNoteListResponseSchema) | apps/web/src/hooks/useClinicalNotes.ts:20 |
| useSaveClinicalNote | apiPut(`/visits/${visitId}/notes`, input, clinicalNoteSchema) | apps/web/src/hooks/useClinicalNotes.ts:29 |
| useCollectionsList | apiGet(`/collections?${search.toString()}`, collectionsListResponseSchema) | apps/web/src/hooks/useCollections.ts:32 |
| useConsultContext | apiGet(`/visits/${visitId}/consult`, consultContextSchema) | apps/web/src/hooks/useConsult.ts:20 |
| useDepartments | apiGet('/departments', departmentListResponseSchema) | apps/web/src/hooks/useDepartments.ts:16 |
| useCreateDepartment | apiPost('/departments', input, departmentSummarySchema) | apps/web/src/hooks/useDepartments.ts:27 |
| useSetDepartmentActive | apiPatch(`/departments/${vars.id}/active`, { isActive: vars.isActive }, departmentSummarySchema) | apps/web/src/hooks/useDepartments.ts:36 |
| useDiagnoses | apiGet(`/visits/${visitId}/diagnoses`, diagnosisListResponseSchema) | apps/web/src/hooks/useDiagnoses.ts:15 |
| useDiagnosisWriters | apiPost(`/visits/${visitId}/diagnoses`, input, diagnosisSchema) | apps/web/src/hooks/useDiagnoses.ts:30 |
| useDiagnosisWriters | apiPatch(`/visits/${visitId}/diagnoses/${id}`, input, diagnosisSchema) | apps/web/src/hooks/useDiagnoses.ts:36 |
| useDiagnosisWriters | apiDelete(`/visits/${visitId}/diagnoses/${id}`, diagnosisListResponseSchema) | apps/web/src/hooks/useDiagnoses.ts:44 |
| useDiscountCeiling | apiGet('/settings/discount-ceiling', discountCeilingResponseSchema) | apps/web/src/hooks/useDiscountCeiling.ts:14 |
| useSetDiscountCeiling | apiPatch('/settings/discount-ceiling', { maxPercent }, discountCeilingResponseSchema) | apps/web/src/hooks/useDiscountCeiling.ts:22 |
| useDrugs | apiGet(`/drugs${term ? `?q=${encodeURIComponent(term)}` : ''}`, drugListResponseSchema) | apps/web/src/hooks/useDrugs.ts:21 |
| useCreateDrug | apiPost('/drugs', input, drugSummarySchema) | apps/web/src/hooks/useDrugs.ts:28 |
| useUpdateDrug | apiPatch(`/drugs/${vars.id}`, vars.input, drugSummarySchema) | apps/web/src/hooks/useDrugs.ts:37 |
| useSetDrugActive | apiPatch(`/drugs/${vars.id}/active`, { isActive: vars.isActive }, drugSummarySchema) | apps/web/src/hooks/useDrugs.ts:46 |
| useImportDrugs | apiPost('/drugs/import', { csv }, importDrugsResponseSchema) | apps/web/src/hooks/useDrugs.ts:54 |
| useFacilityModules | apiGet('/facility-modules', facilityModuleListResponseSchema) | apps/web/src/hooks/useFacilityModules.ts:16 |
| useSetFacilityModule | apiPatch( `/facility-modules/${vars.module}`, { enabled: vars.enabled }, facilityModuleSummarySchema, ) | apps/web/src/hooks/useFacilityModules.ts:26 |
| useFollowUps | apiGet(`/follow-ups${query ? `?${query}` : ''}`, followUpListResponseSchema) | apps/web/src/hooks/useFollowUps.ts:29 |
| useRespondFollowUp | apiPost(`/follow-ups/${prescriptionId}/respond`, input, followUpSchema) | apps/web/src/hooks/useFollowUps.ts:45 |
| useHealth | apiGet('/health', healthResponseSchema) | apps/web/src/hooks/useHealth.ts:12 |
| usePatientHistory | apiGet(`/patients/${patientId}/history?months=${months}`, patientHistoryResponseSchema) | apps/web/src/hooks/useHistory.ts:17 |
| useIcdSearch | apiGet(`/icd?q=${encodeURIComponent(q)}`, icdSearchResponseSchema) | apps/web/src/hooks/useIcdSearch.ts:17 |
| useInteractionCheck | apiGet( `/drug-interactions/check?drugIds=${encodeURIComponent(ids.join(','))}`, interactionCheckResponseSchema, ) | apps/web/src/hooks/useInteractionCheck.ts:23 |
| useInvoiceList | apiGet(`/invoices?${search.toString()}`, invoiceListResponseSchema) | apps/web/src/hooks/useInvoices.ts:39 |
| useInvoiceDetail | apiGet(`/invoices/${invoiceId}`, invoiceDetailSchema) | apps/web/src/hooks/useInvoices.ts:48 |
| useVisitBills | apiGet(`/invoices/by-visit/${visitId}`, visitBillsResponseSchema) | apps/web/src/hooks/useInvoices.ts:61 |
| useRecordPayment | apiPost( `/invoices/${invoiceId}/payments`, withCommandKey(input), recordPaymentResponseSchema, ) | apps/web/src/hooks/useInvoices.ts:75 |
| useRefundPayment | apiPost( `/invoices/${invoiceId}/payments/${paymentId}/refund`, withCommandKey(input), refundPaymentResponseSchema, ) | apps/web/src/hooks/useInvoices.ts:96 |
| useApplyDiscount | apiPost(`/invoices/${invoiceId}/discount`, input, applyDiscountResponseSchema) | apps/web/src/hooks/useInvoices.ts:117 |
| useLabCharges | apiGet(`/lab-charges?patientId=${patientId}`, labChargesResponseSchema) | apps/web/src/hooks/useLabBilling.ts:17 |
| usePayLabCharges | apiPost('/lab-charges/pay', withCommandKey(body), payLabChargesResponseSchema) | apps/web/src/hooks/useLabBilling.ts:39 |
| useLabOrder | apiGet(`/visits/${visitId}/lab-order`, labOrderResponseSchema) | apps/web/src/hooks/useLabOrder.ts:15 |
| useSaveLabOrder | apiPut(`/visits/${visitId}/lab-order`, input, labOrderResponseSchema) | apps/web/src/hooks/useLabOrder.ts:24 |
| useVisitLabResults | apiGet(`/visits/${visitId}/lab-results`, visitLabResultsResponseSchema) | apps/web/src/hooks/useLabOrder.ts:39 |
| useOrderableTests | apiGet('/lab-tests/orderable', labTestListResponseSchema) | apps/web/src/hooks/useLabOrder.ts:54 |
| useLabPanels | apiGet('/lab-panels', labPanelListResponseSchema) | apps/web/src/hooks/useLabPanels.ts:17 |
| useCreateLabPanel | apiPost('/lab-panels', input, labPanelSummarySchema) | apps/web/src/hooks/useLabPanels.ts:25 |
| useUpdateLabPanel | apiPatch(`/lab-panels/${vars.id}`, vars.input, labPanelSummarySchema) | apps/web/src/hooks/useLabPanels.ts:34 |
| useSetLabPanelActive | apiPatch(`/lab-panels/${vars.id}/active`, { isActive: vars.isActive }, labPanelSummarySchema) | apps/web/src/hooks/useLabPanels.ts:43 |
| useSetLabPanelTests | apiPut(`/lab-panels/${vars.id}/tests`, { testIds: vars.testIds }, labPanelSummarySchema) | apps/web/src/hooks/useLabPanels.ts:53 |
| useLabQueue | apiGet(`/lab-queue${query ? `?${query}` : ''}`, labQueueResponseSchema) | apps/web/src/hooks/useLabQueue.ts:34 |
| useCollectSample | apiPost('/lab-queue/collect', { itemIds }, collectSampleResponseSchema) | apps/web/src/hooks/useLabQueue.ts:51 |
| useSaveLabResult | apiPut(`/lab-queue/items/${itemId}/result`, body, saveLabResultResponseSchema) | apps/web/src/hooks/useLabQueue.ts:67 |
| useVerifyResults | apiPost('/lab-queue/verify', { itemIds }, verifyResultResponseSchema) | apps/web/src/hooks/useLabQueue.ts:82 |
| useLabTests | apiGet('/lab-tests', labTestListResponseSchema) | apps/web/src/hooks/useLabTests.ts:17 |
| useCreateLabTest | apiPost('/lab-tests', input, labTestSummarySchema) | apps/web/src/hooks/useLabTests.ts:24 |
| useUpdateLabTest | apiPatch(`/lab-tests/${vars.id}`, vars.input, labTestSummarySchema) | apps/web/src/hooks/useLabTests.ts:33 |
| useSetLabTestActive | apiPatch(`/lab-tests/${vars.id}/active`, { isActive: vars.isActive }, labTestSummarySchema) | apps/web/src/hooks/useLabTests.ts:42 |
| useCreatePatient | apiPost('/patients', input, patientSummarySchema) | apps/web/src/hooks/usePatient.ts:22 |
| useDuplicateCheck | apiGet(`/patients/duplicates?${params.toString()}`, duplicateCheckResponseSchema) | apps/web/src/hooks/usePatient.ts:55 |
| usePatientDetail | apiGet(`/patients/${id}`, patientDetailSchema) | apps/web/src/hooks/usePatient.ts:68 |
| useUpdatePatient | apiPatch(`/patients/${id}`, input, patientDetailSchema) | apps/web/src/hooks/usePatient.ts:84 |
| useAddPatientIdentifier | apiPost(`/patients/${id}/identifiers`, input, patientDetailSchema) | apps/web/src/hooks/usePatient.ts:92 |
| useRemovePatientIdentifier | apiDelete(`/patients/${id}/identifiers/${identifierId}`, patientDetailSchema) | apps/web/src/hooks/usePatient.ts:100 |
| usePatientSearch | apiGet(`/patients?${params.toString()}`, patientSearchResponseSchema) | apps/web/src/hooks/usePatientSearch.ts:23 |
| usePharmacyQueue | apiGet('/pharmacy/queue', pharmacyQueueResponseSchema) | apps/web/src/hooks/usePharmacy.ts:23 |
| usePharmacyPrescription | apiGet(`/pharmacy/prescriptions/${prescriptionId}`, pharmacyPrescriptionSchema) | apps/web/src/hooks/usePharmacy.ts:36 |
| usePharmacySearch | apiGet( `/pharmacy/prescriptions?q=${encodeURIComponent(term)}`, pharmacyPrescriptionSearchResponseSchema, ) | apps/web/src/hooks/usePharmacy.ts:52 |
| useBillPrescription | apiPost(`/pharmacy/prescriptions/${prescriptionId}/bill`, body, dispenseResponseSchema) | apps/web/src/hooks/usePharmacy.ts:78 |
| useConfirmHandover | apiPost(`/pharmacy/prescriptions/${prescriptionId}/handover`, {}, confirmHandoverResponseSchema) | apps/web/src/hooks/usePharmacy.ts:95 |
| useReturnMedicine | apiPost(`/pharmacy/prescriptions/${prescriptionId}/return`, input, returnMedicineResponseSchema) | apps/web/src/hooks/usePharmacy.ts:111 |
| usePractitioners | apiGet('/practitioners', practitionerListResponseSchema) | apps/web/src/hooks/usePractitioners.ts:18 |
| useCreatePractitioner | apiPost('/practitioners', input, practitionerSummarySchema) | apps/web/src/hooks/usePractitioners.ts:26 |
| useSetPractitionerActive | apiPatch(`/practitioners/${vars.id}/active`, { isActive: vars.isActive }, practitionerSummarySchema) | apps/web/src/hooks/usePractitioners.ts:35 |
| useSetPractitionerDepartments | apiPut( `/practitioners/${vars.id}/departments`, { departmentIds: vars.departmentIds }, practitionerSummarySchema, ) | apps/web/src/hooks/usePractitioners.ts:44 |
| useCreatePractitionerAccount | apiPost(`/practitioners/${vars.id}/account`, vars.input, practitionerAccountResultSchema) | apps/web/src/hooks/usePractitioners.ts:57 |
| useGrantPractitionerDoctorRole | apiPost(`/practitioners/${id}/doctor-role`, {}, practitionerAccountResultSchema) | apps/web/src/hooks/usePractitioners.ts:69 |
| usePrescription | apiGet(`/visits/${visitId}/prescription`, prescriptionResponseSchema) | apps/web/src/hooks/usePrescription.ts:43 |
| useSavePrescription | apiPut(`/visits/${visitId}/prescription`, input, prescriptionResponseSchema) | apps/web/src/hooks/usePrescription.ts:52 |
| useLastPrescription | apiGet(`/visits/${visitId}/prescription/last`, lastPrescriptionResponseSchema) | apps/web/src/hooks/usePrescription.ts:74 |
| useFormulary | apiGet('/drugs', drugListResponseSchema) | apps/web/src/hooks/usePrescription.ts:95 |
| useQueue | apiGet(`/visits/queue${query ? `?${query}` : ''}`, queueResponseSchema) | apps/web/src/hooks/useQueue.ts:38 |
| useCheckIn | apiPost('/reception/check-in', input, checkInResponseSchema) | apps/web/src/hooks/useReception.ts:20 |
| useReceptionWorkspace | apiGet('/reception/operations', receptionWorkspaceSchema) | apps/web/src/hooks/useReceptionOperations.ts:18 |
| useReceptionAudit | apiGet('/reception/operations/audit', receptionAuditSchema) | apps/web/src/hooks/useReceptionOperations.ts:33 |
| usePatientReceptionProfile | apiGet(`/reception/operations/patients/${patientId}`, patientReceptionProfileSchema) | apps/web/src/hooks/useReceptionOperations.ts:41 |
| useReceptionCommand | apiPost(path, payload, resultSchema) | apps/web/src/hooks/useReceptionOperations.ts:57 |
| useReceptionCommand | apiPatch(path, payload, resultSchema) | apps/web/src/hooks/useReceptionOperations.ts:58 |
| downloadPatientDocument | apiDownload(`/reception/operations/patients/${patientId}/documents/${documentId}`) | apps/web/src/hooks/useReceptionOperations.ts:65 |
| useReferenceRanges | apiGet(`/lab-tests/${testId}/ranges`, referenceRangeListResponseSchema) | apps/web/src/hooks/useReferenceRanges.ts:18 |
| useCreateReferenceRange | apiPost(`/lab-tests/${testId}/ranges`, input, referenceRangeSummarySchema) | apps/web/src/hooks/useReferenceRanges.ts:27 |
| useUpdateReferenceRange | apiPatch(`/lab-tests/${testId}/ranges/${vars.id}`, vars.input, referenceRangeSummarySchema) | apps/web/src/hooks/useReferenceRanges.ts:36 |
| useDeleteReferenceRange | apiDelete(`/lab-tests/${testId}/ranges/${id}`, referenceRangeListResponseSchema) | apps/web/src/hooks/useReferenceRanges.ts:45 |
| useCensusReport | apiGet(`/reports/census${rangeSearch(range)}`, censusReportResponseSchema) | apps/web/src/hooks/useReports.ts:31 |
| useWaitTimeReport | apiGet(`/reports/wait-times${rangeSearch(range)}`, waitTimeReportResponseSchema) | apps/web/src/hooks/useReports.ts:39 |
| useRevenueReport | apiGet(`/reports/revenue${rangeSearch(range)}`, revenueReportResponseSchema) | apps/web/src/hooks/useReports.ts:47 |
| useDiagnosisReport | apiGet(`/reports/diagnoses${rangeSearch(range)}`, diagnosisReportResponseSchema) | apps/web/src/hooks/useReports.ts:55 |
| useAuditLogReport | apiGet(`/reports/audit-log?${params.toString()}`, auditLogResponseSchema) | apps/web/src/hooks/useReports.ts:81 |
| useErrorLogReport | apiGet(`/reports/error-log?${params.toString()}`, errorLogResponseSchema) | apps/web/src/hooks/useReports.ts:104 |
| useRooms | apiGet('/rooms', roomListResponseSchema) | apps/web/src/hooks/useRooms.ts:16 |
| useCreateRoom | apiPost('/rooms', input, roomSummarySchema) | apps/web/src/hooks/useRooms.ts:23 |
| useSetRoomActive | apiPatch(`/rooms/${vars.id}/active`, { isActive: vars.isActive }, roomSummarySchema) | apps/web/src/hooks/useRooms.ts:32 |
| useServices | apiGet('/services', serviceListResponseSchema) | apps/web/src/hooks/useServices.ts:17 |
| useCreateService | apiPost('/services', input, serviceSummarySchema) | apps/web/src/hooks/useServices.ts:24 |
| useUpdateService | apiPatch(`/services/${vars.id}`, vars.input, serviceSummarySchema) | apps/web/src/hooks/useServices.ts:33 |
| useSetServiceActive | apiPatch(`/services/${vars.id}/active`, { isActive: vars.isActive }, serviceSummarySchema) | apps/web/src/hooks/useServices.ts:42 |
| useSpecialities | apiGet('/specialities', specialityListResponseSchema) | apps/web/src/hooks/useSpecialities.ts:16 |
| useCreateSpeciality | apiPost('/specialities', input, specialitySummarySchema) | apps/web/src/hooks/useSpecialities.ts:24 |
| useTemplates | apiGet(`/templates?type=${type}`, templateListResponseSchema) | apps/web/src/hooks/useTemplates.ts:23 |
| useCreateTemplate | apiPost('/templates', input, templateSchema) | apps/web/src/hooks/useTemplates.ts:30 |
| useDeleteTemplate | apiDelete(`/templates/${id}`, templateListResponseSchema) | apps/web/src/hooks/useTemplates.ts:45 |
| useUpdateComplaint | apiPatch(`/visits/${visitId}/complaint`, input, visitSummarySchema) | apps/web/src/hooks/useTemplates.ts:54 |
| useTillReport | apiGet(`${path}${search}`, tillReportResponseSchema) | apps/web/src/hooks/useTill.ts:15 |
| useUsers | apiGet('/users', userListResponseSchema) | apps/web/src/hooks/useUsers.ts:16 |
| useCreateUser | apiPost('/users', input, userSummarySchema) | apps/web/src/hooks/useUsers.ts:23 |
| useSetUserActive | apiPatch(`/users/${vars.id}/active`, { isActive: vars.isActive }, userSummarySchema) | apps/web/src/hooks/useUsers.ts:34 |
| useVisitOptions | apiGet('/visits/options', visitOptionsResponseSchema) | apps/web/src/hooks/useVisits.ts:27 |
| useCreateVisit | apiPost('/visits', input, visitSummarySchema) | apps/web/src/hooks/useVisits.ts:34 |
| useChangeVisitStatus | apiPatch(`/visits/${visitId}/status`, input, visitSummarySchema) | apps/web/src/hooks/useVisitStatus.ts:27 |
| useCancelVisit | apiPost(`/visits/${visitId}/cancel`, input, cancelVisitResponseSchema) | apps/web/src/hooks/useVisitStatus.ts:43 |
| useReassignPractitioner | apiPost(`/visits/${visitId}/reassign-practitioner`, input, reassignPractitionerResponseSchema) | apps/web/src/hooks/useVisitStatus.ts:60 |
| useVisitHistory | apiGet(`/visits/${visitId}/history`, visitHistoryResponseSchema) | apps/web/src/hooks/useVisitStatus.ts:71 |
| useVitals | apiGet(`/visits/${visitId}/vitals`, vitalsListResponseSchema) | apps/web/src/hooks/useVitals.ts:14 |
| useRecordVitals | apiPost(`/visits/${visitId}/vitals`, input, vitalsReadingSchema) | apps/web/src/hooks/useVitals.ts:26 |
| submit | apiPost('/auth/change-password', parsed.data, logoutResponseSchema) | apps/web/src/pages/ChangePasswordPage.tsx:33 |
| CrmPage | apiGet('/crm/workspace', crmWorkspaceSchema) | apps/web/src/pages/CrmPage.tsx:41 |
| CrmSettingsForm | apiPut('/crm/settings', input, crmSettingsResponseSchema) | apps/web/src/pages/CrmPage.tsx:212 |
| FinancePage | apiGet('/finance', financeWorkspaceSchema) | apps/web/src/pages/FinancePage.tsx:220 |
| perform | apiPost( '/finance/' + path, { ...input, idempotencyKey }, z.unknown(), ) | apps/web/src/pages/FinancePage.tsx:242 |
| Journals | apiGet( `/finance/journals?page=${page}${status ? '&status=' + status : ''}`, financeJournalPageSchema, ) | apps/web/src/pages/FinancePage.tsx:673 |
| Journals | apiGet(`/finance/journals/${selected}`, financeJournalSchema) | apps/web/src/pages/FinancePage.tsx:679 |
| OpeningBalances | apiPost( '/finance/opening/preview', { ...file, idempotencyKey: crypto.randomUUID() }, financeOpeningPreviewSchema, ) | apps/web/src/pages/FinancePage.tsx:946 |
| JournalAudit | apiGet( `/finance/journals/${journalId}/audit?page=${page}`, financeAuditPageSchema, ) | apps/web/src/pages/FinancePage.tsx:1017 |
| FinanceReports | apiGet(`/finance/reports?from=${from}&to=${to}`, financeReportSchema) | apps/web/src/pages/FinancePage.tsx:1237 |
| FinanceReports | apiGet( `/finance/ledger?accountId=${account}&from=${from}&to=${to}&page=${page}`, financeLedgerSchema, ) | apps/web/src/pages/FinancePage.tsx:1243 |
| Reconciliation | apiGet( `/finance/ledger?accountId=${statement!.accountId}&from=${data.settings!.cutoverDate}&to=${statement!.endsOn}&page=${pageParam}`, financeLedgerSchema, ) | apps/web/src/pages/FinancePage.tsx:1460 |
| useReferenceData | apiGet("/departments", departmentListResponseSchema) | apps/web/src/pages/HrPage.tsx:194 |
| useReferenceData | apiGet("/hr/positions", positionsSchema) | apps/web/src/pages/HrPage.tsx:198 |
| Employees | apiGet( `/employees?q=${encodeURIComponent(q)}&page=1`, employeeListSchema, ) | apps/web/src/pages/HrPage.tsx:216 |
| Employees | apiGet(`/employees/${selectedId}`, hrEmployeeSchema) | apps/web/src/pages/HrPage.tsx:223 |
| Employees | apiPost("/employees", body, hrEmployeeSchema) | apps/web/src/pages/HrPage.tsx:228 |
| EmployeeDetail | apiUpload( `/employees/${employee.id}/documents`, form, z.object({}).passthrough(), ) | apps/web/src/pages/HrPage.tsx:414 |
| EmployeeDetail | apiPost( `/employees/${employee.id}/credentials`, body, hrCredentialSchema, ) | apps/web/src/pages/HrPage.tsx:427 |
| EmployeeDetail | apiPost( `/employees/${employee.id}/exit`, { exitDate: today(), exitReason: "Employment ended by HR" }, hrEmployeeSchema, ) | apps/web/src/pages/HrPage.tsx:439 |
| EmployeeDetail | apiPost(`/employees/${employee.id}/account`, body, resultSchema) | apps/web/src/pages/HrPage.tsx:451 |
| EmployeeDetail | apiDownload( `/employees/${employee.id}/documents/${d.id}/download`, ) | apps/web/src/pages/HrPage.tsx:530 |
| Credentials | apiGet( `/hr/credentials${state ? `?state=${state}` : ""}`, credentialsSchema, ) | apps/web/src/pages/HrPage.tsx:646 |
| Attendance | apiGet(`/hr/attendance?date=${date}`, attendanceSchema) | apps/web/src/pages/HrPage.tsx:721 |
| Attendance | apiPut( "/hr/attendance", { workDate: date, entries: query.data?.map((r) => ({ employeeId: r.employeeId, shiftTypeId: null, status: marks[r.employeeId] ?? r.status, minutesLate: 0, note: null, })), }, attendanceSchema, ) | apps/web/src/pages/HrPage.tsx:726 |
| Attendance | apiGet( `/hr/reports/attendance?from=${firstOfMonth()}&to=${today()}`, attendanceReportSchema, ) | apps/web/src/pages/HrPage.tsx:746 |
| Leave | apiGet("/hr/leave-types", leaveTypesSchema) | apps/web/src/pages/HrPage.tsx:837 |
| Leave | apiGet("/employees?page=1", employeeListSchema) | apps/web/src/pages/HrPage.tsx:841 |
| Leave | apiGet( mine ? "/hr/leave-requests/mine" : "/hr/leave-requests", leaveRequestsSchema, ) | apps/web/src/pages/HrPage.tsx:847 |
| Leave | apiPost("/hr/leave-requests", body, resultSchema) | apps/web/src/pages/HrPage.tsx:854 |
| Leave | apiPost(`/hr/leave-requests/${id}/decision`, { decision }, resultSchema) | apps/web/src/pages/HrPage.tsx:860 |
| Roster | apiGet("/employees?page=1", employeeListSchema) | apps/web/src/pages/HrPage.tsx:978 |
| Roster | apiGet("/hr/shift-types", shiftsSchema) | apps/web/src/pages/HrPage.tsx:983 |
| Roster | apiGet(`/hr/roster?from=${from}&to=${to}`, rosterSchema) | apps/web/src/pages/HrPage.tsx:987 |
| Roster | apiGet(`/hr/roster-warnings?from=${from}&to=${to}`, rosterWarningsSchema) | apps/web/src/pages/HrPage.tsx:992 |
| Roster | apiGet( "/hr/on-duty", z.array( z.object({ employeeId: z.string(), employeeName: z.string(), departmentId: z.string(), shiftName: z.string(), roleOnShift: z.string().nullable(), }), ), ) | apps/web/src/pages/HrPage.tsx:997 |
| Roster | apiPost("/hr/roster", body, resultSchema) | apps/web/src/pages/HrPage.tsx:1012 |
| Roster | apiPost( "/hr/roster/publish", { startsOn: from, endsOn: to }, resultSchema, ) | apps/web/src/pages/HrPage.tsx:1017 |
| Roster | apiPost( "/hr/roster/copy", { sourceStartsOn: shiftDate(from, -7), targetStartsOn: from }, resultSchema, ) | apps/web/src/pages/HrPage.tsx:1026 |
| HrSettings | apiGet("/hr/config", hrConfigSchema) | apps/web/src/pages/HrPage.tsx:1155 |
| HrSettings | apiGet("/hr/leave-types", leaveTypesSchema) | apps/web/src/pages/HrPage.tsx:1159 |
| HrSettings | apiGet("/hr/shift-types", shiftsSchema) | apps/web/src/pages/HrPage.tsx:1163 |
| HrSettings | apiPut("/hr/config", body, hrConfigSchema) | apps/web/src/pages/HrPage.tsx:1166 |
| HrSettings | apiPost(path, body, resultSchema) | apps/web/src/pages/HrPage.tsx:1171 |
| run | apiGet( `/reports/patient-export?reason=${encodeURIComponent(reason)}`, patientExportResponseSchema, ) | apps/web/src/pages/ReportsPage.tsx:957 |
| resetPassword | apiPost(`/users/${resetTarget.id}/reset-password`, parsed.data, logoutResponseSchema) | apps/web/src/pages/UsersPage.tsx:65 |
