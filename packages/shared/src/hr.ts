import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableText = z.string().trim().max(500).nullable().optional();

export const hrSexSchema = z.enum(["male", "female", "other", "undisclosed"]);
export const employmentTypeSchema = z.enum([
  "permanent",
  "fixed_term",
  "part_time",
  "temporary",
  "volunteer",
]);
export const employeeStatusSchema = z.enum([
  "active",
  "on_leave",
  "suspended",
  "exited",
]);
export const attendanceStatusSchema = z.enum([
  "present",
  "absent",
  "late",
  "on_leave",
  "holiday",
  "rest_day",
]);
export const leaveRequestStatusSchema = z.enum([
  "submitted",
  "approved",
  "rejected",
  "cancelled",
]);
export const rosterStatusSchema = z.enum(["draft", "confirmed", "cancelled"]);
export const credentialTypeSchema = z.enum([
  "professional_license",
  "education",
  "certification",
  "training",
  "work_permit",
  "other",
]);
export const documentTypeSchema = z.enum([
  "identity",
  "contract",
  "education",
  "license",
  "training",
  "disciplinary",
  "other",
]);
export const credentialStateSchema = z.enum([
  "not_expiring",
  "valid",
  "due_90",
  "due_60",
  "due_30",
  "expires_today",
  "expired",
]);

export const hrPositionSchema = z.object({
  id: z.string().uuid(),
  titleEn: z.string(),
  titlePrs: z.string().nullable(),
  titlePs: z.string().nullable(),
  category: z.string().nullable(),
  isClinical: z.boolean(),
  isActive: z.boolean(),
});
export const createHrPositionSchema = z.object({
  titleEn: z.string().trim().min(2).max(120),
  titlePrs: nullableText,
  titlePs: nullableText,
  category: nullableText,
  isClinical: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export const updateHrPositionSchema = createHrPositionSchema.partial();

export const hrDocumentSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  type: documentTypeSchema,
  title: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  issuedOn: isoDate.nullable(),
  expiresOn: isoDate.nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});

export const hrCredentialSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  type: credentialTypeSchema,
  name: z.string(),
  issuingAuthority: z.string().nullable(),
  referenceNo: z.string().nullable(),
  issuedOn: isoDate.nullable(),
  expiresOn: isoDate.nullable(),
  blocksClinicalWork: z.boolean(),
  documentId: z.string().uuid().nullable(),
  note: z.string().nullable(),
  state: credentialStateSchema,
  daysUntilExpiry: z.number().int().nullable(),
});
export const saveHrCredentialSchema = z.object({
  type: credentialTypeSchema,
  name: z.string().trim().min(2).max(160),
  issuingAuthority: nullableText,
  referenceNo: nullableText,
  issuedOn: isoDate.nullable().optional(),
  expiresOn: isoDate.nullable().optional(),
  blocksClinicalWork: z.boolean().default(false),
  documentId: z.string().uuid().nullable().optional(),
  note: nullableText,
});

