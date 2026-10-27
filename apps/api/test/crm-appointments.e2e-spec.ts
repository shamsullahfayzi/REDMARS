import { randomUUID, createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AppointmentService } from '../src/modules/appointment/appointment.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { requestContext } from '../src/audit/request-context';
import {
  crmAppointmentSchema,
  crmAppointmentListSchema,
  crmAppointmentOptionsSchema,
  crmAvailabilitySchema,
  LoginResponse,
} from '@redmars/shared';
import { facilityDateString, facilityDayBoundsFor } from '../src/common/facility-time';
describe('CRM appointment integration', () => {
  jest.setTimeout(60000);
  const db = new PrismaClient(),
    prefix = 'crm7_' + randomUUID();
  let app: INestApplication<App>,
    server: App,
    facilityId: string,
    otherId: string,
    departmentId: string,
    providerId: string,
    provider2: string,
    contactId: string,
    linkId: string,
    patientId: string;
  const users: Record<string, string> = {},
    tokens: Record<string, string> = {};
  const day = facilityDateString(new Date(Date.now() + 3 * 86400000));
  const at = (time = '09:00') => new Date(`${day}T${time}:00+04:30`).toISOString();
  const req = (method: 'get' | 'post' | 'patch', path: string, body?: unknown, actor = 'agent') => {
    const r = request(server)
      [method](path)
      .set('Authorization', 'Bearer ' + tokens[actor]);
    return body === undefined ? r : r.send(body);
  };
  const input = (extra: object = {}) => ({
    linkId,
    leadId: null,
    departmentId,
    practitionerId: providerId,
    scheduledAt: at(),
    durationMinutes: 30,
    idempotencyKey: randomUUID(),
    ...extra,
  });
  const create = async (extra: object = {}) =>
    crmAppointmentSchema.parse(
      (await req('post', '/crm/appointments', input(extra)).expect(201)).body,
    );
  async function verify() {
    await db.crmVerification.create({
      data: {
        facilityId,
        contactId,
        linkId,
        method: 'identity_document',
        passed: true,
        verifiedBy: users.agent,
        contactVersion: 1,
        expiresAt: new Date(Date.now() + 900000),
      },
    });
  }
  async function limits() {
    await db.rateLimitBucket.deleteMany({
      where: {
        key: {
          in: Object.entries(users).flatMap(([actor, id]) =>
            ['crm.read', 'crm.write'].map((scope) =>
              createHash('sha256')
                .update(JSON.stringify([actor === 'other' ? otherId : facilityId, id, scope]))
                .digest('hex'),
            ),
          ),
        },
      },
    });
  }
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    await app.init();
    server = app.getHttpServer();
    facilityId = (await db.facility.create({ data: { code: prefix, name: 'CRM7 synthetic' } })).id;
    otherId = (await db.facility.create({ data: { code: prefix + '_other', name: 'CRM7 other' } }))
      .id;
    for (const fid of [facilityId, otherId])
      await db.facilityModule.create({ data: { facilityId: fid, module: 'crm', enabled: true } });
    const password = 'CRM7-test-password',
      passwordHash = await hash(password);
    for (const [actor, role] of [
      ['admin', 'admin'],
      ['agent', 'call_center'],
      ['reception', 'receptionist'],
      ['doctor', 'doctor'],
      ['other', 'admin'],
    ]) {
      const u = await db.appUser.create({
        data: {
          facilityId: actor === 'other' ? otherId : facilityId,
          username: prefix + actor,
          fullName: actor,
          passwordHash,
          userRoles: {
            create: { roleId: (await db.role.findUniqueOrThrow({ where: { code: role } })).id },
          },
        },
      });
      users[actor] = u.id;
      tokens[actor] = (
        (
          await request(server)
            .post('/auth/login')
            .send({ username: u.username, password })
            .expect(200)
        ).body as LoginResponse
      ).accessToken;
    }
    departmentId = (
      await db.department.create({ data: { facilityId, code: 'OPD', name: 'OPD', type: 'opd' } })
    ).id;
    for (const n of [1, 2]) {
      const p = await db.practitioner.create({
        data: {
          facilityId,
          code: 'P' + n,
          firstName: 'Synthetic',
          lastName: 'Provider ' + n,
          departments: { create: { departmentId } },
        },
      });
      if (n === 1) providerId = p.id;
      else provider2 = p.id;
    }
    patientId = (
      await db.patient.create({
        data: {
          facilityId,
          mrn: 'CRM7',
          firstName: 'Synthetic',
          lastName: 'Patient',
          gender: 'male',
        },
      })
    ).id;
    contactId = (
      await db.crmContact.create({
        data: {
          facilityId,
          name: 'Synthetic contact',
          nameKey: 'synthetic contact',
          phone: '',
          altPhone: '',
          email: '',
          language: 'en',
          preferredChannel: 'call',
          safeInstructions: '',
        },
      })
    ).id;
    linkId = (
      await db.crmRelationship.create({
        data: {
          facilityId,
          contactId,
          patientId,
          relationship: 'parent',
          authority: 'scheduling',
          source: 'written',
          authorizedBy: users.admin,
          authorizedAt: new Date(),
        },
      })
    ).id;
  });
  beforeEach(async () => {
    await limits();
    await db.visit.deleteMany({ where: { facilityId } });
    await db.appointment.deleteMany({ where: { facilityId } });
    await db.crmInteractionRevision.deleteMany({ where: { facilityId } });
    await db.crmInteraction.deleteMany({ where: { facilityId } });
    await db.crmVerification.deleteMany({ where: { facilityId } });
    await db.commandReceipt.deleteMany({ where: { facilityId } });
    await db.crmRelationship.update({ where: { id: linkId }, data: { authority: 'scheduling' } });
    await db.crmContact.update({ where: { id: contactId }, data: { archived: false, version: 1 } });
    await verify();
  });
  afterAll(async () => {
    await limits();
    const where = { facilityId: { in: [facilityId, otherId].filter(Boolean) } };
    await db.visit.deleteMany({ where });
    await db.appointment.deleteMany({ where });
    await db.crmInteractionRevision.deleteMany({ where });
    await db.crmInteraction.deleteMany({ where });
    await db.crmVerification.deleteMany({ where });
    await db.crmRelationship.deleteMany({ where });
    await db.crmContact.deleteMany({ where });
    await db.patient.deleteMany({ where });
    await db.practitioner.deleteMany({ where });
    await db.department.deleteMany({ where });
    await db.commandReceipt.deleteMany({ where });
    await db.auditLog.deleteMany({ where });
    await db.integrationEvent.deleteMany({ where });
    await db.errorLog.deleteMany({ where });
    await db.appUser.deleteMany({ where });
    await db.facilityModule.deleteMany({ where });
    await db.facility.deleteMany({ where: { id: where.facilityId } });
    await app?.close();
    await db.$disconnect();
  });
  it('enforces authentication, role and module flag', async () => {
    await request(server).get('/crm/appointments/options').expect(401);
    await req('get', '/crm/appointments/options', undefined, 'doctor').expect(403);
    await db.facilityModule.update({
      where: { facilityId_module: { facilityId, module: 'crm' } },
      data: { enabled: false },
    });
    await req('get', '/crm/appointments/options').expect(403);
    await db.facilityModule.update({
      where: { facilityId_module: { facilityId, module: 'crm' } },
      data: { enabled: true },
    });
  });
  it('requires current scheduling authority, contact version and active contact', async () => {
    await db.crmVerification.deleteMany({ where: { facilityId } });
    await req('post', '/crm/appointments', input()).expect(403);
    expect(
      crmAppointmentOptionsSchema.parse(
        (await req('get', '/crm/appointments/options').expect(200)).body,
      ).links,
    ).toHaveLength(0);
    await verify();
    await db.crmRelationship.update({ where: { id: linkId }, data: { authority: 'follow_up' } });
    await req('post', '/crm/appointments', input()).expect(403);
    await db.crmRelationship.update({ where: { id: linkId }, data: { authority: 'scheduling' } });
    await db.crmContact.update({ where: { id: contactId }, data: { version: 2 } });
    await req('post', '/crm/appointments', input()).expect(403);
    await db.crmContact.update({ where: { id: contactId }, data: { version: 0, archived: true } });
    await req('post', '/crm/appointments', input(), 'admin').expect(403);
  });
  it('books once and returns only scheduling fields; reception sees the same record', async () => {
    const body = input(),
      a = crmAppointmentSchema.parse(
        (await req('post', '/crm/appointments', body).expect(201)).body,
      );
    const again = crmAppointmentSchema.parse(
      (await req('post', '/crm/appointments', body).expect(201)).body,
    );
    expect(again.id).toBe(a.id);
    expect(await db.appointment.count({ where: { facilityId } })).toBe(1);
    const result = await req('get', `/crm/appointments?linkId=${linkId}&date=${day}`).expect(200);
    expect(crmAppointmentListSchema.parse(result.body).items).toHaveLength(1);
    expect(JSON.stringify(result.body)).not.toMatch(/patientPhone|reason|clinical|diagnos/i);
    const book = await req('get', '/appointments?date=' + day, undefined, 'reception').expect(200);
    expect((book.body as { appointments: { id: string }[] }).appointments[0].id).toBe(a.id);
    await req('get', '/appointments?date=' + day).expect(403);
  });
  it('filters expired access on both list and cancel, including idempotent replay', async () => {
    const body = input(),
      a = crmAppointmentSchema.parse(
        (await req('post', '/crm/appointments', body).expect(201)).body,
      );
    await db.crmVerification.updateMany({
      where: { facilityId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await req('get', `/crm/appointments?linkId=${linkId}&date=${day}`).expect(403);
    await req('post', `/crm/appointments/${a.id}/cancel`, {
      linkId,
      idempotencyKey: randomUUID(),
    }).expect(403);
    await req('post', '/crm/appointments', body).expect(403);
  });
  it('blocks cross-facility relationships and wrong provider departments', async () => {
    await req('post', '/crm/appointments', input(), 'other').expect(403);
    await req('post', '/crm/appointments', input({ practitionerId: randomUUID() })).expect(400);
    const foreign = (
      await db.department.create({
        data: { facilityId: otherId, code: 'F', name: 'Foreign', type: 'opd' },
      })
    ).id;
    await req('post', '/crm/appointments', input({ departmentId: foreign })).expect(400);
    await req('post', '/crm/appointments', input({ leadId: randomUUID() })).expect(400);
  });
  it('validates times, durations and rejects clinical fields', async () => {
    for (const extra of [
      { scheduledAt: new Date(Date.now() - 86400000).toISOString() },
      { durationMinutes: 0 },
      { durationMinutes: 241 },
      { reason: 'clinical details' },
      { scheduledAt: at('23:50'), durationMinutes: 30 },
    ])
      await req('post', '/crm/appointments', input(extra)).expect(400);
  });
  it('allows only one concurrent overlapping provider booking', async () => {
    const patient2 = await db.patient.create({
      data: { facilityId, mrn: randomUUID(), firstName: 'Other synthetic', gender: 'male' },
    });
    const link2 = await db.crmRelationship.create({
      data: {
        facilityId,
        patientId: patient2.id,
        contactId,
        relationship: 'other',
        authority: 'scheduling',
        source:'written', authorizedBy:users.admin, authorizedAt:new Date(),
      },
    });
    await db.crmVerification.create({
      data: {
        facilityId,
        contactId,
        linkId: link2.id,
        method: 'identity_document',
        passed: true,
        verifiedBy: users.agent,
        contactVersion: 1,
        expiresAt: new Date(Date.now() + 900000),
      },
    });
    const outcomes = await Promise.all([
      req('post', '/crm/appointments', input()),
      req('post', '/crm/appointments', input({ linkId: link2.id, scheduledAt: at('09:15') })),
    ]);
    expect(outcomes.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.appointment.count({ where: { facilityId } })).toBe(1);
  });
  it('blocks patient overlap across providers; permits adjacent intervals', async () => {
    await create();
    await req(
      'post',
      '/crm/appointments',
      input({ practitionerId: provider2, scheduledAt: at('09:15') }),
    ).expect(409);
    await create({ scheduledAt: at('09:30') });
    const busy = crmAvailabilitySchema.parse(
      (
        await req(
          'get',
          `/crm/appointments/availability?practitionerId=${providerId}&date=${day}`,
        ).expect(200)
      ).body,
    );
    expect(busy.busy).toHaveLength(2);
    expect(JSON.stringify(busy)).not.toContain(patientId);
  });
  it('respects bookings created through reception and blocks legacy mixed scheduling', async () => {
    await req(
      'post',
      '/appointments',
      { patientId, departmentId, practitionerId: providerId, scheduledOn: day },
      'reception',
    ).expect(201);
    await req('post', '/crm/appointments', input()).expect(409);
    await db.appointment.deleteMany({ where: { facilityId } });
    await create();
    await req(
      'post',
      '/appointments',
      { patientId, departmentId, practitionerId: providerId, scheduledOn: day },
      'reception',
    ).expect(409);
  });
  it('syncs reception cancellation and allows rebooking the released interval', async () => {
    const a = await create();
    await req('patch', `/appointments/${a.id}/close`, { status: 'cancelled' }, 'reception').expect(
      200,
    );
    const list = crmAppointmentListSchema.parse(
      (await req('get', `/crm/appointments?linkId=${linkId}&date=${day}`).expect(200)).body,
    );
    expect(list.items[0].status).toBe('cancelled');
    await create();
  });
  it('cancels idempotently and never cancels fulfilled appointments', async () => {
    const a = await create(),
      body = { linkId, idempotencyKey: randomUUID() };
    await req('post', `/crm/appointments/${a.id}/cancel`, body).expect(201);
    await req('post', `/crm/appointments/${a.id}/cancel`, body).expect(201);
    const b = await create();
    await db.appointment.update({ where: { id: b.id }, data: { status: 'fulfilled' } });
    await req('post', `/crm/appointments/${b.id}/cancel`, {
      linkId,
      idempotencyKey: randomUUID(),
    }).expect(400);
  });
  it('database exclusion rejects overlapping direct writes', async () => {
    await create();
    await expect(
      db.appointment.create({
        data: {
          facilityId,
          patientId,
          departmentId,
          practitionerId: providerId,
          scheduledAt: new Date(at()),
          endsAt: new Date(new Date(at()).getTime() + 1800000),
        },
      }),
    ).rejects.toThrow();
    expect(facilityDayBoundsFor(day).start < new Date(at())).toBe(true);
  });
  it('does not leave a cancelled booking linked to a visit during a check-in race', async () => {
    const a = await create();
    const visit = await db.visit.create({
      data: {
        facilityId,
        patientId,
        departmentId,
        practitionerId: providerId,
        visitNo: randomUUID(),
        type: 'opd_consult',
      },
    });
    await Promise.allSettled([
      req('post', `/crm/appointments/${a.id}/cancel`, { linkId, idempotencyKey: randomUUID() }),
      requestContext.run({ facilityId, userId: users.reception }, () =>
        app
          .get(PrismaService)
          .db.$transaction((tx) =>
            app
              .get(AppointmentService)
              .fulfilOnArrival(facilityId, patientId, visit.id, tx, new Date(at())),
          ),
      ),
    ]);
    const row = await db.appointment.findUniqueOrThrow({
      where: { id: a.id },
      include: { visit: true },
    });
    expect(['cancelled', 'fulfilled']).toContain(row.status);
    expect(row.visit?.id ?? null).toBe(row.status === 'fulfilled' ? visit.id : null);
  });
  it('retains audit provenance without placing clinical text in CRM responses', async () => {
    const a = await create();
    await db.appointment.update({
      where: { id: a.id },
      data: { reason: 'PRIVATE clinical reason' },
    });
    const result = await req('get', `/crm/appointments?linkId=${linkId}&date=${day}`).expect(200);
    expect(JSON.stringify(result.body)).not.toContain('PRIVATE');
    const logs = await db.auditLog.findMany({
      where: { facilityId, entity: 'Appointment', entityId: a.id },
    });
    expect(logs.some((l) => l.action === 'create' && l.userId === users.agent)).toBe(true);
  });
});
