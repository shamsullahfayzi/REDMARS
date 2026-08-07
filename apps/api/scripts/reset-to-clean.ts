import { PrismaClient } from '@prisma/client';

/**
 * One-time (or "before real go-live") reset: wipes every transactional/test row this
 * project's dev-and-build history accumulated, KEEPS the catalog seeds (departments,
 * drugs, services, lab tests + reference ranges, ICD codes, drug interactions,
 * roles/permissions, facility, specialities), resets the number sequences to zero so
 * the first real patient gets MRN-000001, and strips the few load-test-only rows the
 * kept tables picked up (a stray `LOADTEST-CONSULT` service, a temporary price on 3
 * lab tests, non-real department codes like "test"/"001").
 *
 * Does NOT create the admin account — run `prisma db seed` (the normal seed.ts)
 * immediately after this: with app_user now empty, it creates exactly one fresh
 * admin with a freshly-generated password, printed once, and harmlessly re-affirms
 * every catalog table this script left alone.
 *
 * REFUSES TO RUN unless RESET_CONFIRM=yes-wipe-transactional-data is set — this
 * deletes real rows with no code-level undo. Point DATABASE_URL at the right
 * database and read the printed row counts before answering "y" to the prompt this
 * script does NOT have (there is no prompt — the env var IS the confirmation, so a
 * human has to have deliberately typed or pasted it, not fat-fingered a keypress).
 *
 * Run: pnpm --filter api exec ts-node -P tsconfig.seed.json scripts/reset-to-clean.ts
 */

const prisma = new PrismaClient();

// Exactly the codes seed.ts's own DEPARTMENTS array creates — anything else in the
// department table is a stray manual-testing row, not a real department.
const REAL_DEPARTMENT_CODES = [
  'OPD', 'LAB', 'PHARM', 'ADMIN', 'IPD', 'EME', 'RAD', 'CAR', 'NEURO', 'OPEN',
  'DENTA', 'URO', 'GYN', 'PED', 'INTER', 'PHYS', 'DIALY', 'ENDO', 'ANE',
];

// Lab test codes the 7.7 load test temporarily priced so it had something non-zero
// to bill against. Reset to null — real pricing is a deliberate admin act, not a
// leftover from a load test.
const LOAD_TEST_PRICED_LAB_CODES = ['TSH', 'FBS', 'CBC'];

