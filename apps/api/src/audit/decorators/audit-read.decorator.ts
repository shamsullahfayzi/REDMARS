import { SetMetadata } from '@nestjs/common';

export const AUDIT_READ_KEY = 'redmars:auditRead';

/**
 * Marks a route as a clinical read under Rule R1: every successful call leaves an
 * AuditLog row with action: read. It NEVER blocks — R1 is deterrence, not
 * obstruction ("obstruction in clinical software gets routed around, and the
 * workaround is always less safe than the thing it replaced").
 *
 * Opt-in, deliberately — the mirror image of the write path, which audits every
 * mutation automatically. Reads are audited only where they are named, because
 * most reads are machinery: the JwtAuthGuard loads an AppUser on every single
 * request, the health check pings the DB, the guards resolve permissions. Auditing
 * those would drown the handful of reads that matter — a doctor opening a patient's
 * chart — under thousands that don't, and cost a DB write on every request.
 *
 * `entity` is the model being read ('Patient', 'Visit'), recorded verbatim on the
 * row. A plain string, not a union: this marks a route, and a typo shows up the
 * first time the row is read, not at compile time — the cost of getting it wrong
 * is a mislabelled audit entry, not a security hole.
 */
export const AuditRead = (entity: string) => SetMetadata(AUDIT_READ_KEY, entity);
