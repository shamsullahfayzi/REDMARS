import { ConflictException } from '@nestjs/common';
import { AuditAction, Prisma, PrismaClient } from '@prisma/client';
import { requestContext } from '../audit/request-context';

const writes = new Set([
  'create',
  'update',
  'delete',
  'upsert',
  'createMany',
  'createManyAndReturn',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
]);
const excluded = new Set([
  'AuditLog',
  'ErrorLog',
  'IntegrationEvent',
  'IntegrationReceipt',
  'CommandReceipt',
  'FinanceAudit',
]);
const eventModels = new Set([
  'Invoice',
  'Payment',
  'AppUser',
  'Practitioner',
  'Department',
  'Visit',
]);
const eventFields = new Set([
  'id',
  'facilityId',
  'patientId',
  'visitId',
  'invoiceId',
  'userId',
  'departmentId',
  'practitionerId',
  'status',
  'type',
  'subtotal',
  'discount',
  'total',
  'paidAmount',
  'currency',
  'amount',
  'method',
  'receiptNo',
  'invoiceNo',
  'isReversed',
  'isActive',
  'deletedAt',
  'receivedAt',
  'startedAt',
  'endedAt',
  'panelId',
  'receivedBy',
  'createdBy',
  'createdAt',
  'items',
]);
type Row = Record<string, unknown>;
type Delegate = Record<string, (args: Row) => Promise<unknown>>;
const auditedWrite = Symbol('auditedWrite');

// Preserve Prisma's lazy execution: constructing a write must not start a
// transaction before an array-transaction misuse can be rejected.
function deferredWrite(run: () => Promise<unknown>) {
  let promise: Promise<unknown> | undefined;
  const start = () => (promise ??= run());
  return {
    [auditedWrite]: true,
    then: (...args: Parameters<Promise<unknown>['then']>) => start().then(...args),
    catch: (...args: Parameters<Promise<unknown>['catch']>) => start().catch(...args),
    finally: (...args: Parameters<Promise<unknown>['finally']>) => start().finally(...args),
  };
}

export function redact(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (key, item: unknown) =>
      /password|token|secret/i.test(key) ? '[redacted]' : item,
    ),
  ) as Prisma.InputJsonValue;
}

// Audit readers need decisions and provenance, never contact details, uploaded
// document bytes or safe-contact instructions.
export function crmAuditSnapshot(model: string, row: Row): Prisma.InputJsonValue {
  if (
    ![
      'CrmContact',
      'CrmRelationship',
      'CrmConsent',
      'CrmVerification',
      'CrmLead',
      'CrmLeadStatusChange',
      'CrmLeadPatient',
      'CrmInteraction',
      'CrmInteractionRevision',
      'CrmCall',
      'CrmTask',
      'CrmTaskHistory',
      'ReceptionCareRequest',
      'PatientDocument',
      'EmployeeDocument',
      'PatientContact',
      'PatientCoverage',
      'ReceptionPatientDeposit',
      'ReceptionReminder',
      'ReceptionShiftHandover',
    ].includes(model)
  )
    return redact(row);
  const privateFields = new Set([
    'name',
    'nameKey',
    'phone',
    'altPhone',
    'email',
    'safeInstructions',
    'destination',
    'title',
    'sourceDetail',
    'serviceInterest',
    'qualificationNotes',
    'reason',
    'summary',
    'callerPhone',
    'actionNote',
    'completionNote',
    'notes',
    'content',
    'fileName',
    'sha256',
    'memberNo',
    'reference',
    'reviewNote',
    'failureReason',
    'note',
    'closeReason',
    ...(model === 'CrmTask' || model === 'CrmTaskHistory' ? ['outcome'] : []),
  ]);
  return redact(
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        privateFields.has(key) ? '[redacted]' : value,
      ]),
    ),
  );
}

/** The only dynamic typing boundary: Prisma's runtime model delegates. */
function delegate(client: Prisma.TransactionClient, name: string): Delegate {
  return (client as unknown as Record<string, Delegate>)[name];
}

/**
 * Every mutation and its audit share the SAME transaction/connection. Batch writes
 * get a row per affected record. Nested changes are included in the parent's
 * before/after snapshot. A failed audit aborts the business write.
 * Array transactions are read-only; use a callback for commands.
 */
