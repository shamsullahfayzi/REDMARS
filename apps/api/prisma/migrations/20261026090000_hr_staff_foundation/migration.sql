-- HR staff foundation for Axon Nura.
-- Review-only: generated on 2026-10-26 and intentionally not applied.

CREATE TYPE "HrSex" AS ENUM ('male', 'female', 'other', 'undisclosed');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('permanent', 'fixed_term', 'part_time', 'temporary', 'volunteer');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('active', 'on_leave', 'suspended', 'exited');

-- CreateEnum
CREATE TYPE "EmployeeDocumentType" AS ENUM ('identity', 'contract', 'education', 'license', 'training', 'disciplinary', 'other');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('professional_license', 'education', 'certification', 'training', 'work_permit', 'other');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'absent', 'late', 'on_leave', 'holiday', 'rest_day');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('submitted', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "RosterStatus" AS ENUM ('draft', 'confirmed', 'cancelled');

-- CreateTable
CREATE TABLE "hr_position" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "title_prs" TEXT,
    "title_ps" TEXT,
    "category" TEXT,
    "is_clinical" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "hr_position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "employee_no" TEXT NOT NULL,
    "user_id" TEXT,
    "first_name" TEXT NOT NULL,
    "father_name" TEXT,
    "grandfather_name" TEXT,
    "last_name" TEXT,
    "sex" "HrSex" NOT NULL,
    "date_of_birth" DATE,
    "national_id" TEXT,
    "photo_url" TEXT,
    "phone" TEXT,
    "alternate_phone" TEXT,
    "address_province" TEXT,
    "address_district" TEXT,
    "address_text" TEXT,
    "emergency_name" TEXT,
    "emergency_relation" TEXT,
    "emergency_phone" TEXT,
    "department_id" TEXT NOT NULL,
    "position_id" TEXT NOT NULL,
    "reports_to_employee_id" TEXT,
    "employment_type" "EmploymentType" NOT NULL,
    "joined_on" DATE NOT NULL,
    "contract_starts_on" DATE,
    "contract_ends_on" DATE,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'active',
    "exit_date" DATE,
    "exit_reason" TEXT,
    "base_salary_minor" INTEGER,
    "salary_currency" TEXT NOT NULL DEFAULT 'AFN',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_document" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "type" "EmployeeDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "issued_on" DATE,
    "expires_on" DATE,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "employee_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_credential" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "type" "CredentialType" NOT NULL,
    "name" TEXT NOT NULL,
    "issuing_authority" TEXT,
    "reference_no" TEXT,
    "issued_on" DATE,
    "expires_on" DATE,
    "blocks_clinical_work" BOOLEAN NOT NULL DEFAULT false,
    "document_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "employee_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_reminder" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipients" JSONB NOT NULL,

    CONSTRAINT "credential_reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_type" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_prs" TEXT,
    "name_ps" TEXT,
    "starts_at" TIME(0) NOT NULL,
    "ends_at" TIME(0) NOT NULL,
    "crosses_midnight" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "shift_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_day" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "shift_type_id" TEXT,
    "status" "AttendanceStatus" NOT NULL,
    "minutes_late" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "leave_request_id" TEXT,
    "marked_by_user_id" TEXT NOT NULL,
    "marked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "attendance_day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_type" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_prs" TEXT,
    "name_ps" TEXT,
    "annual_entitlement" INTEGER,
    "requires_attachment" BOOLEAN NOT NULL DEFAULT false,
    "is_paid" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "leave_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_request" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "leave_type_id" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "days_requested" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'submitted',
    "attachment_document_id" TEXT,
    "decided_by" TEXT,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "leave_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_holiday" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "holiday_date" DATE NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_prs" TEXT,
    "name_ps" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "hr_holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_entry" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "shift_type_id" TEXT NOT NULL,
    "duty_date" DATE NOT NULL,
    "role_on_shift" TEXT,
    "status" "RosterStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(3),
    "published_by" TEXT,
    "swapped_from_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "roster_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_notification" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "employee_id" TEXT,
    "recipient_user_id" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hr_position_facility_id_is_active_idx" ON "hr_position"("facility_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "hr_position_facility_id_title_en_key" ON "hr_position"("facility_id", "title_en");

-- CreateIndex
CREATE UNIQUE INDEX "hr_position_id_facility_id_key" ON "hr_position"("id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_user_id_key" ON "employee"("user_id");

-- CreateIndex
CREATE INDEX "employee_facility_id_status_department_id_idx" ON "employee"("facility_id", "status", "department_id");

-- CreateIndex
CREATE INDEX "employee_facility_id_first_name_last_name_idx" ON "employee"("facility_id", "first_name", "last_name");

-- CreateIndex
CREATE UNIQUE INDEX "employee_facility_id_employee_no_key" ON "employee"("facility_id", "employee_no");

-- CreateIndex
CREATE UNIQUE INDEX "employee_id_facility_id_key" ON "employee"("id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_user_id_facility_id_key" ON "employee"("user_id", "facility_id");

-- CreateIndex
CREATE INDEX "employee_document_facility_id_employee_id_type_idx" ON "employee_document"("facility_id", "employee_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "employee_document_id_facility_id_key" ON "employee_document"("id", "facility_id");

-- CreateIndex
CREATE INDEX "employee_credential_facility_id_expires_on_idx" ON "employee_credential"("facility_id", "expires_on");

-- CreateIndex
CREATE UNIQUE INDEX "employee_credential_id_facility_id_key" ON "employee_credential"("id", "facility_id");

-- CreateIndex
CREATE INDEX "credential_reminder_facility_id_sent_at_idx" ON "credential_reminder"("facility_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "credential_reminder_credential_id_threshold_key" ON "credential_reminder"("credential_id", "threshold");

-- CreateIndex
CREATE INDEX "shift_type_facility_id_is_active_idx" ON "shift_type"("facility_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "shift_type_facility_id_code_key" ON "shift_type"("facility_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "shift_type_id_facility_id_key" ON "shift_type"("id", "facility_id");

-- CreateIndex
CREATE INDEX "attendance_day_facility_id_work_date_employee_id_idx" ON "attendance_day"("facility_id", "work_date", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_day_id_facility_id_key" ON "attendance_day"("id", "facility_id");

-- CreateIndex
CREATE INDEX "leave_type_facility_id_is_active_idx" ON "leave_type"("facility_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "leave_type_facility_id_code_key" ON "leave_type"("facility_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "leave_type_id_facility_id_key" ON "leave_type"("id", "facility_id");

-- CreateIndex
CREATE INDEX "leave_request_facility_id_employee_id_starts_on_ends_on_idx" ON "leave_request"("facility_id", "employee_id", "starts_on", "ends_on");

-- CreateIndex
CREATE INDEX "leave_request_facility_id_status_idx" ON "leave_request"("facility_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "leave_request_id_facility_id_key" ON "leave_request"("id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "hr_holiday_facility_id_holiday_date_key" ON "hr_holiday"("facility_id", "holiday_date");

-- CreateIndex
CREATE INDEX "roster_entry_facility_id_department_id_duty_date_status_idx" ON "roster_entry"("facility_id", "department_id", "duty_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "roster_entry_facility_id_employee_id_duty_date_shift_type_i_key" ON "roster_entry"("facility_id", "employee_id", "duty_date", "shift_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "roster_entry_id_facility_id_key" ON "roster_entry"("id", "facility_id");

-- CreateIndex
CREATE INDEX "hr_notification_facility_id_recipient_user_id_read_at_idx" ON "hr_notification"("facility_id", "recipient_user_id", "read_at");

-- Nullable shift assignments still need one active daily row.
CREATE UNIQUE INDEX "attendance_day_active_key" ON "attendance_day" ("facility_id", "employee_id", "work_date", COALESCE("shift_type_id", '')) WHERE "voided_at" IS NULL;

-- AddForeignKey
ALTER TABLE "hr_position" ADD CONSTRAINT "hr_position_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_user_id_facility_id_fkey" FOREIGN KEY ("user_id", "facility_id") REFERENCES "app_user"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_department_id_facility_id_fkey" FOREIGN KEY ("department_id", "facility_id") REFERENCES "department"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_position_id_facility_id_fkey" FOREIGN KEY ("position_id", "facility_id") REFERENCES "hr_position"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_reports_to_employee_id_facility_id_fkey" FOREIGN KEY ("reports_to_employee_id", "facility_id") REFERENCES "employee"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_document" ADD CONSTRAINT "employee_document_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_document" ADD CONSTRAINT "employee_document_employee_id_facility_id_fkey" FOREIGN KEY ("employee_id", "facility_id") REFERENCES "employee"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_credential" ADD CONSTRAINT "employee_credential_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_credential" ADD CONSTRAINT "employee_credential_employee_id_facility_id_fkey" FOREIGN KEY ("employee_id", "facility_id") REFERENCES "employee"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_credential" ADD CONSTRAINT "employee_credential_document_id_facility_id_fkey" FOREIGN KEY ("document_id", "facility_id") REFERENCES "employee_document"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_reminder" ADD CONSTRAINT "credential_reminder_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_reminder" ADD CONSTRAINT "credential_reminder_credential_id_facility_id_fkey" FOREIGN KEY ("credential_id", "facility_id") REFERENCES "employee_credential"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_type" ADD CONSTRAINT "shift_type_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_day" ADD CONSTRAINT "attendance_day_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_day" ADD CONSTRAINT "attendance_day_employee_id_facility_id_fkey" FOREIGN KEY ("employee_id", "facility_id") REFERENCES "employee"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_day" ADD CONSTRAINT "attendance_day_shift_type_id_facility_id_fkey" FOREIGN KEY ("shift_type_id", "facility_id") REFERENCES "shift_type"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_day" ADD CONSTRAINT "attendance_day_leave_request_id_facility_id_fkey" FOREIGN KEY ("leave_request_id", "facility_id") REFERENCES "leave_request"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_type" ADD CONSTRAINT "leave_type_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_employee_id_facility_id_fkey" FOREIGN KEY ("employee_id", "facility_id") REFERENCES "employee"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_leave_type_id_facility_id_fkey" FOREIGN KEY ("leave_type_id", "facility_id") REFERENCES "leave_type"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_attachment_document_id_facility_id_fkey" FOREIGN KEY ("attachment_document_id", "facility_id") REFERENCES "employee_document"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_holiday" ADD CONSTRAINT "hr_holiday_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entry" ADD CONSTRAINT "roster_entry_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entry" ADD CONSTRAINT "roster_entry_employee_id_facility_id_fkey" FOREIGN KEY ("employee_id", "facility_id") REFERENCES "employee"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entry" ADD CONSTRAINT "roster_entry_department_id_facility_id_fkey" FOREIGN KEY ("department_id", "facility_id") REFERENCES "department"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entry" ADD CONSTRAINT "roster_entry_shift_type_id_facility_id_fkey" FOREIGN KEY ("shift_type_id", "facility_id") REFERENCES "shift_type"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entry" ADD CONSTRAINT "roster_entry_swapped_from_id_facility_id_fkey" FOREIGN KEY ("swapped_from_id", "facility_id") REFERENCES "roster_entry"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_notification" ADD CONSTRAINT "hr_notification_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_notification" ADD CONSTRAINT "hr_notification_employee_id_facility_id_fkey" FOREIGN KEY ("employee_id", "facility_id") REFERENCES "employee"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_notification" ADD CONSTRAINT "hr_notification_recipient_user_id_facility_id_fkey" FOREIGN KEY ("recipient_user_id", "facility_id") REFERENCES "app_user"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain invariants that must remain true even if a future caller bypasses the API.
ALTER TABLE "employee" ADD CONSTRAINT "employee_exit_state_ck" CHECK (
  ("status" = 'exited' AND "exit_date" IS NOT NULL AND length(trim("exit_reason")) > 0)
  OR ("status" <> 'exited' AND "exit_date" IS NULL AND "exit_reason" IS NULL)
);
ALTER TABLE "employee" ADD CONSTRAINT "employee_contract_dates_ck" CHECK (
  "contract_starts_on" IS NULL OR "contract_ends_on" IS NULL OR "contract_ends_on" >= "contract_starts_on"
);
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_dates_ck" CHECK ("ends_on" >= "starts_on" AND "days_requested" > 0);
ALTER TABLE "attendance_day" ADD CONSTRAINT "attendance_minutes_late_ck" CHECK ("minutes_late" BETWEEN 0 AND 1440);

-- Register every HR permission so default-deny RBAC remains effective immediately.
INSERT INTO "permission" ("id", "code", "resource", "action")
SELECT gen_random_uuid()::text, code, split_part(code, '.', 1), substring(code from 4)
FROM unnest(ARRAY[
  'hr.employee.view','hr.employee.create','hr.employee.edit','hr.employee.exit',
  'hr.salary.view','hr.salary.edit','hr.document.manage','hr.credential.manage',
  'hr.attendance.view','hr.attendance.mark','hr.leave.request','hr.leave.approve',
  'hr.roster.view','hr.roster.edit','hr.report.view','hr.self.view'
]) AS code
ON CONFLICT ("code") DO NOTHING;

-- Administrative and management grants.
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r.id, p.id FROM "role" r CROSS JOIN "permission" p
WHERE
  (r.code = 'admin' AND p.code LIKE 'hr.%') OR
  (r.code = 'finance_manager' AND p.code IN ('hr.employee.view','hr.salary.view','hr.salary.edit','hr.attendance.view','hr.report.view','hr.leave.request','hr.self.view')) OR
  (r.code = 'payroll_officer' AND p.code IN ('hr.employee.view','hr.salary.view','hr.attendance.view','hr.attendance.mark','hr.report.view','hr.leave.request','hr.roster.view','hr.self.view')) OR
  (r.code = 'management' AND p.code IN ('hr.employee.view','hr.salary.view','hr.attendance.view','hr.report.view','hr.leave.request','hr.roster.view','hr.self.view')) OR
  (r.code IN ('receptionist','nurse','doctor','lab_tech','pharmacist','call_center','accountant','auditor') AND p.code IN ('hr.leave.request','hr.self.view')) OR
  (r.code IN ('receptionist','nurse','doctor','lab_tech','pharmacist') AND p.code = 'hr.roster.view')
ON CONFLICT DO NOTHING;

-- The module is installed by this migration. Enable it only for Axon's production facility;
-- test/demo facilities remain explicit choices in the module settings screen.
INSERT INTO "facility_module" ("facility_id", "module", "enabled", "enabled_at", "updated_at")
SELECT id, 'hr'::"ModuleKey", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "facility" WHERE code = 'AXON'
ON CONFLICT ("facility_id", "module") DO UPDATE
SET "enabled" = EXCLUDED."enabled", "enabled_at" = EXCLUDED."enabled_at", "updated_at" = EXCLUDED."updated_at";
