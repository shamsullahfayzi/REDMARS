import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

/**
 * Task 7.7 — load test: 40 concurrent patients, 6 staff users, Tuesday-morning
 * conditions. "Done when": doesn't fall over.
 *
 * Two phases:
 *  1. BOOTSTRAP (direct Prisma, bare client, no audit actor — same convention as the
 *     seed-*.ts scripts). Idempotent: creates 6 fixed load-test staff accounts, 2
 *     Practitioner rows for the two doctor logins, one priced consultation service
 *     and prices a couple of lab tests if they're still null from the Medi-Pro
 *     migration. Safe to re-run; upserts throughout.
 *  2. BURST (real HTTP, through the actual NestJS server — this is the part being
 *     tested). Each of 40 "patients" runs the full clinical journey end to end —
 *     check-in, vitals, complaint, diagnosis, prescription, lab order, both bills
 *     paid, lab collected/resulted/verified, medicine handed over, visit closed —
 *     as its own concurrent async chain, staggered by a small random jitter so 40
 *     patients don't arrive in the same literal millisecond (Tuesday morning, not a
 *     denial-of-service).
 *
 * Requires the API already running (`pnpm dev:api`) — this script does not start it.
 *
 * Run: pnpm --filter api exec ts-node -P tsconfig.seed.json scripts/load-test.ts
 * Env: LOAD_TEST_BASE_URL (default http://localhost:3000), LOAD_TEST_PATIENTS (default 40),
 *      LOAD_TEST_PASSWORD (default below), SEED_FACILITY_CODE (default FARHAT)
 */

const prisma = new PrismaClient();

const BASE_URL = process.env.LOAD_TEST_BASE_URL ?? 'http://localhost:3000';
const PATIENT_COUNT = Number(process.env.LOAD_TEST_PATIENTS ?? 40);
const PASSWORD = process.env.LOAD_TEST_PASSWORD ?? 'LoadTest#Farhat2026';
const REQUEST_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Phase 1 — bootstrap fixtures (direct Prisma)
// ---------------------------------------------------------------------------

const STAFF = [
  { username: 'loadtest_reception', fullName: 'Load Test Reception', role: 'receptionist' },
  { username: 'loadtest_nurse', fullName: 'Load Test Nurse', role: 'nurse' },
  { username: 'loadtest_doctor1', fullName: 'Load Test Doctor One', role: 'doctor' },
  { username: 'loadtest_doctor2', fullName: 'Load Test Doctor Two', role: 'doctor' },
  { username: 'loadtest_labtech', fullName: 'Load Test Lab Tech', role: 'lab_tech' },
  { username: 'loadtest_pharmacist', fullName: 'Load Test Pharmacist', role: 'pharmacist' },
] as const;

const LOAD_TEST_SERVICE_CODE = 'LOADTEST-CONSULT';
const LOAD_TEST_LAB_CODES = ['TSH', 'FBS', 'CBC'];

interface Fixtures {
  facilityId: string;
  departmentId: string;
  serviceId: string;
  drugIds: string[];
  labTestIds: string[];
  practitionerIds: Record<'loadtest_doctor1' | 'loadtest_doctor2', string>;
}

