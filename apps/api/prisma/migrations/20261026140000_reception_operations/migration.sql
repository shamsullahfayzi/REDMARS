-- Reception operations: coordination, privacy, waitlist, deposits and supervisor controls.
-- Additive only; no finance-ledger configuration is changed by this migration.

-- AlterTable
ALTER TABLE "visit" ADD COLUMN     "queue_priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "queue_priority_approved_at" TIMESTAMPTZ(3),
ADD COLUMN     "queue_priority_approved_by" TEXT,
ADD COLUMN     "queue_priority_reason" TEXT;

-- CreateTable
CREATE TABLE "reception_care_request" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "target_patient_id" TEXT,
    "visit_id" TEXT,
    "appointment_id" TEXT,
    "department_id" TEXT,
    "source_bed_id" TEXT,
    "target_bed_id" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'routine',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "requested_by" TEXT NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" TEXT NOT NULL DEFAULT '',
    "completed_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reception_care_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reception_bed" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "room_id" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "notes" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reception_bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_waitlist" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "practitioner_id" TEXT,
    "preferred_on" DATE,
    "priority" TEXT NOT NULL DEFAULT 'routine',
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "note" TEXT NOT NULL DEFAULT '',
    "appointment_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contacted_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appointment_waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_document" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "patient_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_contact" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'family',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_emergency" BOOLEAN NOT NULL DEFAULT false,
    "can_call" BOOLEAN NOT NULL DEFAULT false,
    "can_sms" BOOLEAN NOT NULL DEFAULT false,
    "can_whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "safe_instructions" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "patient_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_coverage" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "panel_id" TEXT NOT NULL,
    "member_no" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "valid_from" DATE,
    "valid_to" DATE,
    "notes" TEXT NOT NULL DEFAULT '',
    "verified_by" TEXT,
    "verified_at" TIMESTAMPTZ(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "patient_coverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reception_patient_deposit" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AFN',
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "received_by" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_invoice_id" TEXT,
    "closed_by" TEXT,
    "closed_at" TIMESTAMPTZ(3),
    "close_reason" TEXT,

    CONSTRAINT "reception_patient_deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reception_reminder" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "contact_id" TEXT,
    "channel" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "scheduled_for" TIMESTAMPTZ(3) NOT NULL,
    "sent_at" TIMESTAMPTZ(3),
    "failure_reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reception_reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reception_shift_handover" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "from_user_id" TEXT NOT NULL,
    "to_user_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_by" TEXT,
    "acknowledged_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "reception_shift_handover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reception_care_request_facility_id_status_requested_at_idx" ON "reception_care_request"("facility_id", "status", "requested_at");

-- CreateIndex
CREATE INDEX "reception_care_request_patient_id_requested_at_idx" ON "reception_care_request"("patient_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "reception_care_request_facility_id_reference_key" ON "reception_care_request"("facility_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "reception_care_request_id_facility_id_key" ON "reception_care_request"("id", "facility_id");

-- CreateIndex
CREATE INDEX "reception_bed_facility_id_department_id_status_idx" ON "reception_bed"("facility_id", "department_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reception_bed_facility_id_code_key" ON "reception_bed"("facility_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "reception_bed_id_facility_id_key" ON "reception_bed"("id", "facility_id");

-- CreateIndex
CREATE INDEX "appointment_waitlist_facility_id_status_preferred_on_idx" ON "appointment_waitlist"("facility_id", "status", "preferred_on");

-- CreateIndex
CREATE INDEX "appointment_waitlist_patient_id_status_idx" ON "appointment_waitlist"("patient_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_waitlist_id_facility_id_key" ON "appointment_waitlist"("id", "facility_id");

-- CreateIndex
CREATE INDEX "patient_document_patient_id_created_at_idx" ON "patient_document"("patient_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "patient_document_id_facility_id_key" ON "patient_document"("id", "facility_id");

-- CreateIndex
CREATE INDEX "patient_contact_patient_id_archived_at_idx" ON "patient_contact"("patient_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "patient_contact_id_facility_id_key" ON "patient_contact"("id", "facility_id");

-- CreateIndex
CREATE INDEX "patient_coverage_patient_id_status_idx" ON "patient_coverage"("patient_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "patient_coverage_facility_id_panel_id_member_no_key" ON "patient_coverage"("facility_id", "panel_id", "member_no");

-- CreateIndex
CREATE UNIQUE INDEX "patient_coverage_id_facility_id_key" ON "patient_coverage"("id", "facility_id");

-- CreateIndex
CREATE INDEX "reception_patient_deposit_facility_id_patient_id_status_idx" ON "reception_patient_deposit"("facility_id", "patient_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reception_patient_deposit_id_facility_id_key" ON "reception_patient_deposit"("id", "facility_id");

-- CreateIndex
CREATE INDEX "reception_reminder_facility_id_status_scheduled_for_idx" ON "reception_reminder"("facility_id", "status", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "reception_reminder_id_facility_id_key" ON "reception_reminder"("id", "facility_id");

-- CreateIndex
CREATE INDEX "reception_shift_handover_facility_id_status_created_at_idx" ON "reception_shift_handover"("facility_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reception_shift_handover_id_facility_id_key" ON "reception_shift_handover"("id", "facility_id");

-- AddForeignKey
ALTER TABLE "reception_care_request" ADD CONSTRAINT "reception_care_request_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_care_request" ADD CONSTRAINT "reception_care_request_patient_id_facility_id_fkey" FOREIGN KEY ("patient_id", "facility_id") REFERENCES "patient"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_care_request" ADD CONSTRAINT "reception_care_request_target_patient_id_facility_id_fkey" FOREIGN KEY ("target_patient_id", "facility_id") REFERENCES "patient"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_care_request" ADD CONSTRAINT "reception_care_request_department_id_facility_id_fkey" FOREIGN KEY ("department_id", "facility_id") REFERENCES "department"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_care_request" ADD CONSTRAINT "reception_care_request_source_bed_id_facility_id_fkey" FOREIGN KEY ("source_bed_id", "facility_id") REFERENCES "reception_bed"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_care_request" ADD CONSTRAINT "reception_care_request_target_bed_id_facility_id_fkey" FOREIGN KEY ("target_bed_id", "facility_id") REFERENCES "reception_bed"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_bed" ADD CONSTRAINT "reception_bed_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_bed" ADD CONSTRAINT "reception_bed_department_id_facility_id_fkey" FOREIGN KEY ("department_id", "facility_id") REFERENCES "department"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_bed" ADD CONSTRAINT "reception_bed_room_id_facility_id_fkey" FOREIGN KEY ("room_id", "facility_id") REFERENCES "room"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_patient_id_facility_id_fkey" FOREIGN KEY ("patient_id", "facility_id") REFERENCES "patient"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_department_id_facility_id_fkey" FOREIGN KEY ("department_id", "facility_id") REFERENCES "department"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_document" ADD CONSTRAINT "patient_document_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_document" ADD CONSTRAINT "patient_document_patient_id_facility_id_fkey" FOREIGN KEY ("patient_id", "facility_id") REFERENCES "patient"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_contact" ADD CONSTRAINT "patient_contact_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_contact" ADD CONSTRAINT "patient_contact_patient_id_facility_id_fkey" FOREIGN KEY ("patient_id", "facility_id") REFERENCES "patient"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_coverage" ADD CONSTRAINT "patient_coverage_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_coverage" ADD CONSTRAINT "patient_coverage_patient_id_facility_id_fkey" FOREIGN KEY ("patient_id", "facility_id") REFERENCES "patient"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_coverage" ADD CONSTRAINT "patient_coverage_panel_id_facility_id_fkey" FOREIGN KEY ("panel_id", "facility_id") REFERENCES "panel"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_patient_deposit" ADD CONSTRAINT "reception_patient_deposit_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_patient_deposit" ADD CONSTRAINT "reception_patient_deposit_patient_id_facility_id_fkey" FOREIGN KEY ("patient_id", "facility_id") REFERENCES "patient"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_reminder" ADD CONSTRAINT "reception_reminder_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_reminder" ADD CONSTRAINT "reception_reminder_patient_id_facility_id_fkey" FOREIGN KEY ("patient_id", "facility_id") REFERENCES "patient"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_shift_handover" ADD CONSTRAINT "reception_shift_handover_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cross-record ownership and actor integrity.
CREATE UNIQUE INDEX "appointment_id_facility_id_key" ON "appointment"("id", "facility_id");
ALTER TABLE "reception_care_request" ADD CONSTRAINT "reception_care_request_visit_id_facility_id_fkey" FOREIGN KEY ("visit_id", "facility_id") REFERENCES "visit"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reception_care_request" ADD CONSTRAINT "reception_care_request_appointment_id_facility_id_fkey" FOREIGN KEY ("appointment_id", "facility_id") REFERENCES "appointment"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_practitioner_id_facility_id_fkey" FOREIGN KEY ("practitioner_id", "facility_id") REFERENCES "practitioner"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_appointment_id_facility_id_fkey" FOREIGN KEY ("appointment_id", "facility_id") REFERENCES "appointment"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reception_patient_deposit" ADD CONSTRAINT "reception_patient_deposit_invoice_id_facility_id_fkey" FOREIGN KEY ("applied_invoice_id", "facility_id") REFERENCES "invoice"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reception_reminder" ADD CONSTRAINT "reception_reminder_appointment_id_facility_id_fkey" FOREIGN KEY ("appointment_id", "facility_id") REFERENCES "appointment"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reception_reminder" ADD CONSTRAINT "reception_reminder_contact_id_facility_id_fkey" FOREIGN KEY ("contact_id", "facility_id") REFERENCES "patient_contact"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Workflow state machines are guarded in the database as well as the service.
ALTER TABLE "visit" ADD CONSTRAINT "visit_queue_priority_ck" CHECK ("queue_priority" IN (0, 10, 20));
ALTER TABLE "reception_bed" ADD CONSTRAINT "reception_bed_status_ck" CHECK ("status" IN ('available','reserved','occupied','cleaning','maintenance'));
ALTER TABLE "reception_care_request" ADD CONSTRAINT "reception_request_kind_ck" CHECK ("kind" IN ('admission','transfer','discharge','queue_priority','patient_merge'));
ALTER TABLE "reception_care_request" ADD CONSTRAINT "reception_request_priority_ck" CHECK ("priority" IN ('routine','urgent','emergency'));
ALTER TABLE "reception_care_request" ADD CONSTRAINT "reception_request_status_ck" CHECK ("status" IN ('pending','approved','rejected','cancelled','completed'));
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_priority_ck" CHECK ("priority" IN ('routine','urgent','emergency'));
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_status_ck" CHECK ("status" IN ('waiting','offered','booked','declined','cancelled'));
ALTER TABLE "patient_document" ADD CONSTRAINT "patient_document_category_ck" CHECK ("category" IN ('identity','referral','consent','insurance','other'));
ALTER TABLE "patient_document" ADD CONSTRAINT "patient_document_size_ck" CHECK ("size_bytes" BETWEEN 1 AND 2097152 AND octet_length("content") = "size_bytes");
ALTER TABLE "patient_document" ADD CONSTRAINT "patient_document_mime_ck" CHECK ("mime_type" IN ('application/pdf','image/jpeg','image/png'));
ALTER TABLE "patient_contact" ADD CONSTRAINT "patient_contact_kind_ck" CHECK ("kind" IN ('guardian','emergency','family','other'));
CREATE UNIQUE INDEX "patient_contact_one_primary_key" ON "patient_contact"("patient_id") WHERE "is_primary" AND "archived_at" IS NULL;
ALTER TABLE "patient_coverage" ADD CONSTRAINT "patient_coverage_status_ck" CHECK ("status" IN ('pending','eligible','ineligible','expired'));
ALTER TABLE "patient_coverage" ADD CONSTRAINT "patient_coverage_dates_ck" CHECK ("valid_from" IS NULL OR "valid_to" IS NULL OR "valid_to" >= "valid_from");
ALTER TABLE "reception_patient_deposit" ADD CONSTRAINT "reception_deposit_amount_ck" CHECK ("amount" > 0);
ALTER TABLE "reception_patient_deposit" ADD CONSTRAINT "reception_deposit_status_ck" CHECK ("status" IN ('active','applied','refunded'));
ALTER TABLE "reception_reminder" ADD CONSTRAINT "reception_reminder_channel_ck" CHECK ("channel" IN ('sms','whatsapp'));
ALTER TABLE "reception_reminder" ADD CONSTRAINT "reception_reminder_status_ck" CHECK ("status" IN ('queued','sent','failed','cancelled'));
ALTER TABLE "reception_shift_handover" ADD CONSTRAINT "reception_handover_status_ck" CHECK ("status" IN ('open','acknowledged','closed'));

-- Default-deny permissions for coordination, clinical review and supervision.
INSERT INTO "permission" ("id", "code", "resource", "action")
SELECT gen_random_uuid()::text, code, 'reception', split_part(code, '.', 2)
FROM unnest(ARRAY[
  'reception.coordinate','reception.manage_beds','reception.clinical_review','reception.supervise'
]) AS code
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r.id, p.id FROM "role" r CROSS JOIN "permission" p
WHERE
  (r.code = 'admin' AND p.code LIKE 'reception.%') OR
  (r.code = 'receptionist' AND p.code = 'reception.coordinate') OR
  (r.code = 'nurse' AND p.code = 'reception.manage_beds') OR
  (r.code = 'doctor' AND p.code = 'reception.clinical_review') OR
  (r.code = 'management' AND p.code = 'reception.supervise')
ON CONFLICT DO NOTHING;

