import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  DispenseResponse,
  LoginResponse,
  PharmacyPrescription,
  PharmacyQueueResponse,
  RecordPaymentResponse,
  ReturnMedicineResponse,
} from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * The pharmacy queue (e2e) — task 6.8.
 *
 * The done-when: a pharmacist sees the doctor's active orders — who the patient is, who
 * prescribed, and the drugs — oldest first. A dispensed (completed) prescription, one on a
 * cancelled visit, and another facility's orders are all absent; a doctor cannot read the
 * queue at all (pharmacy.read_queue is not theirs).
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_pharm_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Pharmacy queue (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let practitionerId: string;
  let drugId: string;
  let patientId: string;
  let detailPrescriptionId: string;
  let otherPrescriptionId: string;
  let dispensePrescriptionId: string;
  let returnPrescriptionId: string;
  let oldDispensedId: string;
  let pharmId: string;
  const tokens: Record<string, string> = {};

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Pharm ${suffix}`,
        passwordHash: await hash(PASSWORD),
      },
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const res = await request(server)
      .post('/auth/login')
      .send({ username: `${PREFIX}${suffix}`, password: PASSWORD })
      .expect(200);
    tokens[suffix] = (res.body as LoginResponse).accessToken;
    return user.id;
  }

  async function seedPrescription(
    facId: string,
    patId: string,
    departmentId: string,
    practId: string,
    drug: string,
    opts: {
      visitNo: string;
      visitStatus: string;
      status: string;
      drugs: string[];
      interactionAckReason?: string;
      overrideReason?: string;
    },
  ): Promise<string> {
    const visit = await prisma.visit.create({
      data: {
        facilityId: facId,
        patientId: patId,
        departmentId,
        visitNo: opts.visitNo,
        type: 'opd_consult',
        status: opts.visitStatus,
      },
    });
    const rx = await prisma.prescription.create({
      data: {
        visitId: visit.id,
        practitionerId: practId,
        status: opts.status as never,
        interactionAckReason: opts.interactionAckReason ?? null,
        items: {
          create: opts.drugs.map((name, i) => ({
            drugId: drug,
            drugNameAtTime: name,
            frequency: 'TDS',
            duration: '7 days',
            route: 'oral',
            sequence: i,
            allergyOverrideReason: i === 0 ? (opts.overrideReason ?? null) : null,
          })),
        },
      },
    });
    return rx.id;
  }

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    // Bills raised by dispensing (task 6.10) — before the visit they point at.
    await prisma.payment.deleteMany({ where: { invoice: facilityFilter } });
    await prisma.invoiceItem.deleteMany({ where: { invoice: facilityFilter } });
    await prisma.invoice.deleteMany({ where: facilityFilter });
    await prisma.prescriptionItem.deleteMany({
      where: { prescription: { visit: facilityFilter } },
    });
    await prisma.prescription.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.allergy.deleteMany({ where: { patient: facilityFilter } });
    await prisma.drug.deleteMany({ where: facilityFilter });
    await prisma.practitioner.deleteMany({ where: facilityFilter });
    await prisma.patient.deleteMany({ where: facilityFilter });
    await prisma.department.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.numberSequence.deleteMany({ where: facilityFilter });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.facility.deleteMany({ where: { code: { startsWith: PREFIX } } });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    await cleanup();

    facilityId = (
      await prisma.facility.create({
        data: { code: `${PREFIX}fac`, name: 'E2E Pharm Facility', phone: '0700000000' },
      })
    ).id;

    pharmId = await seedActor('pharm', 'pharmacist');
    await seedActor('doctor', 'doctor');

    const dept = await prisma.department.create({
      data: { facilityId, code: `${PREFIX}OPD`, name: 'E2E OPD', type: 'opd' },
    });

    practitionerId = (
      await prisma.practitioner.create({
        data: { facilityId, code: `${PREFIX}DR`, firstName: 'Sara', lastName: 'Ahmadi' },
      })
    ).id;

    drugId = (
      await prisma.drug.create({
        data: {
          facilityId,
          code: `${PREFIX}DRUG`,
          genericName: 'Amoxicillin',
          sellPrice: '50',
        },
      })
    ).id;

    const patient = await prisma.patient.create({
      data: {
        facilityId,
        mrn: `${PREFIX}MRN1`,
        prefix: 'Mr.',
        firstName: 'Bilal',
        lastName: 'Khan',
        gender: 'male',
        estimatedAgeYears: 40,
        ageRecordedAt: new Date(),
      },
    });
    patientId = patient.id;

    // The patient's allergies — one live, one retracted — the other half of what R6 grants.
    await prisma.allergy.create({
      data: {
        patientId,
        substance: 'Penicillin',
        reaction: 'Rash',
        severity: 'severe',
        isActive: true,
      },
    });
    await prisma.allergy.create({
      data: {
        patientId,
        substance: 'Sulfa (old)',
        severity: 'mild',
        isActive: false,
      },
    });

    // The one that should show: an active prescription on a live visit, two drugs, with a
    // per-line allergy override and a per-sheet interaction acknowledgement.
    detailPrescriptionId = await seedPrescription(facilityId, patientId, dept.id, practitionerId, drugId, {
      visitNo: `${PREFIX}V1`,
      visitStatus: 'arrived',
      status: 'active',
      drugs: ['Amoxicillin 500mg', 'Paracetamol 500mg'],
      interactionAckReason: 'Monitored',
      overrideReason: 'Benefit outweighs risk',
    });

    // Already dispensed — completed — so it is off the queue.
    await seedPrescription(facilityId, patientId, dept.id, practitionerId, drugId, {
      visitNo: `${PREFIX}V2`,
      visitStatus: 'completed',
      status: 'completed',
      drugs: ['Ibuprofen'],
    });

    // Active, but its visit was cancelled — gone from the queue.
    await seedPrescription(facilityId, patientId, dept.id, practitionerId, drugId, {
      visitNo: `${PREFIX}V3`,
      visitStatus: 'cancelled',
      status: 'active',
      drugs: ['Metformin'],
    });

    // A separate active prescription for the dispense flow (task 6.10): two priced lines.
    dispensePrescriptionId = await seedPrescription(
      facilityId,
      patientId,
      dept.id,
      practitionerId,
      drugId,
      {
        visitNo: `${PREFIX}V4`,
        visitStatus: 'arrived',
        status: 'active',
        drugs: ['Amoxicillin 500mg', 'Vitamin C'],
      },
    );

    // Another active prescription, for the medicine return (task 6.11): one 50 line.
    returnPrescriptionId = await seedPrescription(
      facilityId,
      patientId,
      dept.id,
      practitionerId,
      drugId,
      {
        visitNo: `${PREFIX}V5`,
        visitStatus: 'arrived',
        status: 'active',
        drugs: ['Amoxicillin 500mg'],
      },
    );

    // A prescription dispensed TWO DAYS AGO with its (unpaid) pharmacy bill — outside the R5
    // return window, so even the pharmacist cannot return it.
    const oldVisit = await prisma.visit.create({
      data: {
        facilityId,
        patientId,
        departmentId: dept.id,
        visitNo: `${PREFIX}V6`,
        type: 'opd_consult',
        status: 'completed',
      },
    });
    const oldRx = await prisma.prescription.create({
      data: {
        visitId: oldVisit.id,
        practitionerId,
        status: 'completed',
        dispensedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
        dispensedBy: pharmId,
        items: {
          create: {
            drugId,
            drugNameAtTime: 'Old drug',
            frequency: 'OD',
            duration: '5 days',
            route: 'oral',
            sequence: 0,
          },
        },
      },
      select: { id: true, items: { select: { id: true } } },
    });
    oldDispensedId = oldRx.id;
    await prisma.invoice.create({
      data: {
        facilityId,
        patientId,
        visitId: oldVisit.id,
        createdBy: pharmId,
        invoiceNo: `${PREFIX}INVOLD`,
        subtotal: '50',
        total: '50',
        paidAmount: '0',
        status: 'issued',
        items: {
          create: {
            refType: 'prescription_item',
            refId: oldRx.items[0].id,
            description: 'Old drug',
            quantity: 1,
            unitPrice: '50',
            total: '50',
          },
        },
      },
    });

    // Another facility's active order — never seen here.
    const otherFacilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}fac2`, name: 'E2E Other' } })
    ).id;
    const otherDept = await prisma.department.create({
      data: { facilityId: otherFacilityId, code: `${PREFIX}OPD2`, name: 'E2E OPD2', type: 'opd' },
    });
    const otherPract = await prisma.practitioner.create({
      data: { facilityId: otherFacilityId, code: `${PREFIX}DR2`, firstName: 'Omar', lastName: 'Zia' },
    });
    const otherPatient = await prisma.patient.create({
      data: {
        facilityId: otherFacilityId,
        mrn: `${PREFIX}MRN2`,
        firstName: 'Other',
        gender: 'female',
        estimatedAgeYears: 30,
        ageRecordedAt: new Date(),
      },
    });
    const otherVisit = await prisma.visit.create({
      data: {
        facilityId: otherFacilityId,
        patientId: otherPatient.id,
        departmentId: otherDept.id,
        visitNo: `${PREFIX}OV1`,
        type: 'opd_consult',
        status: 'arrived',
      },
    });
    otherPrescriptionId = (
      await prisma.prescription.create({
        data: {
          visitId: otherVisit.id,
          practitionerId: otherPract.id,
          status: 'active',
          items: {
            create: {
              drugId: (
                await prisma.drug.create({
                  data: {
                    facilityId: otherFacilityId,
                    code: `${PREFIX}DRUG2`,
                    genericName: 'Aspirin',
                  },
                })
              ).id,
              drugNameAtTime: 'Aspirin',
              frequency: 'OD',
              duration: '3 days',
              route: 'oral',
            },
          },
        },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  const queue = (as: string) =>
    request(server).get('/pharmacy/queue').set('Authorization', `Bearer ${tokens[as]}`);

  it('the done-when: the pharmacist sees the active orders, drugs and prescriber', async () => {
    const body = (await queue('pharm').expect(200)).body as PharmacyQueueResponse;

    const row = body.items.find((i) => i.visitNo === `${PREFIX}V1`);
    expect(row).toBeDefined();
    expect(row!.patientName).toBe('Mr. Bilal Khan');
    expect(row!.patientMrn).toBe(`${PREFIX}MRN1`);
    expect(row!.ageYears).toBe(40);
    expect(row!.practitionerName).toBe('Sara Ahmadi');
    expect(row!.itemCount).toBe(2);
    expect(row!.summary).toContain('Amoxicillin 500mg');
  });

  it('leaves out dispensed, cancelled and other facilities', async () => {
    const body = (await queue('pharm').expect(200)).body as PharmacyQueueResponse;
    const visitNos = body.items.map((i) => i.visitNo);
    expect(visitNos).not.toContain(`${PREFIX}V2`); // completed
    expect(visitNos).not.toContain(`${PREFIX}V3`); // cancelled visit
    expect(visitNos).not.toContain(`${PREFIX}OV1`); // other facility
  });

  const detail = (as: string, id: string) =>
    request(server).get(`/pharmacy/prescriptions/${id}`).set('Authorization', `Bearer ${tokens[as]}`);
  const dispense = (as: string, id: string) =>
    request(server)
      .post(`/pharmacy/prescriptions/${id}/dispense`)
      .set('Authorization', `Bearer ${tokens[as]}`);
  const pay = (as: string, invoiceId: string, body: unknown) =>
    request(server)
      .post(`/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${tokens[as]}`)
      .send(body);
  const returnRx = (as: string, id: string, body: unknown) =>
    request(server)
      .post(`/pharmacy/prescriptions/${id}/return`)
      .set('Authorization', `Bearer ${tokens[as]}`)
      .send(body);

  it('the done-when (6.9): opens a prescription to drugs + allergies, and NOTHING else', async () => {
    const body = (await detail('pharm', detailPrescriptionId).expect(200))
      .body as PharmacyPrescription;

    // The drugs, with the per-line allergy override and the per-sheet interaction ack.
    expect(body.items).toHaveLength(2);
    expect(body.items[0].drugName).toBe('Amoxicillin 500mg');
    expect(body.items[0].allergyOverrideReason).toBe('Benefit outweighs risk');
    expect(body.interactionAckReason).toBe('Monitored');

    // The allergies — active first, most severe first; the retracted one is present but last.
    expect(body.allergies[0].isActive).toBe(true);
    expect(body.allergies[0].substance).toBe('Penicillin');
    expect(body.allergies[0].severity).toBe('severe');
    expect(body.allergies.some((a) => !a.isActive)).toBe(true);

    // R6, verified structurally: the payload carries ONLY the drugs-and-allergies shape —
    // no diagnosis, complaint, note or vital field can be present because none is a key here.
    expect(Object.keys(body).sort()).toEqual(
      [
        'advice',
        'allergies',
        'interactionAckReason',
        'items',
        'orderedAt',
        'patient',
        'practitionerName',
        'prescriptionId',
        'status',
        'visitNo',
      ].sort(),
    );
  });

  it('404s a prescription in another facility', async () => {
    await detail('pharm', otherPrescriptionId).expect(404);
  });

  it('the done-when (6.10): dispensing raises a priced pharmacy bill, paid at the till', async () => {
    // Two lines at 50 each — priced from the formulary, not sent by the caller.
    const bill = (await dispense('pharm', dispensePrescriptionId).expect(200))
      .body as DispenseResponse;
    expect(bill.items).toHaveLength(2);
    expect(bill.items[0].unitPrice).toBe('50.00');
    expect(bill.total).toBe('100.00');
    expect(bill.status).toBe('issued');
    expect(bill.outstanding).toBe('100.00');

    // The bill is a pharmacy-origin invoice: its lines are prescription_item.
    const invoiceItems = await prisma.invoiceItem.findMany({
      where: { invoiceId: bill.invoiceId },
      select: { refType: true },
    });
    expect(invoiceItems.every((i) => i.refType === 'prescription_item')).toBe(true);

    // The prescription is dispensed and off the queue.
    const rx = await prisma.prescription.findUniqueOrThrow({
      where: { id: dispensePrescriptionId },
      select: { status: true, dispensedAt: true, dispensedBy: true },
    });
    expect(rx.status).toBe('completed');
    expect(rx.dispensedAt).not.toBeNull();
    expect(rx.dispensedBy).not.toBeNull();
    const stillQueued = (await queue('pharm').expect(200)).body as PharmacyQueueResponse;
    expect(stillQueued.items.map((i) => i.visitNo)).not.toContain(`${PREFIX}V4`);

    // The patient pays for the medicine at the pharmacy till.
    const paid = (await pay('pharm', bill.invoiceId, { amount: '100', method: 'cash' }).expect(200))
      .body as RecordPaymentResponse;
    expect(paid.status).toBe('paid');
    expect(paid.payment.receiptNo).toMatch(/^RCP-/);

    // Dispensing the same sheet again is refused.
    const again = (await dispense('pharm', dispensePrescriptionId).expect(400)).body as {
      code?: string;
    };
    expect(again.code).toBe('already_dispensed');
  });

  it('the done-when (6.11): an unopened box comes back same-day, the money goes back', async () => {
    // Dispense and pay for the medicine today.
    const bill = (await dispense('pharm', returnPrescriptionId).expect(200))
      .body as DispenseResponse;
    await pay('pharm', bill.invoiceId, { amount: '50', method: 'cash' }).expect(200);

    // Return it: the bill is cancelled and the money reversed.
    const ret = (
      await returnRx('pharm', returnPrescriptionId, { reason: 'Unopened, wrong medicine' }).expect(
        200,
      )
    ).body as ReturnMedicineResponse;
    expect(ret.refundedAmount).toBe('50.00');
    expect(ret.refundReceiptNo).toMatch(/^RCP-/);
    expect(ret.status).toBe('cancelled');

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: bill.invoiceId },
      select: { status: true, paidAmount: true, payments: { select: { amount: true } } },
    });
    expect(invoice.status).toBe('cancelled');
    expect(invoice.paidAmount.toFixed(2)).toBe('0.00');
    // The original payment stands and a negative reversal was appended.
    expect(invoice.payments.some((p) => p.amount.toFixed(2) === '-50.00')).toBe(true);

    // A second return is refused.
    const again = (
      await returnRx('pharm', returnPrescriptionId, { reason: 'again' }).expect(400)
    ).body as { code?: string };
    expect(again.code).toBe('already_returned');
  });

  it('holds the R5 window and requires a reason', async () => {
    // Dispensed two days ago — outside the same-day window even for the pharmacist.
    const closed = (
      await returnRx('pharm', oldDispensedId, { reason: 'Too late' }).expect(403)
    ).body as { code?: string };
    expect(closed.code).toBe('outside_r5_window');
    // No reason — refused at the contract.
    await returnRx('pharm', dispensePrescriptionId, { reason: ' ' }).expect(400);
  });

  it('denies a doctor — pharmacy queue, dispense and return are not theirs', async () => {
    await queue('doctor').expect(403);
    await detail('doctor', detailPrescriptionId).expect(403);
    await dispense('doctor', detailPrescriptionId).expect(403);
    await returnRx('doctor', returnPrescriptionId, { reason: 'nope' }).expect(403);
  });

  const search = (q: string, as = 'pharm') =>
    request(server)
      .get(`/pharmacy/prescriptions?q=${encodeURIComponent(q)}`)
      .set('Authorization', `Bearer ${tokens[as]}`);

  it('the pharmacist finds a prescription by MRN or by name — not the whole patient register', async () => {
    const byMrn = (await search(`${PREFIX}MRN1`).expect(200)).body as {
      items: { patientMrn: string }[];
    };
    expect(byMrn.items.length).toBeGreaterThan(0);
    expect(byMrn.items.every((i) => i.patientMrn === `${PREFIX}MRN1`)).toBe(true);

    const byName = (await search('Bilal').expect(200)).body as { items: { patientMrn: string }[] };
    expect(byName.items.some((i) => i.patientMrn === `${PREFIX}MRN1`)).toBe(true);
  });

  it('finds a prescription no longer on the active queue — a search is not the queue', async () => {
    const body = (await search(`${PREFIX}MRN1`).expect(200)).body as {
      items: { visitNo: string; status?: string }[];
    };
    const dispensed = body.items.find((i) => i.visitNo === `${PREFIX}V2`);
    expect(dispensed).toBeDefined();
    expect(dispensed!.status).toBe('completed');
  });

  it('denies a doctor — pharmacy.read_queue gates the search too', () =>
    search(`${PREFIX}MRN1`, 'doctor').expect(403));
});
