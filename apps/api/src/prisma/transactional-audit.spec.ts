import { redact, crmAuditSnapshot } from './transactional-audit';

describe('Audit redaction', () => {
  it('does not copy private employee files into audit snapshots', () => {
    expect(
      crmAuditSnapshot('EmployeeDocument', {
        id: 'document-id',
        employeeId: 'employee-id',
        type: 'identity',
        content: new Uint8Array([1, 2, 3]),
        fileName: 'private-name.pdf',
        title: 'Private identity',
        note: 'Private note',
        sizeBytes: 3,
      }),
    ).toEqual({
      id: 'document-id',
      employeeId: 'employee-id',
      type: 'identity',
      content: '[redacted]',
      fileName: '[redacted]',
      title: '[redacted]',
      note: '[redacted]',
      sizeBytes: 3,
    });
  });
  it('redacts task instructions and outcomes but keeps ownership and schedule', () => {
    for (const model of ['CrmTask', 'CrmTaskHistory'])
      expect(
        crmAuditSnapshot(model, {
          title: 'Private title',
          notes: 'Private instructions',
          outcome: 'Private outcome',
          reason: 'Private reason',
          ownerId: 'agent',
          dueAt: '2026-10-16T10:00:00Z',
          status: 'completed',
        }),
      ).toEqual({
        title: '[redacted]',
        notes: '[redacted]',
        outcome: '[redacted]',
        reason: '[redacted]',
        ownerId: 'agent',
        dueAt: '2026-10-16T10:00:00Z',
        status: 'completed',
      });
  });
  it('redacts call destinations and action notes while retaining completion provenance', () => {
    expect(
      crmAuditSnapshot('CrmCall', {
        callerPhone: '+93700123456',
        actionNote: 'Private action',
        completionNote: 'Private completion',
        state: 'missed',
        completedBy: 'agent',
        version: 1,
      }),
    ).toEqual({
      callerPhone: '[redacted]',
      actionNote: '[redacted]',
      completionNote: '[redacted]',
      state: 'missed',
      completedBy: 'agent',
      version: 1,
    });
  });
  it('redacts interaction revisions while retaining correction provenance', () => {
    for (const model of ['CrmInteraction', 'CrmInteractionRevision'])
      expect(
        crmAuditSnapshot(model, {
          summary: 'Private coordination',
          reason: 'Private correction',
          outcome: 'other',
          version: 2,
          changedBy: 'agent',
        }),
      ).toEqual({
        summary: '[redacted]',
        reason: '[redacted]',
        outcome: 'other',
        version: 2,
        changedBy: 'agent',
      });
  });
  it('keeps lead provenance while redacting inquiry text and status reasons', () => {
    expect(
      crmAuditSnapshot('CrmLead', {
        title: 'Private inquiry',
        qualificationNotes: 'Private note',
        sourceDetail: 'Private source',
        serviceInterest: 'Private service',
        source: 'phone',
        ownerId: 'owner',
        status: 'qualified',
      }),
    ).toEqual({
      title: '[redacted]',
      qualificationNotes: '[redacted]',
      sourceDetail: '[redacted]',
      serviceInterest: '[redacted]',
      source: 'phone',
      ownerId: 'owner',
      status: 'qualified',
    });
    expect(
      crmAuditSnapshot('CrmLeadStatusChange', {
        toStatus: 'closed',
        reason: 'Private reason',
        changedBy: 'agent',
      }),
    ).toEqual({ toStatus: 'closed', reason: '[redacted]', changedBy: 'agent' });
  });
  it('retains CRM consent decisions while removing contact details and destinations', () => {
    expect(
      crmAuditSnapshot('CrmConsent', {
        status: 'withdrawn',
        source: 'verbal',
        destination: '+93700123456',
        recordedBy: 'agent',
      }),
    ).toEqual({
      status: 'withdrawn',
      source: 'verbal',
      destination: '[redacted]',
      recordedBy: 'agent',
    });
    expect(
      crmAuditSnapshot('CrmContact', {
        name: 'Private name',
        phone: '123',
        safeInstructions: 'Private instruction',
        version: 2,
      }),
    ).toEqual({
      name: '[redacted]',
      phone: '[redacted]',
      safeInstructions: '[redacted]',
      version: 2,
    });
  });
  it('redacts credentials at every nesting level without losing business values', () => {
    expect(
      redact({
        name: 'Visible',
        passwordHash: 'secret',
        nested: [{ refreshTokenHash: 'token', amount: '25.50' }],
      }),
    ).toEqual({
      name: 'Visible',
      passwordHash: '[redacted]',
      nested: [{ refreshTokenHash: '[redacted]', amount: '25.50' }],
    });
  });
});
