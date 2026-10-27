import { createHash, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  crmTaskListSchema,
  crmTaskDetailSchema,
  crmCallDetailSchema,
  type LoginResponse,
} from '@redmars/shared';
import { AppModule } from '../src/app.module';
describe('CRM tasks and reminders', () => {
  jest.setTimeout(60000);
  const db = new PrismaClient(),
    prefix = 'crm6_' + randomUUID();
  let app: INestApplication<App>, server: App, facilityId: string, otherFacilityId: string;
  const users: Record<string, string> = {},
    tokens: Record<string, string> = {};
  const req = (method: 'get' | 'post' | 'put', path: string, body?: unknown, actor = 'agent') => {
    const r = request(server)
      [method]('/crm/tasks' + path)
      .set('Authorization', 'Bearer ' + tokens[actor]);
    return body === undefined ? r : r.send(body);
  };
  const contact = (fid = facilityId) =>
    db.crmContact.create({
      data: {
        facilityId: fid,
        name: 'Synthetic timeline contact',
        nameKey: 'synthetic timeline contact',
        phone: '+93700123456',
        altPhone: '',
        email: '',
        language: 'en',
        preferredChannel: 'call',
        safeInstructions: '',
      },
    });
  const input = (contactId: string | null, extra: object = {}) => ({
    contactId,
    leadId: null,
    linkId: null,
    purpose: 'enquiry',
    state: 'answered',
    callerPhone: '+93700987654',
    endedAt: new Date().toISOString(),
    nextAction: 'none',
    actionNote: '',
    relatedCallId: null,
    direction: 'inbound',
    occurredAt: new Date(Date.now() - 60000).toISOString(),
    summary: 'Synthetic coordination summary',
    outcome: 'information_given',
    idempotencyKey: randomUUID(),
    ...extra,
  });
  const parse = (res: { body: unknown }) => crmTaskDetailSchema.parse(res.body);
  const source = async (contactId: string | null = null, extra: object = {}, actor = 'agent') =>
    crmCallDetailSchema.parse(
      (
        await request(server)
          .post('/crm/calls')
          .set('Authorization', 'Bearer ' + tokens[actor])
          .send(input(contactId, extra))
          .expect(201)
      ).body,
    ).call.interaction;
  const taskInput = (interactionId: string, extra: object = {}) => ({
    interactionId,
    title: 'Synthetic assigned follow-up',
    notes: 'Arrange service information',
    ownerId: users.agent,
    dueAt: new Date(Date.now() + 86400000).toISOString(),
    reminderAt: new Date(Date.now() - 60000).toISOString(),
    priority: 'normal',
    prescriptionId: null,
    idempotencyKey: randomUUID(),
    ...extra,
  });
  const create = async (interactionId: string, extra: object = {}, actor = 'agent') =>
    parse(await req('post', '', taskInput(interactionId, extra), actor).expect(201)).task;
  const list = async (query = '', actor = 'agent') =>
    crmTaskListSchema.parse((await req('get', query, undefined, actor).expect(200)).body);
  const update = (r: import('@redmars/shared').CrmTask, extra: object = {}) => ({
    title: r.title,
    notes: r.notes,
    ownerId: r.ownerId,
    dueAt: r.dueAt,
    reminderAt: r.reminderAt,
    priority: r.priority,
    status: r.status,
    outcome: r.outcome,
    reason: 'Synthetic operational change',
    expectedVersion: r.version,
    ...extra,
  });
  async function relationship(contactId: string, authority = 'scheduling') {
    const patient = await db.patient.create({
      data: {
        facilityId,
        mrn: 'CRM6-' + randomUUID(),
        firstName: 'Synthetic',
        lastName: 'Timeline Patient',
        gender: 'male',
      },
    });
    const link = await db.crmRelationship.create({
      data: {
        facilityId,
        contactId,
        patientId: patient.id,
        relationship: 'parent',
        authority,
        source: 'written',
        authorizedBy: users.admin,
        authorizedAt: new Date(),
      },
    });
    return { patient, link };
  }
  async function verify(contactId: string, linkId: string, actor = 'agent') {
    const c = await db.crmContact.findUniqueOrThrow({ where: { id: contactId } });
    await request(server)
      .post('/crm/contacts/' + contactId + '/relationships/' + linkId + '/verify')
      .set('Authorization', 'Bearer ' + tokens[actor])
      .send({
        expectedVersion: c.version,
        method: 'identity_document',
        identityMatched: true,
        authorityMatched: true,
      })
      .expect(201);
  }
  async function clearLimits() {
    await db.rateLimitBucket.deleteMany({
      where: {
        key: {
          in: Object.entries(users).flatMap(([actor, id]) =>
            ['crm.read', 'crm.write'].map((scope) =>
              createHash('sha256')
                .update(
                  JSON.stringify([actor === 'other' ? otherFacilityId : facilityId, id, scope]),
                )
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
    facilityId = (
      await db.facility.create({ data: { code: prefix, name: 'CRM timeline fixture' } })
    ).id;
    otherFacilityId = (
      await db.facility.create({ data: { code: `${prefix}_other`, name: 'CRM foreign fixture' } })
    ).id;
    for (const fid of [facilityId, otherFacilityId])
      await db.facilityModule.create({ data: { facilityId: fid, module: 'crm', enabled: true } });
    const password = 'Synthetic-CRM6-password',
      passwordHash = await hash(password);
    for (const [actor, role] of [
      ['admin', 'admin'],
      ['agent', 'call_center'],
      ['agent2', 'call_center'],
      ['doctor', 'doctor'],
      ['other', 'admin'],
    ]) {
      const u = await db.appUser.create({
        data: {
          facilityId: actor === 'other' ? otherFacilityId : facilityId,
          username: `${prefix}_${actor}`,
          fullName: actor,
          passwordHash,
        },
      });
      users[actor] = u.id;
      await db.userRole.create({
        data: {
          userId: u.id,
          roleId: (await db.role.findUniqueOrThrow({ where: { code: role } })).id,
        },
      });
      const login = await request(server)
        .post('/auth/login')
        .send({ username: u.username, password })
        .expect(200);
      tokens[actor] = (login.body as LoginResponse).accessToken;
    }
  });
  beforeEach(async () => {
    await clearLimits();
    const where = { facilityId: { in: [facilityId, otherFacilityId] } };
    await db.crmTaskHistory.deleteMany({ where });
    await db.crmTask.deleteMany({ where });
    await db.crmCall.updateMany({ where, data: { relatedCallId: null } });
    await db.crmCall.deleteMany({ where });
    await db.crmInteractionRevision.deleteMany({ where });
    await db.crmInteraction.deleteMany({ where });
    await db.crmVerification.deleteMany({ where });
    await db.crmRelationship.deleteMany({ where });
    await db.prescription.deleteMany({ where: { visit: where } });
    await db.visit.deleteMany({ where });
    await db.practitioner.deleteMany({ where });
    await db.department.deleteMany({ where });
    await db.patient.deleteMany({ where });
    await db.setting.deleteMany({ where });
    await db.crmLeadStatusChange.deleteMany({ where });
    await db.crmLead.deleteMany({ where });
    await db.commandReceipt.deleteMany({ where });
    await db.crmContact.deleteMany({ where });
  });
  afterAll(async () => {
    const where = { facilityId: { in: [facilityId, otherFacilityId].filter(Boolean) } };
    await clearLimits();
    await db.crmTaskHistory.deleteMany({ where });
    await db.crmTask.deleteMany({ where });
    await db.crmCall.updateMany({ where, data: { relatedCallId: null } });
    await db.crmCall.deleteMany({ where });
    await db.crmInteractionRevision.deleteMany({ where });
    await db.crmInteraction.deleteMany({ where });
    await db.crmVerification.deleteMany({ where });
    await db.crmRelationship.deleteMany({ where });
    await db.prescription.deleteMany({ where: { visit: where } });
    await db.visit.deleteMany({ where });
    await db.practitioner.deleteMany({ where });
    await db.department.deleteMany({ where });
    await db.patient.deleteMany({ where });
    await db.setting.deleteMany({ where });
    await db.crmLeadStatusChange.deleteMany({ where });
    await db.crmLead.deleteMany({ where });
    await db.commandReceipt.deleteMany({ where });
    await db.crmContact.deleteMany({ where });
    await db.auditLog.deleteMany({ where });
    await db.integrationEvent.deleteMany({ where });
    await db.errorLog.deleteMany({ where });
    await db.appUser.deleteMany({ where });
    await db.facilityModule.deleteMany({ where });
    await db.facility.deleteMany({ where: { id: where.facilityId } });
    await app?.close();
    await db.$disconnect();
  });

  it('enforces authentication, role, strict input and module flags', async () => {
    await request(server).get('/crm/tasks').expect(401);
    await req('get', '', undefined, 'doctor').expect(403);
    const s = await source();
    for (const x of [
      { patientId: randomUUID() },
      { ownerId: users.other },
      { dueAt: 'invalid' },
      { priority: 'critical' },
      { prescriptionId: randomUUID() },
    ]) {
      const r = await req('post', '', taskInput(s.id, x));
      expect([400, 403, 404]).toContain(r.status);
    }
    await db.facilityModule.update({
      where: { facilityId_module: { facilityId, module: 'crm' } },
      data: { enabled: false },
    });
    try {
      await req('get', '').expect(403);
    } finally {
      await db.facilityModule.update({
        where: { facilityId_module: { facilityId, module: 'crm' } },
        data: { enabled: true },
      });
    }
  });
  it('creates assigned tasks without new patients and protects other owners', async () => {
    const s = await source(),
      r = await create(s.id);
    expect(r.ownerId).toBe(users.agent);
    expect(r.reminderDue).toBe(true);
    expect((await list()).total).toBe(1);
    expect((await list('', 'agent2')).total).toBe(0);
    expect((await list('?owner=all', 'agent2')).total).toBe(1);
    await req('put', '/' + r.id, update(r), 'agent2').expect(403);
    await req('put', '/' + r.id, update(r, { ownerId: users.agent2 })).expect(403);
    await req('post', '', taskInput(s.id, { ownerId: null })).expect(403);
    expect(await db.patient.count({ where: { facilityId } })).toBe(0);
  });
  it('validates eligible assignees and lets supervisors reassign with history', async () => {
    const s = await source();
    for (const ownerId of [users.other, users.doctor])
      await req('post', '', taskInput(s.id, { ownerId }), 'admin').expect(400);
    await db.appUser.update({ where: { id: users.agent2 }, data: { isActive: false } });
    await req('post', '', taskInput(s.id, { ownerId: users.agent2 }), 'admin').expect(400);
    await db.appUser.update({ where: { id: users.agent2 }, data: { isActive: true } });
    const r = await create(s.id);
    const changed = parse(
      await req('put', '/' + r.id, update(r, { ownerId: users.agent2 }), 'admin').expect(200),
    );
    expect(changed.task.ownerId).toBe(users.agent2);
    expect(changed.history[0].event).toBe('assigned');
    expect(changed.history[1].ownerName).toBe('agent');
    await req('put', '/' + r.id, update(changed.task)).expect(403);
  });
  it('claims unassigned tasks atomically', async () => {
    const r = await create((await source()).id, { ownerId: null }, 'admin');
    const results = await Promise.all([
      req('post', '/' + r.id + '/claim', { expectedVersion: 0 }),
      req('post', '/' + r.id + '/claim', { expectedVersion: 0 }, 'agent2'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const detail = parse(await req('get', '/' + r.id).expect(200));
    expect(detail.history).toHaveLength(2);
    expect(detail.history[0].event).toBe('claimed');
  });
  it('requires closure outcomes and rejects concurrent closure and unauthorized reopening', async () => {
    const r = await create((await source()).id);
    await req('put', '/' + r.id, update(r, { status: 'completed' })).expect(400);
    const body = update(r, { status: 'completed', outcome: 'Service enquiry resolved' });
    const results = await Promise.all([req('put', '/' + r.id, body), req('put', '/' + r.id, body)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const closed = parse(await req('get', '/' + r.id).expect(200)).task;
    expect(closed.closedAt).not.toBeNull();
    expect(closed.reminderDue).toBe(false);
    await req('put', '/' + r.id, update(closed, { status: 'open', outcome: '' })).expect(403);
    const reopened = parse(
      await req('put', '/' + r.id, update(closed, { status: 'open', outcome: '' }), 'admin').expect(
        200,
      ),
    );
    expect(reopened.task.closedAt).toBeNull();
    expect(reopened.history[0].event).toBe('reopened');
  });
  it('persists a single reminder acknowledgement and resets only when the schedule or owner changes', async () => {
    const r = await create((await source()).id);
    expect((await list('?queue=reminders')).total).toBe(1);
    const results = await Promise.all([
      req('post', '/' + r.id + '/acknowledge', { expectedVersion: 0 }),
      req('post', '/' + r.id + '/acknowledge', { expectedVersion: 0 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    let current = parse(await req('get', '/' + r.id).expect(200)).task;
    expect((await list('?queue=reminders')).total).toBe(0);
    await req('post', '/' + r.id + '/acknowledge', { expectedVersion: current.version }).expect(
      409,
    );
    current = parse(
      await req('put', '/' + r.id, update(current, { notes: 'Additional instructions' })).expect(
        200,
      ),
    ).task;
    expect(current.reminderAcknowledgedAt).not.toBeNull();
    current = parse(
      await req(
        'put',
        '/' + r.id,
        update(current, { dueAt: new Date(Date.now() + 172800000).toISOString() }),
      ).expect(200),
    ).task;
    expect(current.reminderAcknowledgedAt).toBeNull();
    expect(current.reminderDue).toBe(true);
  });
  it('compares absolute due instants and filters overdue, priority and escalation', async () => {
    const s = await source(),
      past = new Date(Date.now() - 60000).toISOString(),
      r = await create(s.id, { dueAt: past, reminderAt: null, priority: 'high' });
    expect(r.overdue).toBe(true);
    expect((await list('?queue=overdue&priority=high')).total).toBe(1);
    const equivalent = new Date(Date.parse(past) + 16200000).toISOString().replace('Z', '+04:30');
    const changed = parse(
      await req('put', '/' + r.id, update(r, { dueAt: equivalent })).expect(200),
    ).task;
    expect(changed.dueAt).toBe(past);
    const escalated = parse(
      await req('post', '/' + r.id + '/escalate', {
        expectedVersion: changed.version,
        reason: 'Staffed escalation requested',
      }).expect(201),
    );
    expect(escalated.task.priority).toBe('urgent');
    expect(escalated.task.escalations).toBe(1);
    expect((await list('?queue=escalated')).total).toBe(1);
    expect(escalated.history[0].reason).toBe('Staffed escalation requested');
  });
  it('rejects schedules outside source retention and reminders after due time', async () => {
    const s = await source();
    await req('post', '', taskInput(s.id, { dueAt: s.expiresAt })).expect(400);
    await req(
      'post',
      '',
      taskInput(s.id, { reminderAt: new Date(Date.now() + 172800000).toISOString() }),
    ).expect(400);
    const r = await create(s.id, { reminderAt: new Date(Date.now() + 60000).toISOString() });
    await req('post', '/' + r.id + '/acknowledge', { expectedVersion: 0 }).expect(409);
  });
  it('applies patient caller-check and facility filters to tasks, counts, history and reminders', async () => {
    const c = await contact(),
      { link } = await relationship(c.id),
      s = await source(c.id, { linkId: link.id, purpose: 'scheduling' }, 'admin'),
      r = await create(s.id, {}, 'admin');
    expect((await list()).total).toBe(0);
    await req('get', '/' + r.id).expect(404);
    await req('post', '/' + r.id + '/acknowledge', { expectedVersion: 0 }).expect(404);
    await req('get', '/' + r.id, undefined, 'other').expect(404);
    await verify(c.id, link.id);
    expect((await list()).total).toBe(1);
    await req('get', '/' + r.id).expect(200);
    await db.crmVerification.updateMany({
      where: { facilityId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await list('?queue=reminders')).total).toBe(0);
    await req('get', '/' + r.id).expect(404);
    await db.crmRelationship.update({ where: { id: link.id }, data: { authority: 'revoked' } });
    await req('get', '/' + r.id, undefined, 'admin').expect(404);
  });
  it('is idempotent and hides tasks when their source is withdrawn or expires', async () => {
    const s = await source(),
      body = taskInput(s.id),
      a = parse(await req('post', '', body).expect(201)),
      b = parse(await req('post', '', body).expect(201));
    expect(a.task.id).toBe(b.task.id);
    await req('post', '', { ...body, title: 'Changed retry' }).expect(409);
    await db.crmInteraction.update({ where: { id: s.id }, data: { voided: true } });
    expect((await list()).total).toBe(0);
    await req('get', '/' + a.task.id).expect(404);
    await db.crmInteraction.update({
      where: { id: s.id },
      data: {
        voided: false,
        occurredAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await req('get', '/' + a.task.id).expect(404);
  });
  it('links only the authorized patient clinical follow-up and exposes no prescription advice', async () => {
    const c = await contact(),
      { link, patient } = await relationship(c.id, 'follow_up');
    const department = await db.department.create({
      data: { facilityId, code: 'CRM6', name: 'Synthetic', type: 'opd' },
    });
    const practitioner = await db.practitioner.create({
      data: { facilityId, code: 'CRM6', firstName: 'Synthetic', lastName: 'Doctor' },
    });
    const visit = await db.visit.create({
      data: {
        facilityId,
        patientId: patient.id,
        departmentId: department.id,
        practitionerId: practitioner.id,
        visitNo: 'CRM6-' + randomUUID(),
        type: 'opd_consult',
      },
    });
    const prescription = await db.prescription.create({
      data: {
        visitId: visit.id,
        practitionerId: practitioner.id,
        followUpDate: new Date('2026-10-20'),
        advice: 'PRIVATE-CLINICAL-ADVICE',
      },
    });
    const s = await source(c.id, { linkId: link.id, purpose: 'follow_up' }, 'admin');
    await req('get', '/follow-ups/' + s.id).expect(404);
    await verify(c.id, link.id);
    const options = await req('get', '/follow-ups/' + s.id).expect(200);
    expect(options.body).toEqual({ items: [{ id: prescription.id, followUpDate: '2026-10-20' }] });
    const r = await create(s.id, { prescriptionId: prescription.id });
    expect(r.followUpDate).toBe('2026-10-20');
    expect(JSON.stringify(r)).not.toContain('PRIVATE-CLINICAL');
    const general = await source(c.id);
    await req('post', '', taskInput(general.id, { prescriptionId: prescription.id })).expect(403);
    const otherContact = await contact(),
      other = await relationship(otherContact.id, 'follow_up');
    const otherSource = await source(
      otherContact.id,
      { linkId: other.link.id, purpose: 'follow_up' },
      'admin',
    );
    await req(
      'post',
      '',
      taskInput(otherSource.id, { prescriptionId: prescription.id }),
      'admin',
    ).expect(404);
    await req('get', '/follow-ups/' + s.id, undefined, 'other').expect(404);
    expect(
      (await db.prescription.findUniqueOrThrow({ where: { id: prescription.id } })).advice,
    ).toBe('PRIVATE-CLINICAL-ADVICE');
  });
  it('redacts task instructions, closure outcomes and history from audit snapshots', async () => {
    const r = await create((await source()).id, { title: 'PRIVATE-TITLE', notes: 'PRIVATE-NOTES' });
    await req(
      'put',
      '/' + r.id,
      update(r, { status: 'completed', outcome: 'PRIVATE-OUTCOME', reason: 'PRIVATE-REASON' }),
    ).expect(200);
    await req('get', '/' + r.id).expect(200);
    const logs = await db.auditLog.findMany({
      where: { facilityId, entity: { in: ['CrmTask', 'CrmTaskHistory'] } },
    });
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain('PRIVATE-');
    expect(JSON.stringify(logs)).toContain('[redacted]');
    expect(logs.some((l) => l.action === 'read')).toBe(true);
  });
});