const employeeFields = {
  firstName: z.string().trim().min(2).max(100),
  fatherName: nullableText,
  grandfatherName: nullableText,
  lastName: nullableText,
  sex: hrSexSchema,
  dateOfBirth: isoDate.nullable().optional(),
  nationalId: nullableText,
  photoUrl: nullableText,
  phone: nullableText,
  alternatePhone: nullableText,
  addressProvince: nullableText,
  addressDistrict: nullableText,
  addressText: nullableText,
  emergencyName: nullableText,
  emergencyRelation: nullableText,
  emergencyPhone: nullableText,
  departmentId: z.string().uuid(),
  positionId: z.string().uuid(),
  reportsToEmployeeId: z.string().uuid().nullable().optional(),
  employmentType: employmentTypeSchema,
  joinedOn: isoDate,
  contractStartsOn: isoDate.nullable().optional(),
  contractEndsOn: isoDate.nullable().optional(),
  baseSalaryMinor: z.number().int().nonnegative().nullable().optional(),
  salaryCurrency: z.literal("AFN").default("AFN"),
  notes: nullableText,
};
export const createEmployeeSchema = z.object(employeeFields);
export const updateEmployeeSchema = z.object(employeeFields).partial();
export const exitEmployeeSchema = z.object({
  exitDate: isoDate,
  exitReason: z.string().trim().min(3).max(500),
});
export const employeeQuerySchema = z.object({
  q: z.string().trim().max(120).default(""),
  departmentId: z.string().uuid().optional(),
  positionId: z.string().uuid().optional(),
  status: employeeStatusSchema.optional(),
  employmentType: employmentTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export const hrEmployeeSchema = z.object({
  id: z.string().uuid(),
  employeeNo: z.string(),
  userId: z.string().uuid().nullable(),
  firstName: z.string(),
  fatherName: z.string().nullable(),
  grandfatherName: z.string().nullable(),
  lastName: z.string().nullable(),
  fullName: z.string(),
  sex: hrSexSchema,
  dateOfBirth: isoDate.nullable(),
  nationalId: z.string().nullable(),
  photoUrl: z.string().nullable(),
  phone: z.string().nullable(),
  alternatePhone: z.string().nullable(),
  addressProvince: z.string().nullable(),
  addressDistrict: z.string().nullable(),
  addressText: z.string().nullable(),
  emergencyName: z.string().nullable(),
  emergencyRelation: z.string().nullable(),
  emergencyPhone: z.string().nullable(),
  departmentId: z.string().uuid(),
  departmentName: z.string(),
  positionId: z.string().uuid(),
  positionTitle: z.string(),
  reportsToEmployeeId: z.string().uuid().nullable(),
  employmentType: employmentTypeSchema,
  joinedOn: isoDate,
  contractStartsOn: isoDate.nullable(),
  contractEndsOn: isoDate.nullable(),
  status: employeeStatusSchema,
  exitDate: isoDate.nullable(),
  exitReason: z.string().nullable(),
  baseSalaryMinor: z.number().int().nullable().optional(),
  salaryCurrency: z.string().optional(),
  notes: z.string().nullable(),
  documents: z.array(hrDocumentSchema).optional(),
  credentials: z.array(hrCredentialSchema).optional(),
});
export const employeeListSchema = z.object({
  items: z.array(hrEmployeeSchema),
  total: z.number().int(),
  page: z.number().int(),
});

export const createEmployeeAccountSchema = z.object({
  username: z.string().trim().min(3).max(50),
  email: z.string().email().nullable().optional(),
  password: z.string().min(10).max(128),
  roleCodes: z.array(z.string()).min(1),
});
export const resetEmployeePasswordSchema = z.object({
  password: z.string().min(10).max(128),
});
export const activeAccountSchema = z.object({ active: z.boolean() });

export const hrConfigSchema = z.object({
  weeklyRestDays: z.array(z.number().int().min(0).max(6)).max(3).default([]),
  leavePastEntryDays: z.number().int().min(0).max(365).default(7),
  maxConsecutiveNightShifts: z.number().int().min(1).max(14).default(3),
  credentialReminderDays: z
    .array(z.number().int().min(0).max(365))
    .default([90, 60, 30, 0]),
  staffingRequirements: z
    .array(
      z.object({
        departmentId: z.string().uuid(),
        shiftTypeId: z.string().uuid(),
        minimumStaff: z.number().int().min(1).max(100),
        roleOnShift: z.string().trim().max(80).nullable().default(null),
      }),
    )
    .max(200)
    .default([]),
});

export const leaveTypeSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  nameEn: z.string(),
  namePrs: z.string().nullable(),
  namePs: z.string().nullable(),
  annualEntitlement: z.number().int().nullable(),
  requiresAttachment: z.boolean(),
  isPaid: z.boolean(),
  isActive: z.boolean(),
});
export const saveLeaveTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .transform((v) => v.toUpperCase()),
  nameEn: z.string().trim().min(2).max(100),
  namePrs: nullableText,
  namePs: nullableText,
  annualEntitlement: z.number().int().min(0).max(366).nullable().optional(),
  requiresAttachment: z.boolean().default(false),
  isPaid: z.boolean().default(true),
  isActive: z.boolean().default(true),
});
export const leaveRequestSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  employeeName: z.string(),
  leaveTypeId: z.string().uuid(),
  leaveTypeName: z.string(),
  startsOn: isoDate,
  endsOn: isoDate,
  daysRequested: z.number().int(),
  reason: z.string().nullable(),
  status: leaveRequestStatusSchema,
  decisionNote: z.string().nullable(),
  decidedAt: z.string().nullable(),
});
export const createLeaveRequestSchema = z.object({
  employeeId: z.string().uuid().optional(),
  leaveTypeId: z.string().uuid(),
  startsOn: isoDate,
  endsOn: isoDate,
  reason: z.string().trim().max(500).nullable().optional(),
  attachmentDocumentId: z.string().uuid().nullable().optional(),
});
export const decideLeaveSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).nullable().optional(),
});

