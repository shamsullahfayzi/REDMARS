import { z } from 'zod'
import { CLINICAL_DEPARTMENT_TYPES } from './department.js'
import { paymentMethodSchema } from './reception.js'

/**
 * Task 6c — reports. `report.operational` / `report.financial` / `report.clinical_aggregate` /
 * `audit_log.read` / `data.export` were seeded with 6b's matrix and have gated nothing until
 * now; this is the read side those grants always implied.
 *
 * One range shape for every report in this phase: `from`/`to` are YYYY-MM-DD in the
 * hospital's zone, both optional. Absent `to` means today; absent `from` means six days
 * before `to` — a week's view is the default a manager opens the page to, not an
 * all-time scan nobody asked for.
 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const reportRangeQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  departmentId: z.uuid().optional(),
  /** Ignored by `revenue` — a payment belongs to a till, not a doctor. */
  practitionerId: z.uuid().optional(),
})
export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>

// ---------------------------------------------------------------------------
// 6c.2 — daily census
// ---------------------------------------------------------------------------

export const censusRowSchema = z.object({
  date: z.string(),
  departmentId: z.string(),
  departmentName: z.string(),
  visitCount: z.number().int(),
  completed: z.number().int(),
  cancelled: z.number().int(),
  noShow: z.number().int(),
})
export type CensusRow = z.infer<typeof censusRowSchema>

export const censusReportResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  /** Task 6c.6 / R8 — narrowed to the caller's own registrations for a task-scoped grant. */
  scope: z.enum(['facility', 'own']),
  rows: z.array(censusRowSchema),
  totals: z.object({
    visitCount: z.number().int(),
    completed: z.number().int(),
    cancelled: z.number().int(),
    noShow: z.number().int(),
  }),
})
export type CensusReportResponse = z.infer<typeof censusReportResponseSchema>

// ---------------------------------------------------------------------------
// 6c.3 — wait times
// ---------------------------------------------------------------------------

export const waitTimeRowSchema = z.object({
  departmentId: z.string(),
  departmentName: z.string(),
  practitionerId: z.string().nullable(),
  practitionerName: z.string().nullable(),
  visitCount: z.number().int(),
  avgWaitMinutes: z.number().nullable(),
  medianWaitMinutes: z.number().nullable(),
})
export type WaitTimeRow = z.infer<typeof waitTimeRowSchema>

export const waitTimeReportResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  scope: z.enum(['facility', 'own']),
  rows: z.array(waitTimeRowSchema),
})
export type WaitTimeReportResponse = z.infer<typeof waitTimeReportResponseSchema>

// ---------------------------------------------------------------------------
// 6c.4 — revenue
// ---------------------------------------------------------------------------

export const revenueByDaySchema = z.object({ date: z.string(), total: z.string() })
/**
 * Revenue by DEPARTMENT, not by which till raised the invoice. `type: null` is the "other"
 * bucket — an invoice with no visit, or a visit in a department type outside the five
 * patient-facing ones (see `CLINICAL_DEPARTMENT_TYPES`) — never a sixth named category on
 * the chart for a case that shouldn't come up on a real facility.
 */
export const revenueByDepartmentSchema = z.object({
  type: z.enum(CLINICAL_DEPARTMENT_TYPES).nullable(),
  total: z.string(),
})
export const revenueByMethodSchema = z.object({ method: paymentMethodSchema, total: z.string() })

export const revenueReportResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  byDay: z.array(revenueByDaySchema),
  byDepartment: z.array(revenueByDepartmentSchema),
  byMethod: z.array(revenueByMethodSchema),
  grandTotal: z.string(),
})
export type RevenueReportResponse = z.infer<typeof revenueReportResponseSchema>

// ---------------------------------------------------------------------------
// 6c.5 — diagnosis counts, aggregate only
// ---------------------------------------------------------------------------

export const diagnosisCountRowSchema = z.object({
  /** Null when this row buckets free-text diagnoses that never got a code. */
  icdCode: z.string().nullable(),
  /** The label to show — the ICD title when coded, else a representative free-text phrase. */
  label: z.string(),
  count: z.number().int(),
})
export type DiagnosisCountRow = z.infer<typeof diagnosisCountRowSchema>

export const diagnosisReportResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  /** 'own' for a doctor (their own patients only); 'facility' for admin/management. */
  scope: z.enum(['facility', 'own']),
  rows: z.array(diagnosisCountRowSchema),
})
export type DiagnosisReportResponse = z.infer<typeof diagnosisReportResponseSchema>

// ---------------------------------------------------------------------------
// 6c.8 — audit log viewer
// ---------------------------------------------------------------------------

/** Mirrors the Prisma `AuditAction` enum. */
export const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'read',
  'login',
  'logout',
  'failed_login',
  'print',
  'export',
] as const
export const auditActionSchema = z.enum(AUDIT_ACTIONS)
export type AuditAction = z.infer<typeof auditActionSchema>

export const auditLogQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  userId: z.uuid().optional(),
  action: auditActionSchema.optional(),
  entity: z.string().trim().min(1).max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>

export const auditLogRowSchema = z.object({
  id: z.uuid(),
  userId: z.string().nullable(),
  userName: z.string().nullable(),
  action: auditActionSchema,
  entity: z.string(),
  entityId: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.string(),
})
export type AuditLogRow = z.infer<typeof auditLogRowSchema>

export const auditLogResponseSchema = z.object({
  rows: z.array(auditLogRowSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
})
export type AuditLogResponse = z.infer<typeof auditLogResponseSchema>

// ---------------------------------------------------------------------------
// 7.8 — error log viewer. Same query/pagination shape as the audit log above, on purpose:
// this is "you can debug a 2am call" from a browser, not a terminal, and reusing the shape
// means the two screens share one mental model instead of inventing a second one.
// ---------------------------------------------------------------------------

export const errorLogQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  /** Filter to one HTTP status, e.g. 500 — most callers just want "everything that broke". */
  statusCode: z.coerce.number().int().min(400).max(599).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
export type ErrorLogQuery = z.infer<typeof errorLogQuerySchema>

export const errorLogRowSchema = z.object({
  id: z.uuid(),
  userId: z.string().nullable(),
  userName: z.string().nullable(),
  method: z.string(),
  path: z.string(),
  statusCode: z.number().int(),
  message: z.string(),
  /** The full stack — present only on this detail-worthy row, not on lighter reports. */
  stack: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.string(),
})
export type ErrorLogRow = z.infer<typeof errorLogRowSchema>

export const errorLogResponseSchema = z.object({
  rows: z.array(errorLogRowSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
})
export type ErrorLogResponse = z.infer<typeof errorLogResponseSchema>

// ---------------------------------------------------------------------------
// 6c.10 — R11 raw patient-list export. Admin only, reason required, heavily audited.
// Kept a separate shape from every report above: those are counts and totals with no
// patient identity in them, and this is the one door that hands over the register itself.
// ---------------------------------------------------------------------------

export const patientExportQuerySchema = z.object({
  reason: z.string().trim().min(5, 'Say why this list is being pulled.').max(300),
})
export type PatientExportQuery = z.infer<typeof patientExportQuerySchema>

export const patientExportRowSchema = z.object({
  mrn: z.string(),
  name: z.string(),
  gender: z.string(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  registeredAt: z.string(),
})
export type PatientExportRow = z.infer<typeof patientExportRowSchema>

export const patientExportResponseSchema = z.object({
  rows: z.array(patientExportRowSchema),
  count: z.number().int(),
})
export type PatientExportResponse = z.infer<typeof patientExportResponseSchema>