async function bootstrap(): Promise<Fixtures> {
  const facilityCode = process.env.SEED_FACILITY_CODE ?? 'FARHAT';
  const facility = await prisma.facility.findUnique({ where: { code: facilityCode } });
  if (!facility) {
    throw new Error(`Facility '${facilityCode}' not found. Run the main seed first.`);
  }

  const department = await prisma.department.findUnique({
    where: { facilityId_code: { facilityId: facility.id, code: 'OPD' } },
  });
  if (!department) {
    throw new Error("Department 'OPD' not found. Run the main seed first.");
  }

  const passwordHash = await hash(PASSWORD);
  const practitionerIds: Partial<Record<string, string>> = {};

  for (const staff of STAFF) {
    const role = await prisma.role.findUnique({ where: { code: staff.role } });
    if (!role) throw new Error(`Role '${staff.role}' does not exist — run the main seed first.`);

    const user = await prisma.appUser.upsert({
      where: { facilityId_username: { facilityId: facility.id, username: staff.username } },
      update: {},
      create: { facilityId: facility.id, username: staff.username, fullName: staff.fullName, passwordHash },
    });

    const hasRole = await prisma.userRole.findFirst({ where: { userId: user.id, roleId: role.id } });
    if (!hasRole) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    }

    if (staff.role === 'doctor') {
      const code = staff.username === 'loadtest_doctor1' ? 'LT-DOC1' : 'LT-DOC2';
      const practitioner = await prisma.practitioner.upsert({
        where: { facilityId_code: { facilityId: facility.id, code } },
        update: { userId: user.id },
        create: {
          facilityId: facility.id,
          code,
          firstName: staff.fullName.split(' ')[0],
          lastName: staff.fullName.split(' ').slice(1).join(' ') || 'Doctor',
          userId: user.id,
        },
      });
      const linked = await prisma.practitionerDepartment.findUnique({
        where: { practitionerId_departmentId: { practitionerId: practitioner.id, departmentId: department.id } },
      });
      if (!linked) {
        await prisma.practitionerDepartment.create({
          data: { practitionerId: practitioner.id, departmentId: department.id },
        });
      }
      practitionerIds[staff.username] = practitioner.id;
    }
  }

  const service = await prisma.service.upsert({
    where: { facilityId_code: { facilityId: facility.id, code: LOAD_TEST_SERVICE_CODE } },
    update: {},
    create: {
      facilityId: facility.id,
      code: LOAD_TEST_SERVICE_CODE,
      name: 'Load Test Consultation',
      departmentId: department.id,
      fee: '500.00',
    },
  });

  const labTestIds: string[] = [];
  for (const code of LOAD_TEST_LAB_CODES) {
    const test = await prisma.labTest.findUnique({ where: { facilityId_code: { facilityId: facility.id, code } } });
    if (!test) continue;
    if (test.price == null) {
      await prisma.labTest.update({ where: { id: test.id }, data: { price: '300.00' } });
    }
    labTestIds.push(test.id);
  }
  if (labTestIds.length === 0) {
    throw new Error(`None of ${LOAD_TEST_LAB_CODES.join(', ')} found in lab_test — run the lab test seed first.`);
  }

  const drugs = await prisma.drug.findMany({ where: { facilityId: facility.id, isActive: true }, take: 10 });
  if (drugs.length === 0) {
    throw new Error('No active drugs found — run the drug seed(s) first.');
  }

  console.log(
    `bootstrap: 6 staff accounts, 2 practitioners, 1 service (${LOAD_TEST_SERVICE_CODE}), ` +
      `${labTestIds.length} priced lab tests, ${drugs.length} drugs available`,
  );

  return {
    facilityId: facility.id,
    departmentId: department.id,
    serviceId: service.id,
    drugIds: drugs.map((d) => d.id),
    labTestIds,
    practitionerIds: {
      loadtest_doctor1: practitionerIds.loadtest_doctor1!,
      loadtest_doctor2: practitionerIds.loadtest_doctor2!,
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — the HTTP burst
// ---------------------------------------------------------------------------

interface StatBucket {
  ok: number;
  fail: number;
  latencies: number[];
  errors: string[];
}
const stats = new Map<string, StatBucket>();

function bucket(key: string): StatBucket {
  let b = stats.get(key);
  if (!b) {
    b = { ok: 0, fail: 0, latencies: [], errors: [] };
    stats.set(key, b);
  }
  return b;
}

async function call(
  key: string,
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<any> {
  const b = bucket(key);
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const ms = performance.now() - start;
    b.latencies.push(ms);
    const text = await res.text();
    const json = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      b.fail++;
      b.errors.push(`${res.status} ${text.slice(0, 200)}`);
      throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    }
    b.ok++;
    return json;
  } catch (err) {
    const ms = performance.now() - start;
    if (b.latencies[b.latencies.length - 1] !== ms) b.latencies.push(ms);
    if (!(err instanceof Error && err.message.includes('->'))) {
      b.fail++;
      b.errors.push(err instanceof Error ? err.message : String(err));
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function login(username: string): Promise<string> {
  const res = await call('POST /auth/login', null, 'POST', '/auth/login', { username, password: PASSWORD });
  return res.accessToken;
}

function jitterMs(maxMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.random() * maxMs));
}

/**
 * A real front desk has one or two people typing, not forty. Blasting 40 truly
 * simultaneous check-ins through a single receptionist login isn't "Tuesday morning,"
 * it's a physical impossibility — nobody can submit forty forms in the same instant
 * from one seat. This caps how many check-ins are in flight together (a couple of
 * terminals' worth), while every downstream step — a doctor consulting, the lab
 * bench, the pharmacy — stays fully concurrent across all 40 patients, because THAT
 * concurrency is real: multiple staff genuinely act on different patients at once.
 */
class Semaphore {
  private active = 0;
  private waiters: Array<() => void> = [];
  constructor(private readonly max: number) {}
  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active++;
  }
  release(): void {
    this.active--;
    const next = this.waiters.shift();
    if (next) next();
  }
}
const checkInDesk = new Semaphore(3);

const PHONE_BASE = 700000000;

async function patientJourney(
  index: number,
  tokens: Record<string, string>,
  fixtures: Fixtures,
): Promise<{ ok: boolean; error?: string }> {
  await jitterMs(3000); // Tuesday morning, not a stampede.
  try {
    const doctorUsername = index % 2 === 0 ? 'loadtest_doctor1' : 'loadtest_doctor2';
    const doctorToken = tokens[doctorUsername];
    const practitionerId = fixtures.practitionerIds[doctorUsername];

    // 1. Check-in (receptionist): new patient + visit + reception invoice, paid.
    // Gated — see the Semaphore comment: one desk, not forty.
    await checkInDesk.acquire();
    let checkIn: any;
    try {
      checkIn = await call('POST /reception/check-in', tokens.loadtest_reception, 'POST', '/reception/check-in', {
        patient: {
          firstName: `LoadTest${index}`,
          lastName: 'Patient',
          gender: index % 2 === 0 ? 'male' : 'female',
          phone: `+93${PHONE_BASE + index}`,
          dateOfBirth: `19${70 + (index % 30)}-0${(index % 9) + 1}-1${index % 9}`,
          acknowledgeDuplicate: true,
        },
        visit: {
          type: 'opd_consult',
          departmentId: fixtures.departmentId,
          practitionerId,
          chiefComplaint: 'Low mood and poor sleep for two weeks',
        },
        items: [{ serviceId: fixtures.serviceId, quantity: 1 }],
        paymentMethod: 'cash',
        acknowledgeDuplicate: true,
      });
    } finally {
      checkInDesk.release();
    }
    const visitId: string = checkIn.visit.id;

    // 2. Vitals (nurse)
    await call('POST /visits/:id/vitals', tokens.loadtest_nurse, 'POST', `/visits/${visitId}/vitals`, {
      systolicBp: 118,
      diastolicBp: 76,
      pulse: 78,
      temperatureC: 36.7,
      spo2: 98,
    });

    // 3. Chief complaint update (nurse)
    await call(
      'PATCH /visits/:id/complaint',
      tokens.loadtest_nurse,
      'PATCH',
      `/visits/${visitId}/complaint`,
      { chiefComplaint: 'Persistent low mood, anhedonia, insomnia for 2 weeks' },
    );

    // 4. Diagnosis (doctor)
    await call('POST /visits/:id/diagnoses', doctorToken, 'POST', `/visits/${visitId}/diagnoses`, {
      text: 'Moderate depressive episode',
      certainty: 'provisional',
      isPrimary: true,
    });

    // 5. Prescription (doctor)
    const drugId = fixtures.drugIds[index % fixtures.drugIds.length];
    const rx = await call('PUT /visits/:id/prescription', doctorToken, 'PUT', `/visits/${visitId}/prescription`, {
      items: [
        {
          drugId,
          dose: '1 tab',
          frequency: 'OD',
          duration: '1 month',
          route: 'PO',
          quantity: 30,
        },
      ],
      advice: 'Avoid alcohol. Return if side effects worsen.',
    });
    const prescriptionId: string = rx.prescription.id;
    const rxItemId: string = rx.prescription.items[0].id;

    // 6. Lab order (doctor)
    const labOrder = await call('PUT /visits/:id/lab-order', doctorToken, 'PUT', `/visits/${visitId}/lab-order`, {
      clinicalNote: 'Rule out thyroid cause',
      testIds: fixtures.labTestIds,
    });
    const labItemIds: string[] = labOrder.order.items.map((i: any) => i.id);
    const labInvoiceId: string | undefined = labOrder.order.invoice?.id;

    // 7. Move visit into consultation (nurse)
    await call('PATCH /visits/:id/status (in_progress)', tokens.loadtest_nurse, 'PATCH', `/visits/${visitId}/status`, {
      status: 'in_progress',
    });

    // 8-9. Pay the lab charges — its own per-line endpoint (lab_charge.collect), not the
    // generic invoice payment: that one only moves Invoice.paidAmount/status, while
    // /lab-queue/collect gates on each InvoiceLine's OWN isPaid flag, which only
    // POST /lab-charges/pay sets.
    if (labInvoiceId && labItemIds.length > 0) {
      await call('POST /lab-charges/pay', tokens.loadtest_reception, 'POST', '/lab-charges/pay', {
        itemIds: labItemIds,
        method: 'cash',
      });
    }

    // 10-12. Lab bench: collect, result, verify (lab_tech)
    if (labItemIds.length > 0) {
      await call('POST /lab-queue/collect', tokens.loadtest_labtech, 'POST', '/lab-queue/collect', {
        itemIds: labItemIds,
      });
      for (const itemId of labItemIds) {
        await call(
          'PUT /lab-queue/items/:id/result',
          tokens.loadtest_labtech,
          'PUT',
          `/lab-queue/items/${itemId}/result`,
          { valueNumeric: '3.2' },
        );
      }
      await call('POST /lab-queue/verify', tokens.loadtest_labtech, 'POST', '/lab-queue/verify', {
        itemIds: labItemIds,
      });
    }

    // 13-15. Pharmacy: bill, pay, hand over
    const bill = await call(
      'POST /pharmacy/prescriptions/:id/bill',
      tokens.loadtest_pharmacist,
      'POST',
      `/pharmacy/prescriptions/${prescriptionId}/bill`,
      { items: [{ itemId: rxItemId, unitPrice: '150.00' }] },
    );
    if (Number(bill.outstanding) > 0) {
      await call(
        'POST /invoices/:id/payments (pharmacy)',
        tokens.loadtest_reception,
        'POST',
        `/invoices/${bill.invoiceId}/payments`,
        { amount: bill.outstanding, method: 'cash' },
      );
    }
    await call(
      'POST /pharmacy/prescriptions/:id/handover',
      tokens.loadtest_pharmacist,
      'POST',
      `/pharmacy/prescriptions/${prescriptionId}/handover`,
    );

    // 16. Close the visit (nurse)
    await call('PATCH /visits/:id/status (completed)', tokens.loadtest_nurse, 'PATCH', `/visits/${visitId}/status`, {
      status: 'completed',
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function main() {
  console.log(`load test: ${PATIENT_COUNT} concurrent patients against ${BASE_URL}`);
  const fixtures = await bootstrap();

  console.log('logging in 6 staff users...');
  const tokens: Record<string, string> = {};
  for (const staff of STAFF) {
    tokens[staff.username] = await login(staff.username);
  }
  console.log('all 6 logged in. starting burst...');

  const wallStart = performance.now();
  const results = await Promise.all(
    Array.from({ length: PATIENT_COUNT }, (_, i) => patientJourney(i, tokens, fixtures)),
  );
  const wallMs = performance.now() - wallStart;

  const failures = results.filter((r) => !r.ok);
  console.log('\n=== RESULT ===');
  console.log(`${results.length - failures.length}/${results.length} patient journeys completed clean`);
  console.log(`wall clock: ${(wallMs / 1000).toFixed(1)}s`);

  if (failures.length > 0) {
    console.log(`\n${failures.length} failed journeys, first 5 errors:`);
    for (const f of failures.slice(0, 5)) console.log(`  - ${f.error}`);
  }

  console.log('\n=== PER-ENDPOINT LATENCY (ms) ===');
  const rows = [...stats.entries()].sort((a, b) => b[1].ok + b[1].fail - (a[1].ok + a[1].fail));
  for (const [key, b] of rows) {
    const sorted = [...b.latencies].sort((x, y) => x - y);
    const total = b.ok + b.fail;
    console.log(
      `${key.padEnd(42)} n=${String(total).padStart(3)} ok=${b.ok} fail=${b.fail}  ` +
        `p50=${percentile(sorted, 50).toFixed(0)} p95=${percentile(sorted, 95).toFixed(0)} max=${(sorted[sorted.length - 1] ?? 0).toFixed(0)}`,
    );
    if (b.errors.length > 0) {
      console.log(`   sample error: ${b.errors[0].slice(0, 150)}`);
    }
  }

  const totalRequests = rows.reduce((sum, [, b]) => sum + b.ok + b.fail, 0);
  const totalFails = rows.reduce((sum, [, b]) => sum + b.fail, 0);
  console.log(
    `\n${totalRequests} total requests, ${totalFails} failed (${((totalFails / totalRequests) * 100).toFixed(1)}%), ` +
      `${(totalRequests / (wallMs / 1000)).toFixed(1)} req/s`,
  );

  process.exit(failures.length > 0 ? 1 : 0);
}

main()
  .catch((error) => {
    console.error('load test crashed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
