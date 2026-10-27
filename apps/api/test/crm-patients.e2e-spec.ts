import { crmPatientMappingSchema, LoginResponse } from '@redmars/shared';
import { randomUUID, createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { facilityDateString } from '../src/common/facility-time';
describe('CRM lead patient linking', () => {
  jest.setTimeout(60000);
  const db = new PrismaClient(),
    prefix = 'crm8_' + randomUUID();
  let app: INestApplication<App>,
    server: App,
    facilityId: string,
    otherId: string,
    departmentId: string,
    providerId: string,
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
  let leadId: string;
  const input = (extra: object = {}) => ({
    linkId,
    expectedVersion: 0,
    identityConfirmed: true,
    duplicateReviewed: true,
    idempotencyKey: randomUUID(),
    ...extra,
  });
  const path = () => '/crm/leads/' + leadId + '/patient';
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
    await db.userRole.create({
      data: {
        userId: users.admin,
        roleId: (await db.role.findUniqueOrThrow({ where: { code: 'receptionist' } })).id,
      },
    });
    tokens.admin = (
      (
        await request(server)
          .post('/auth/login')
          .send({ username: prefix + 'admin', password })
      ).body as LoginResponse
    ).accessToken;
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
    await db.crmLeadPatient.deleteMany({ where: { facilityId } });
    await db.crmLeadStatusChange.deleteMany({ where: { facilityId } });
    await db.crmLead.deleteMany({ where: { facilityId } });
    leadId = (
      await db.crmLead.create({
        data: {
          facilityId,
          title: 'Synthetic inquiry',
          contactId,
          ownerId: users.agent,
          source: 'referral',
          sourceDetail: 'Original source',
          serviceInterest: 'OPD',
          status: 'qualified',
          needsConfirmed: true,
          serviceMatched: true,
          qualificationNotes: '',
        },
      })
    ).id;
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
    await db.crmLeadPatient.deleteMany({ where });
    await db.crmLeadStatusChange.deleteMany({ where });
    await db.crmLead.deleteMany({ where });
    await db.crmRelationship.deleteMany({ where });
    await db.crmContact.deleteMany({ where });
    await db.patient.deleteMany({ where });
    await db.numberSequence.deleteMany({ where });
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
  it('enforces roles, facility boundaries and module flags', async () => {
    await request(server).get(path()).expect(401);
    await req('get', path(), undefined, 'doctor').expect(403);
    await req('get', path(), undefined, 'other').expect(404);
    await db.facilityModule.update({
      where: { facilityId_module: { facilityId, module: 'crm' } },
      data: { enabled: false },
    });
    await req('post', path() + '/link', input()).expect(403);
    await db.facilityModule.update({
      where: { facilityId_module: { facilityId, module: 'crm' } },
      data: { enabled: true },
    });
  });
  it('links one stable patient and preserves source/history on retries', async () => {
    const body = input();
    const a = await req('post', path() + '/link', body).expect(201);
    const again = await req('post', path() + '/link', body).expect(201);
    expect(crmPatientMappingSchema.parse(again.body).current?.id).toBe(
      crmPatientMappingSchema.parse(a.body).current?.id,
    );
    const d = crmPatientMappingSchema.parse(a.body);
    expect(d.current?.patient?.id).toBe(patientId);
    expect(d.history).toHaveLength(1);
    expect(d.expectedVersion).toBe(1);
    const lead = await db.crmLead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.sourceDetail).toBe('Original source');
    expect(lead.status).toBe('qualified');
    expect(await db.patient.count({ where: { id: patientId } })).toBe(1);
    expect(JSON.stringify(a.body)).not.toMatch(/phone|diagnosis|clinicalNote|address/);
  });
  it('requires explicit identity and duplicate review and rejects unknown fields', async () => {
    await req('post', path() + '/link', input({ identityConfirmed: false })).expect(400);
    await req('post', path() + '/link', input({ duplicateReviewed: false })).expect(400);
    await req('post', path() + '/link', input({ patientId })).expect(400);
  });
  it('hides patient identity after verification expires and blocks retry', async () => {
    const body = input();
    await req('post', path() + '/link', body).expect(201);
    await db.crmVerification.updateMany({
      where: { facilityId },
      data: { expiresAt: new Date(0) },
    });
    const d = crmPatientMappingSchema.parse((await req('get', path()).expect(200)).body);
    expect(d.current?.patient).toBeNull();
    expect(d.history[0].patient).toBeNull();
    expect(d.candidates).toHaveLength(0);
    await req('post', path() + '/link', body).expect(403);
  });
  it('rejects changed contact identity, revoked relationships and deceased patients', async () => {
    await db.crmContact.update({ where: { id: contactId }, data: { version: 2 } });
    await req('post', path() + '/link', input()).expect(403);
    await db.crmContact.update({ where: { id: contactId }, data: { version: 1 } });
    await db.crmRelationship.update({ where: { id: linkId }, data: { authority: 'revoked' } });
    await req('post', path() + '/link', input(), 'admin').expect(403);
    await db.crmRelationship.update({ where: { id: linkId }, data: { authority: 'both' } });
    await db.patient.update({ where: { id: patientId }, data: { isDeceased: true } });
    await req('post', path() + '/link', input(), 'admin').expect(403);
    await db.patient.update({ where: { id: patientId }, data: { isDeceased: false } });
  });
  it('requires qualification, ownership and contact matching', async () => {
    await db.crmLead.update({ where: { id: leadId }, data: { status: 'contacted' } });
    await req('post', path() + '/link', input()).expect(403);
    await db.crmLead.update({
      where: { id: leadId },
      data: { status: 'qualified', ownerId: users.admin },
    });
    await req('post', path() + '/link', input()).expect(403);
    await db.crmLead.update({
      where: { id: leadId },
      data: { ownerId: users.agent, contactId: null, status: 'contacted' },
    });
    await req('post', path() + '/link', input(), 'admin').expect(403);
  });
  it('serializes simultaneous linking and rejects stale versions', async () => {
    const results = await Promise.all([
      req('post', path() + '/link', input()),
      req('post', path() + '/link', input()),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.crmLeadPatient.count({ where: { leadId, revokedAt: null } })).toBe(1);
    await req(
      'post',
      path() + '/unlink',
      { expectedVersion: 0, idempotencyKey: randomUUID(), reason: 'wrong_patient' },
      'admin',
    ).expect(409);
  });
  it('corrects mapping without deleting patient or lead; retains audit and allows relinking', async () => {
    await req('post', path() + '/link', input()).expect(201);
    const body = { expectedVersion: 1, idempotencyKey: randomUUID(), reason: 'wrong_patient' };
    await req('post', path() + '/unlink', body).expect(403);
    await req('post', path() + '/unlink', body, 'admin').expect(201);
    await req('post', path() + '/unlink', body, 'admin').expect(201);
    const d = crmPatientMappingSchema.parse((await req('get', path()).expect(200)).body);
    expect(d.current).toBeNull();
    expect(d.history[0].reason).toBe('wrong_patient');
    expect(await db.patient.findUnique({ where: { id: patientId } })).not.toBeNull();
    await req('post', path() + '/link', input({ expectedVersion: 2 })).expect(201);
    expect(await db.crmLeadPatient.count({ where: { leadId } })).toBe(2);
    expect(
      await db.auditLog.count({
        where: { facilityId, entity: 'CrmLeadPatient', userId: users.admin },
      }),
    ).toBeGreaterThan(0);
  });
  it('rejects relationships belonging to another contact and database tenant mismatches', async () => {
    const c = await db.crmContact.create({
      data: {
        facilityId,
        name: 'Other contact',
        nameKey: 'other contact',
        phone: '0712345000',
        altPhone: '',
        email: '',
        language: 'en',
        preferredChannel: 'call',
        safeInstructions: '',
        version: 1,
      },
    });
    await db.crmLead.update({ where: { id: leadId }, data: { contactId: c.id } });
    await req('post', path() + '/link', input(), 'admin').expect(403);
    await expect(
      db.crmLeadPatient.create({
        data: {
          facilityId: otherId,
          leadId,
          linkId,
          patientId,
          action: 'linked',
          createdBy: users.other,
        },
      }),
    ).rejects.toThrow();
  });
  it('keeps existing appointments when correcting a mapping', async () => {
    const a = await db.appointment.create({
      data: {
        facilityId,
        patientId,
        departmentId,
        practitionerId: providerId,
        scheduledAt: new Date(at()),
        createdBy: users.admin,
        crmLeadId: leadId,
        crmLinkId: linkId,
      },
    });
    await req('post', path() + '/link', input()).expect(201);
    await req(
      'post',
      path() + '/unlink',
      { expectedVersion: 1, idempotencyKey: randomUUID(), reason: 'wrong_lead' },
      'admin',
    ).expect(201);
    expect((await db.appointment.findUniqueOrThrow({ where: { id: a.id } })).patientId).toBe(
      patientId,
    );
  });
  const registration = () => ({
    expectedVersion: 0,
    idempotencyKey: randomUUID(),
    identityConfirmed: true,
    duplicateReviewed: true,
    relationship: 'self',
    patient: {
      firstName: 'Unique' + randomUUID().slice(0, 8),
      lastName: 'Registration',
      gender: 'male',
      phone: '0798889999',
      estimatedAgeYears: 30,
      acknowledgeDuplicate: false,
    },
  });
  it('restricts registration and registers atomically through the existing patient master', async () => {
    const body = registration();
    await req('post', path() + '/register', body).expect(403);
    await req('post', path() + '/register', body, 'reception').expect(403);
    const a = crmPatientMappingSchema.parse(
      (await req('post', path() + '/register', body, 'admin').expect(201)).body,
    );
    const b = crmPatientMappingSchema.parse(
      (await req('post', path() + '/register', body, 'admin').expect(201)).body,
    );
    expect(b.current?.patient?.id).toBe(a.current?.patient?.id);
    expect(a.current?.patient?.mrn).toMatch(/MRN/);
    const m = await db.crmLeadPatient.findFirstOrThrow({
      where: { leadId },
      include: { link: true },
    });
    expect(m.action).toBe('registered');
    expect(m.link.authority).toBe('pending');
    const agent = crmPatientMappingSchema.parse((await req('get', path()).expect(200)).body);
    expect(agent.current?.patient).toBeNull();
  });
  it('shows duplicate candidates and requires explicit override for a separate person', async () => {
    const body = registration();
    body.patient.firstName = 'Synthetic';
    body.patient.lastName = 'Patient';
    body.patient.phone = '0712345678';
    const rejected = await req('post', path() + '/register', body, 'admin').expect(409);
    expect((rejected.body as { code: string }).code).toBe('duplicate_patient');
    expect((rejected.body as { matches: unknown[] }).matches.length).toBeGreaterThan(0);
    expect(await db.crmLeadPatient.count({ where: { leadId } })).toBe(0);
    body.patient.acknowledgeDuplicate = true;
    await req('post', path() + '/register', body, 'admin').expect(201);
  });
  it('rolls back registration on stale lead version', async () => {
    const body = registration();
    body.expectedVersion = 5;
    const count = await db.patient.count({ where: { facilityId } });
    await req('post', path() + '/register', body, 'admin').expect(409);
    expect(await db.patient.count({ where: { facilityId } })).toBe(count);
  });
  it('prevents changing the contact while a mapping is active', async () => {
    await req('post', path() + '/link', input()).expect(201);
    const lead = await db.crmLead.findUniqueOrThrow({ where: { id: leadId } });
    const body = {
      title: lead.title,
      contactId: null,
      ownerId: lead.ownerId,
      serviceInterest: lead.serviceInterest,
      needsConfirmed: true,
      serviceMatched: true,
      qualificationNotes: '',
      expectedVersion: 1,
      status: 'contacted',
      closedReason: null,
      changeReason: '',
      duplicateReviewed: true,
    };
    await request(server)
      .put('/crm/leads/' + leadId)
      .set('Authorization', 'Bearer ' + tokens.admin)
      .send(body)
      .expect(409);
  });
});