async function main() {
  if (process.env.RESET_CONFIRM !== 'yes-wipe-transactional-data') {
    throw new Error(
      "Refusing to run: set RESET_CONFIRM=yes-wipe-transactional-data to confirm. " +
        "This deletes every patient/visit/invoice/user row in the database this script's DATABASE_URL points at.",
    );
  }

  const facilityCode = process.env.SEED_FACILITY_CODE ?? 'FARHAT';
  const facility = await prisma.facility.findUnique({ where: { code: facilityCode } });
  if (!facility) throw new Error(`Facility '${facilityCode}' not found — nothing to reset.`);

  console.log(`Wiping transactional data for facility ${facility.code} (${facility.id})...`);

  // Children before parents. Every model here is scoped to this facility already
  // (directly or via its parent), so no cross-facility risk on a multi-tenant DB.
  const wipes: Array<[string, () => Promise<{ count: number }>]> = [
    ['error_log', () => prisma.errorLog.deleteMany({ where: { facilityId: facility.id } })],
    ['audit_log', () => prisma.auditLog.deleteMany({ where: { facilityId: facility.id } })],
    ['follow_up_response', () => prisma.followUpResponse.deleteMany({ where: { prescription: { visit: { facilityId: facility.id } } } })],
    ['payment', () => prisma.payment.deleteMany({ where: { invoice: { facilityId: facility.id } } })],
    ['invoice_item', () => prisma.invoiceItem.deleteMany({ where: { invoice: { facilityId: facility.id } } })],
    ['invoice', () => prisma.invoice.deleteMany({ where: { facilityId: facility.id } })],
    ['lab_result', () => prisma.labResult.deleteMany({ where: { labOrderItem: { labOrder: { facilityId: facility.id } } } })],
    ['lab_order_item', () => prisma.labOrderItem.deleteMany({ where: { labOrder: { facilityId: facility.id } } })],
    ['lab_order', () => prisma.labOrder.deleteMany({ where: { facilityId: facility.id } })],
    ['prescription_item', () => prisma.prescriptionItem.deleteMany({ where: { prescription: { visit: { facilityId: facility.id } } } })],
    ['prescription', () => prisma.prescription.deleteMany({ where: { visit: { facilityId: facility.id } } })],
    ['diagnosis', () => prisma.diagnosis.deleteMany({ where: { visit: { facilityId: facility.id } } })],
    ['clinical_note', () => prisma.clinicalNote.deleteMany({ where: { visit: { facilityId: facility.id } } })],
    ['allergy', () => prisma.allergy.deleteMany({ where: { patient: { facilityId: facility.id } } })],
    ['vitals', () => prisma.vitals.deleteMany({ where: { visit: { facilityId: facility.id } } })],
    ['appointment', () => prisma.appointment.deleteMany({ where: { facilityId: facility.id } })],
    ['visit_status_history', () => prisma.visitStatusHistory.deleteMany({ where: { visit: { facilityId: facility.id } } })],
    ['visit', () => prisma.visit.deleteMany({ where: { facilityId: facility.id } })],
    ['patient_identifier', () => prisma.patientIdentifier.deleteMany({ where: { patient: { facilityId: facility.id } } })],
    ['patient', () => prisma.patient.deleteMany({ where: { facilityId: facility.id } })],
    ['template', () => prisma.template.deleteMany({ where: { facilityId: facility.id } })],
    ['lab_panel_test', () => prisma.labPanelTest.deleteMany({ where: { panel: { facilityId: facility.id } } })],
    ['lab_panel', () => prisma.labPanel.deleteMany({ where: { facilityId: facility.id } })],
    ['room', () => prisma.room.deleteMany({ where: { facilityId: facility.id } })],
    ['session', () => prisma.session.deleteMany({ where: { user: { facilityId: facility.id } } })],
    ['user_role', () => prisma.userRole.deleteMany({ where: { user: { facilityId: facility.id } } })],
    ['practitioner_department', () => prisma.practitionerDepartment.deleteMany({ where: { practitioner: { facilityId: facility.id } } })],
    ['practitioner', () => prisma.practitioner.deleteMany({ where: { facilityId: facility.id } })],
    ['app_user', () => prisma.appUser.deleteMany({ where: { facilityId: facility.id } })],
  ];

  for (const [label, run] of wipes) {
    const { count } = await run();
    console.log(`  ${label}: deleted ${count}`);
  }

  const strayDepts = await prisma.department.deleteMany({
    where: { facilityId: facility.id, code: { notIn: REAL_DEPARTMENT_CODES } },
  });
  console.log(`  department (stray, non-catalog codes): deleted ${strayDepts.count}`);

  const strayService = await prisma.service.deleteMany({
    where: { facilityId: facility.id, code: 'LOADTEST-CONSULT' },
  });
  console.log(`  service (LOADTEST-CONSULT): deleted ${strayService.count}`);

  const unpriced = await prisma.labTest.updateMany({
    where: { facilityId: facility.id, code: { in: LOAD_TEST_PRICED_LAB_CODES } },
    data: { price: null },
  });
  console.log(`  lab_test (reset load-test price to null): updated ${unpriced.count}`);

  const resetSeq = await prisma.numberSequence.updateMany({
    where: { facilityId: facility.id },
    data: { current: 0 },
  });
  console.log(`  number_sequence (reset to 0): updated ${resetSeq.count}`);

  console.log(
    '\nDone. Catalog seeds (departments, drugs, services, lab tests, ICD, ' +
      'interactions, roles/permissions, facility, specialities) were left untouched.\n' +
      'Next: run `prisma db seed` to create the one fresh admin account and re-affirm the facility row.',
  );
}

main()
  .catch((error) => {
    console.error('reset failed:', error.message ?? error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