export const attendanceRowSchema = z.object({
  id: z.string().uuid().nullable(),
  employeeId: z.string().uuid(),
  employeeNo: z.string(),
  employeeName: z.string(),
  workDate: isoDate,
  shiftTypeId: z.string().uuid().nullable(),
  status: attendanceStatusSchema,
  minutesLate: z.number().int(),
  note: z.string().nullable(),
  source: z.enum(["recorded", "holiday", "rest_day", "empty"]),
});
export const markAttendanceSchema = z.object({
  workDate: isoDate,
  entries: z
    .array(
      z.object({
        employeeId: z.string().uuid(),
        shiftTypeId: z.string().uuid().nullable().optional(),
        status: attendanceStatusSchema,
        minutesLate: z.number().int().min(0).max(1440).default(0),
        note: nullableText,
      }),
    )
    .min(1),
});

export const shiftTypeSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  nameEn: z.string(),
  namePrs: z.string().nullable(),
  namePs: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  crossesMidnight: z.boolean(),
  color: z.string().nullable(),
  isActive: z.boolean(),
});
export const saveShiftTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .transform((v) => v.toUpperCase()),
  nameEn: z.string().trim().min(2).max(100),
  namePrs: nullableText,
  namePs: nullableText,
  startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  color: z.string().trim().max(20).nullable().optional(),
  isActive: z.boolean().default(true),
});
export const rosterEntrySchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  employeeName: z.string(),
  departmentId: z.string().uuid(),
  shiftTypeId: z.string().uuid(),
  shiftName: z.string(),
  dutyDate: isoDate,
  roleOnShift: z.string().nullable(),
  status: rosterStatusSchema,
  notes: z.string().nullable(),
});
export const saveRosterEntrySchema = z.object({
  employeeId: z.string().uuid(),
  departmentId: z.string().uuid(),
  shiftTypeId: z.string().uuid(),
  dutyDate: isoDate,
  roleOnShift: nullableText,
  notes: nullableText,
});
export const publishRosterSchema = z.object({
  startsOn: isoDate,
  endsOn: isoDate,
  departmentId: z.string().uuid().optional(),
});
export const copyRosterSchema = z.object({
  sourceStartsOn: isoDate,
  targetStartsOn: isoDate,
  departmentId: z.string().uuid().optional(),
});

export const holidaySchema = z.object({
  id: z.string().uuid(),
  holidayDate: isoDate,
  nameEn: z.string(),
  namePrs: z.string().nullable(),
  namePs: z.string().nullable(),
  isActive: z.boolean(),
});
export const saveHolidaySchema = z.object({
  holidayDate: isoDate,
  nameEn: z.string().trim().min(2).max(120),
  namePrs: nullableText,
  namePs: nullableText,
  isActive: z.boolean().default(true),
});

export type CreateEmployee = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployee = z.infer<typeof updateEmployeeSchema>;
export type EmployeeQuery = z.infer<typeof employeeQuerySchema>;
export type SaveHrCredential = z.infer<typeof saveHrCredentialSchema>;
export type HrConfig = z.infer<typeof hrConfigSchema>;
export type CreateLeaveRequest = z.infer<typeof createLeaveRequestSchema>;
export type MarkAttendance = z.infer<typeof markAttendanceSchema>;
export type SaveRosterEntry = z.infer<typeof saveRosterEntrySchema>;
