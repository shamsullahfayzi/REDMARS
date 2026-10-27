import { createHash, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  crmLeadDetailSchema,
  crmLeadListSchema,
  crmLeadOptionsSchema,
  type CrmLeadDetail,
  type LoginResponse,
} from '@redmars/shared';
import { AppModule } from '../src/app.module';

describe('CRM lead management', () => {
  jest.setTimeout(60000);
  const db = new PrismaClient(),
    prefix = `crm3_${randomUUID()}`;
  let app: INestApplication<App>, server: App, facilityId: string, otherFacilityId: string;
  const tokens: Record<string, string> = {},
    users: Record<string, string> = {};
  const fields = {
    title: 'Synthetic service inquiry',
    contactId: null,
    serviceInterest: 'Physiotherapy',
    needsConfirmed: false,
    serviceMatched: false,
    qualificationNotes: '',
  };
  const req = (method: 'get' | 'post' | 'put', path: string, body?: unknown, actor = 'agent') => {
    const call = request(server)
      [method](`/crm/leads${path}`)
      .set('Authorization', `Bearer ${tokens[actor]}`);
    return body === undefined ? call : call.send(body);
  };
  const input = (extra: object = {}) => ({
    ...fields,
    ownerId: users.agent,
    source: 'phone',
    sourceDetail: '',
    idempotencyKey: randomUUID(),
    ...extra,
  });
  const parse = (r: { body: unknown }) => crmLeadDetailSchema.parse(r.body);
  const create = async (extra: object = {}, actor = 'agent') =>
    parse(await req('post', '', input(extra), actor).expect(201));
  const editInput = (d: CrmLeadDetail, extra: object = {}) => ({
    title: d.lead.title,
    contactId: d.lead.contactId,
    ownerId: d.lead.ownerId,
    serviceInterest: d.lead.serviceInterest,
    needsConfirmed: d.lead.needsConfirmed,
    serviceMatched: d.lead.serviceMatched,
    qualificationNotes: d.lead.qualificationNotes,
    status: d.lead.status,
    closedReason: d.lead.closedReason,
    expectedVersion: d.lead.version,
    changeReason: '',
    ...extra,
  });
  const edit = async (d: CrmLeadDetail, extra: object = {}, actor = 'agent') =>
    parse(await req('put', `/${d.lead.id}`, editInput(d, extra), actor).expect(200));
  const contact = (fid = facilityId, archived = false) =>
    db.crmContact.create({
      data: {
        facilityId: fid,
        name: 'Synthetic contact',
        nameKey: 'synthetic contact',
        phone: '+93700123456',
        altPhone: '',
        email: '',
        language: 'en',
        preferredChannel: 'call',
        safeInstructions: '',
        archived,
      },
    });
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
    facilityId = (await db.facility.create({ data: { code: prefix, name: 'CRM lead fixture' } }))
      .id;
    otherFacilityId = (
      await db.facility.create({ data: { code: `${prefix}_other`, name: 'CRM foreign fixture' } })
    ).id;
    for (const fid of [facilityId, otherFacilityId])
      await db.facilityModule.create({ data: { facilityId: fid, module: 'crm', enabled: true } });
    const password = 'Synthetic-CRM3-password',
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
    await db.crmLeadStatusChange.deleteMany({ where });
    await db.crmLead.deleteMany({ where });
    await db.commandReceipt.deleteMany({ where });
    await db.crmContact.deleteMany({ where });
  });
  afterAll(async () => {
    const where = { facilityId: { in: [facilityId, otherFacilityId].filter(Boolean) } };
    await clearLimits();
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
  it('enforces authentication, roles, module activation and facility boundaries', async () => {
    await request(server).get('/crm/leads').expect(401);
    await req('get', '', undefined, 'doctor').expect(403);
    const d = await create();
    await req('get', `/${d.lead.id}`, undefined, 'other').expect(404);
    await req('put', `/${d.lead.id}`, editInput(d), 'other').expect(404);
    await req('post', '', input({ facilityId: otherFacilityId })).expect(400);
    await req('post', '', input({ patientId: randomUUID() })).expect(400);
    await db.facilityModule.update({
      where: { facilityId_module: { facilityId, module: 'crm' } },
      data: { enabled: false },
    });
    try {
      await req('get', '').expect(403);
      await req('post', '', input()).expect(403);
    } finally {
      await db.facilityModule.update({
        where: { facilityId_module: { facilityId, module: 'crm' } },
        data: { enabled: true },
      });
    }
  });
  it('creates an inquiry without registering a patient and safely replays the same submission', async () => {
    const before = await db.patient.count({ where: { facilityId } }),
      body = input({ source: 'referral', sourceDetail: 'Synthetic referral' });
    const first = parse(await req('post', '', body).expect(201)),
      second = parse(await req('post', '', body).expect(201));
    expect(second.lead.id).toBe(first.lead.id);
    expect(second.history).toHaveLength(1);
    expect(second.lead.contact).toBeNull();
    expect(second.lead.status).toBe('new');
    expect(await db.patient.count({ where: { facilityId } })).toBe(before);
    await req('post', '', { ...body, title: 'Changed submission' }).expect(409);
    const updated = await edit(first, { title: 'Revised service inquiry' });
    expect(updated.lead.source).toBe('referral');
    expect(updated.lead.sourceDetail).toBe('Synthetic referral');
    await req('put', `/${first.lead.id}`, editInput(updated, { source: 'website' })).expect(400);
  });
  it('allows one concurrent submission and a safe retry', async () => {
    const body = input({ duplicateReviewed: true });
    const responses = await Promise.all([req('post', '', body), req('post', '', body)]);
    expect(responses.map((r) => r.status)).toContain(201);
    expect(responses.every((r) => [201, 409].includes(r.status))).toBe(true);
    const replay = parse(await req('post', '', body).expect(201));
    expect(await db.crmLead.count({ where: { facilityId } })).toBe(1);
    expect(replay.history).toHaveLength(1);
  });
  it('warns on duplicate inquiries and allows an explicitly reviewed separate request', async () => {
    const c = await contact(),
      first = await create({ contactId: c.id });
    const duplicate = await req(
      'post',
      '',
      input({ contactId: c.id, title: 'Another service inquiry' }),
    ).expect(409);
    const warning = duplicate.body as { code: string; candidates: { id: string }[] };
    expect(warning.code).toBe('crm_lead_duplicates');
    expect(warning.candidates[0].id).toBe(first.lead.id);
    await create({ contactId: c.id, duplicateReviewed: true });
    // Shared phones must never auto-link or merge different family contacts.
    const family = await contact();
    await create({ contactId: family.id });
    expect(await db.crmContact.count({ where: { facilityId } })).toBe(2);
  });
  it('requires contact, owner and service confirmations and records each allowed transition', async () => {
    const c = await contact();
    let d = await create({ contactId: c.id });
    const ready = { status: 'qualified', needsConfirmed: true, serviceMatched: true };
    await req('put', `/${d.lead.id}`, editInput(d, ready)).expect(400);
    d = await edit(d, { status: 'contacted' });
    for (const extra of [
      { contactId: null },
      { ownerId: null },
      { serviceInterest: '' },
      { needsConfirmed: false },
      { serviceMatched: false },
    ])
      await req('put', `/${d.lead.id}`, editInput(d, { ...ready, ...extra })).expect(400);
    await clearLimits();
    d = await edit(d, { ...ready, qualificationNotes: 'Prefers morning services' });
    expect(d.history.map((h) => h.toStatus)).toEqual(['qualified', 'contacted', 'new']);
    expect(d.history[0].changedBy).toBe(users.agent);
    const other = await contact();
    await req('put', `/${d.lead.id}`, editInput(d, { contactId: other.id })).expect(400);
    d = await edit(d, { status: 'on_hold' });
    d = await edit(d, { status: 'qualified' });
    expect(d.lead.status).toBe('qualified');
  });
  it('restricts assignment and excludes ineligible or foreign owners', async () => {
    const options = crmLeadOptionsSchema.parse(
      (await req('get', '/options', undefined, 'admin').expect(200)).body,
    );
    expect(options.owners.map((o) => o.id).sort()).toEqual(
      [users.admin, users.agent, users.agent2].sort(),
    );
    const mine = crmLeadOptionsSchema.parse((await req('get', '/options').expect(200)).body);
    expect(mine.owners.map((o) => o.id)).toEqual([users.agent]);
    await req('post', '', input({ ownerId: users.agent2 })).expect(403);
    await req('post', '', input({ ownerId: null })).expect(403);
    for (const id of [users.other, users.doctor])
      await req('post', '', input({ ownerId: id }), 'admin').expect(400);
    await db.appUser.update({ where: { id: users.agent2 }, data: { isActive: false } });
    try {
      await req('post', '', input({ ownerId: users.agent2 }), 'admin').expect(400);
    } finally {
      await db.appUser.update({ where: { id: users.agent2 }, data: { isActive: true } });
    }
    let d = await create();
    await req('put', `/${d.lead.id}`, editInput(d, { ownerId: users.agent2 })).expect(403);
    await req('put', `/${d.lead.id}`, editInput(d), 'agent2').expect(403);
    d = await edit(d, { ownerId: users.agent2 }, 'admin');
    expect(d.lead.ownerId).toBe(users.agent2);
    expect(parse(await req('get', `/${d.lead.id}`).expect(200)).lead.canEdit).toBe(false);
  });
  it('allows exactly one agent to claim an unassigned lead', async () => {
    const d = await create({ ownerId: null }, 'admin');
    const results = await Promise.all(
      ['agent', 'agent2'].map((actor) =>
        req('post', `/${d.lead.id}/claim`, { expectedVersion: 0 }, actor),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const current = parse(await req('get', `/${d.lead.id}`).expect(200));
    expect([users.agent, users.agent2]).toContain(current.lead.ownerId);
    expect(current.lead.version).toBe(1);
  });
  it('rejects stale and concurrent edits without losing a status change', async () => {
    const d = await create();
    const changes = await Promise.all(
      ['contacted', 'on_hold'].map((status) =>
        req('put', `/${d.lead.id}`, editInput(d, { status })),
      ),
    );
    expect(changes.map((r) => r.status).sort()).toEqual([200, 409]);
    await req('put', `/${d.lead.id}`, editInput(d, { title: 'Stale edit' })).expect(409);
    const current = parse(await req('get', `/${d.lead.id}`).expect(200));
    expect(current.history).toHaveLength(2);
    expect(current.lead.version).toBe(1);
  });
  it('requires closure outcomes and restricts reopening to administrators with a reason', async () => {
    let d = await create();
    await req('put', `/${d.lead.id}`, editInput(d, { status: 'closed' })).expect(400);
    d = await edit(d, { status: 'closed', closedReason: 'resolved' });
    expect(d.history[0].reason).toBe('resolved');
    await req(
      'put',
      `/${d.lead.id}`,
      editInput(d, { status: 'new', closedReason: null, changeReason: 'More help requested' }),
    ).expect(400);
    await req(
      'put',
      `/${d.lead.id}`,
      editInput(d, { status: 'new', closedReason: null }),
      'admin',
    ).expect(400);
    d = await edit(
      d,
      { status: 'new', closedReason: null, changeReason: 'More help requested' },
      'admin',
    );
    expect(d.history[0].actorName).toBe('admin');
    expect(d.history[0].reason).toBe('More help requested');
  });
  it('rejects archived and foreign contacts and enforces database invariants', async () => {
    const foreign = await contact(otherFacilityId),
      archived = await contact(facilityId, true);
    for (const c of [foreign, archived])
      await req('post', '', input({ contactId: c.id })).expect(400);
    const c = await contact();
    let d = await create({ contactId: c.id });
    d = await edit(d, { status: 'contacted' });
    await db.crmContact.update({ where: { id: c.id }, data: { archived: true } });
    await req(
      'put',
      `/${d.lead.id}`,
      editInput(d, { status: 'qualified', needsConfirmed: true, serviceMatched: true }),
    ).expect(400);
    await expect(
      db.crmLead.create({
        data: {
          ...fields,
          sourceDetail: '',
          facilityId,
          title: 'Invalid scope',
          source: 'phone',
          contactId: foreign.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      db.crmLead.create({
        data: {
          ...fields,
          sourceDetail: '',
          facilityId,
          title: 'Invalid qualification',
          source: 'phone',
          status: 'qualified',
        },
      }),
    ).rejects.toThrow(/violates check constraint/);
  });
  it('searches and paginates only facility leads with source, status and owner filters', async () => {
    const c = await contact();
    await create({ contactId: c.id, source: 'website' });
    await create({ title: 'Unassigned inquiry', ownerId: null, source: 'email' }, 'admin');
    await db.crmLead.createMany({
      data: Array.from({ length: 26 }, (_, i) => ({
        ...fields,
        sourceDetail: '',
        facilityId,
        title: `Synthetic backlog ${i}`,
        source: 'phone',
        status: 'on_hold',
        ownerId: users.agent2,
      })),
    });
    await create({ ownerId: users.other, title: 'Foreign inquiry' }, 'other');
    const list = async (q: string) =>
      crmLeadListSchema.parse((await req('get', q).expect(200)).body);
    expect((await list('')).total).toBe(28);
    expect((await list('')).items).toHaveLength(25);
    expect((await list('?page=2')).items).toHaveLength(3);
    expect((await list('?owner=mine')).total).toBe(1);
    expect((await list('?owner=unassigned')).total).toBe(1);
    expect((await list('?source=website')).total).toBe(1);
    expect((await list('?status=on_hold')).total).toBe(26);
    for (const q of ['Synthetic%20contact', '700123456', 'Physiotherapy'])
      expect((await list(`?q=${q}&source=website`)).total).toBe(1);
  });
  it('audits changes without copying private inquiry text into audit records', async () => {
    const d = await create({
      title: 'PRIVATE-TITLE-SENTINEL',
      sourceDetail: 'PRIVATE-SOURCE-SENTINEL',
      qualificationNotes: 'PRIVATE-NOTE-SENTINEL',
    });
    await edit(d, { status: 'contacted', changeReason: 'PRIVATE-REASON-SENTINEL' });
    await req('get', `/${d.lead.id}`).expect(200);
    const logs = await db.auditLog.findMany({ where: { facilityId, entityId: d.lead.id } });
    expect(logs.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain('PRIVATE-');
    expect(serialized).toContain('[redacted]');
    const histories = await db.crmLeadStatusChange.findMany({ where: { leadId: d.lead.id } });
    const historyLogs = await db.auditLog.findMany({
      where: { facilityId, entityId: { in: histories.map((h) => h.id) } },
    });
    expect(historyLogs.length).toBeGreaterThan(0);
    expect(JSON.stringify(historyLogs)).not.toContain('PRIVATE-');
  });
});