export function auditedClient(base: PrismaClient): PrismaClient {
  const models = new Map(
    Prisma.dmmf.datamodel.models.map((model) => [
      model.name[0].toLowerCase() + model.name.slice(1),
      model,
    ]),
  );

  async function facilityScopes(
    tx: Prisma.TransactionClient,
    modelName: string,
    row: Row,
    visited = new Set<string>(),
  ): Promise<Set<string>> {
    const scopes = new Set<string>();
    if (typeof row.facilityId === 'string') scopes.add(row.facilityId);
    if (visited.has(modelName)) return scopes;
    const path = new Set([...visited, modelName]);
    const model = models.get(modelName);
    for (const field of model?.fields ?? []) {
      // This access-control record belongs to the source facility. Its named
      // viewer intentionally belongs to another facility; the composite FK and
      // grant service validate that identity. Financial records remain scoped.
      if (modelName === 'financeReportGrant' && field.name === 'viewer') continue;
      if (!field.relationFromFields?.length || field.type === 'Facility') continue;
      if (field.relationFromFields.some((key) => row[key] == null)) continue;
      const parentName = field.type[0].toLowerCase() + field.type.slice(1);
      const parentModel = models.get(parentName);
      // Shared terminology/permissions do not belong to a facility.
      if (
        !parentModel ||
        !parentModel.fields.some((f) => f.name === 'facilityId' || f.relationFromFields?.length)
      )
        continue;
      const where = Object.fromEntries(
        field.relationFromFields.map((key, i) => [field.relationToFields![i], row[key]]),
      );
      const parent = (await delegate(tx, parentName).findFirst({ where })) as Row | null;
      if (parent)
        for (const scope of await facilityScopes(tx, parentName, parent, path)) scopes.add(scope);
    }
    return scopes;
  }

  async function transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options: Row = {},
  ): Promise<T> {
    try {
      return await base.$transaction(
        async (tx) => {
          const actor = requestContext.getStore()?.userId;
          if (actor) await tx.$queryRaw`SELECT set_config('redmars.finance_actor', ${actor}, true)`;
          return work(wrap(tx, true));
        },
        {
          maxWait: 10000,
          timeout: 20000,
          ...options,
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException({
          code: 'concurrent_change',
          message: 'This record changed at another workstation. Reload before retrying.',
        });
      }
      throw error;
    }
  }

  function wrap(client: Prisma.TransactionClient, inTransaction: boolean): PrismaClient {
    return new Proxy(client as PrismaClient, {
      get(target, key, receiver): unknown {
        if (key === '$transaction' && !inTransaction) {
          return (work: unknown, options?: Row) => {
            if (typeof work === 'function')
              return transaction(
                work as (tx: Prisma.TransactionClient) => Promise<unknown>,
                options,
              );
            if (
              !Array.isArray(work) ||
              work.some(
                (item: unknown) =>
                  item !== null && typeof item === 'object' && auditedWrite in item,
              )
            ) {
              throw new Error('Audited writes require a callback transaction');
            }
            return base.$transaction(work as Prisma.PrismaPromise<unknown>[]);
          };
        }
        const model = models.get(String(key));
        if (!model || excluded.has(model.name)) {
          const value: unknown = Reflect.get(target, key, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        }
        const original = delegate(client, String(key));
        return new Proxy(original, {
          get(d, operation: string): unknown {
            if (!writes.has(operation))
              return typeof d[operation] === 'function' ? d[operation].bind(d) : d[operation];
            return (args: Row) =>
              inTransaction
                ? mutate(client, String(key), model, operation, args)
                : deferredWrite(() =>
                    transaction((tx) => delegate(tx, String(key))[operation](args)),
                  );
          },
        });
      },
    });
  }

  async function mutate(
    tx: Prisma.TransactionClient,
    name: string,
    model: (typeof Prisma.dmmf.datamodel.models)[number],
    operation: string,
    args: Row,
  ) {
    const d = delegate(tx, name);
    const batch = operation.includes('Many');
    const data = { ...(args.create as Row), ...(args.update as Row), ...(args.data as Row) };
    const relations = model.fields.filter((f) => f.kind === 'object' && f.name in data);
    const include =
      model.name === 'Invoice'
        ? { items: true }
        : relations.length
          ? Object.fromEntries(relations.map((f) => [f.name, true]))
          : undefined;
    const snapshot = { ...(include ? { include } : {}) };
    const before: Row[] = operation.startsWith('create')
      ? []
      : batch
        ? ((await d.findMany({ where: args.where, ...snapshot })) as Row[])
        : [(await d.findUnique({ where: args.where, ...snapshot })) as Row | null].filter(
            (r): r is Row => r !== null,
          );
    const primary = model.fields.filter((f) => f.isId).map((f) => f.name);
    const keys = primary.length ? primary : (model.primaryKey?.fields ?? []);
    const whereFor = (row: Row) =>
      keys.length === 1
        ? { [keys[0]]: row[keys[0]] }
        : { [keys.join('_')]: Object.fromEntries(keys.map((k) => [k, row[k]])) };

    // Always retrieve full rows, regardless of the caller's select. Audit must not
    // lose the facility or secrets redaction just because the API selects only id.
    let result: unknown;
    let after: Row[] = [];
    if (operation === 'createMany' || operation === 'createManyAndReturn') {
      const writeArgs = { ...args };
      delete writeArgs.select;
      delete writeArgs.include;
      delete writeArgs.omit;
      after = (await d.createManyAndReturn(writeArgs)) as Row[];
      result =
        operation === 'createMany'
          ? { count: after.length }
          : args.select || args.include || args.omit
            ? await Promise.all(
                after.map((row) =>
                  d.findUnique({
                    where: whereFor(row),
                    ...(args.select ? { select: args.select } : {}),
                    ...(args.include ? { include: args.include } : {}),
                    ...(args.omit ? { omit: args.omit } : {}),
                  }),
                ),
              )
            : after;
    } else if (!batch && !operation.startsWith('delete')) {
      const writeArgs = { ...args };
      delete writeArgs.select;
      delete writeArgs.include;
      delete writeArgs.omit;
      const row = (await d[operation](writeArgs)) as Row;
      const where = whereFor(row);
      after = [(await d.findUnique({ where, ...snapshot })) as Row];
      result =
        args.select || args.include || args.omit
          ? await d.findUnique({
              where,
              ...(args.select ? { select: args.select } : {}),
              ...(args.include ? { include: args.include } : {}),
              ...(args.omit ? { omit: args.omit } : {}),
            })
          : row;
    } else {
      result = await d[operation](args);
      if (operation.startsWith('create')) after = result as Row[];
      else if (!operation.startsWith('delete')) {
        after = await Promise.all(
          before.map((row) => d.findUnique({ where: whereFor(row), ...snapshot }) as Promise<Row>),
        );
      }
    }
    const ctx = requestContext.getStore();
    const count = Math.max(before.length, after.length);
    for (let i = 0; i < count; i++) {
      const old = before[i];
      const next = after[i];
      const scopes = await facilityScopes(tx, name, next ?? old);
      if (old && next) {
        for (const scope of await facilityScopes(tx, name, old)) scopes.add(scope);
      }
      if (scopes.size > 1) throw new ConflictException('Cross-facility reference refused');
      const facilityId: string | undefined = [...scopes][0] ?? ctx?.facilityId;
      // Shared catalogs/auth outside a request have no facility to attribute.
      if (typeof facilityId !== 'string') continue;
      if (ctx?.facilityId && facilityId !== ctx.facilityId)
        throw new ConflictException('Cross-facility mutation refused');
      const audit = await tx.auditLog.create({
        data: {
          facilityId,
          userId: ctx?.userId ?? null,
          action: !old ? AuditAction.create : !next ? AuditAction.delete : AuditAction.update,
          entity: model.name,
          entityId:
            typeof (next?.id ?? old?.id) === 'string' ? ((next?.id ?? old?.id) as string) : null,
          before: old ? crmAuditSnapshot(model.name, old) : Prisma.DbNull,
          after: next ? crmAuditSnapshot(model.name, next) : Prisma.DbNull,
          ipAddress: ctx?.ipAddress ?? null,
        },
      });
      if (eventModels.has(model.name) && audit.entityId) {
        const project = (row: Row | undefined) =>
          row
            ? Object.fromEntries(Object.entries(row).filter(([key]) => eventFields.has(key)))
            : null;
        const invoice =
          model.name === 'Payment'
            ? await tx.invoice.findUniqueOrThrow({
                where: { id: (next?.invoiceId ?? old?.invoiceId) as string },
                select: { currency: true, patientId: true, visitId: true, panelId: true },
              })
            : null;
        await tx.integrationEvent.create({
          data: {
            facilityId,
            sourceAuditId: audit.id,
            type: `hmis.${model.name}.${audit.action}.v1`,
            aggregateType: model.name,
            aggregateId: audit.entityId,
            payload: redact({
              before: project(old),
              after: project(next),
              ...(invoice ? { invoice } : {}),
              actorId: ctx?.userId ?? null,
            }),
          },
        });
      }
    }
    return result;
  }
  return wrap(base, false);
}
