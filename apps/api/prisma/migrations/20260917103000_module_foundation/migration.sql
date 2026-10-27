-- Additive migration: no clinical or financial rows are removed or rewritten.
CREATE UNIQUE INDEX "practitioner_user_id_facility_id_key" ON "practitioner"("user_id", "facility_id");
ALTER TYPE "ModuleKey" ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE "ModuleKey" ADD VALUE IF NOT EXISTS 'hr';
ALTER TABLE "prescription" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_version_positive" CHECK (version > 0);

CREATE TABLE "integration_event" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "facility_id" TEXT NOT NULL REFERENCES "facility"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "source_audit_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "aggregate_type" TEXT NOT NULL,
  "aggregate_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "integration_event_version_positive" CHECK (version > 0)
);
CREATE UNIQUE INDEX "integration_event_source_audit_id_key" ON "integration_event"("source_audit_id");
CREATE INDEX "integration_event_facility_id_occurred_at_id_idx" ON "integration_event"("facility_id", "occurred_at", "id");
CREATE TABLE "integration_receipt" (
  "event_id" TEXT NOT NULL REFERENCES "integration_event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "consumer" TEXT NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("event_id", "consumer")
);
CREATE TABLE "command_receipt" (
  "facility_id" TEXT NOT NULL REFERENCES "facility"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "user_id" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("facility_id", "user_id", "operation", "key")
);

-- NOT VALID preserves legacy rows for explicit reconciliation. These constraints
-- still reject invalid new/updated rows immediately; validate after preflight.
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_money_valid" CHECK (
  subtotal >= 0 AND discount >= 0 AND discount <= subtotal AND
  total = subtotal - discount AND paid_amount >= 0 AND paid_amount <= total
) NOT VALID;
ALTER TABLE "invoice_item" ADD CONSTRAINT "invoice_item_money_valid" CHECK (
  quantity > 0 AND unit_price >= 0 AND discount >= 0 AND
  total = quantity * unit_price - discount AND total >= 0
) NOT VALID;
ALTER TABLE "payment" ADD CONSTRAINT "payment_nonzero" CHECK (amount <> 0) NOT VALID;

ALTER TABLE "lab_result"
  ADD COLUMN "reference_low" DECIMAL(12,4),
  ADD COLUMN "reference_high" DECIMAL(12,4),
  ADD COLUMN "reference_text" TEXT,
  ADD COLUMN "reference_captured_at" TIMESTAMP(3);
-- Historical reference ranges cannot be reconstructed honestly. Legacy rows
-- remain NULL instead of silently inheriting today's catalog values.
CREATE UNIQUE INDEX "invoice_item_clinical_origin_key" ON "invoice_item"("ref_type", "ref_id")
  WHERE "ref_type" IN ('lab_order_item', 'prescription_item') AND "ref_id" IS NOT NULL;

-- Facility-safe identity and encounter relationships. Legacy violations are
-- reported by the preflight; new writes are constrained immediately.
CREATE UNIQUE INDEX "patient_id_facility_id_key" ON "patient"("id", "facility_id");
CREATE UNIQUE INDEX "department_id_facility_id_key" ON "department"("id", "facility_id");
CREATE UNIQUE INDEX "room_id_facility_id_key" ON "room"("id", "facility_id");
CREATE UNIQUE INDEX "app_user_id_facility_id_key" ON "app_user"("id", "facility_id");
CREATE UNIQUE INDEX "practitioner_id_facility_id_key" ON "practitioner"("id", "facility_id");
CREATE UNIQUE INDEX "visit_id_facility_id_key" ON "visit"("id", "facility_id");
ALTER TABLE "room" DROP CONSTRAINT "room_department_id_fkey";
ALTER TABLE "room" ADD CONSTRAINT "room_department_id_facility_id_fkey" FOREIGN KEY ("department_id", "facility_id") REFERENCES "department"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "practitioner" DROP CONSTRAINT "practitioner_user_id_fkey";
ALTER TABLE "practitioner" ADD CONSTRAINT "practitioner_user_id_facility_id_fkey" FOREIGN KEY ("user_id", "facility_id") REFERENCES "app_user"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "visit" DROP CONSTRAINT "visit_patient_id_fkey";
ALTER TABLE "visit" ADD CONSTRAINT "visit_patient_id_facility_id_fkey" FOREIGN KEY ("patient_id", "facility_id") REFERENCES "patient"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "visit" DROP CONSTRAINT "visit_department_id_fkey";
ALTER TABLE "visit" ADD CONSTRAINT "visit_department_id_facility_id_fkey" FOREIGN KEY ("department_id", "facility_id") REFERENCES "department"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "visit" DROP CONSTRAINT "visit_practitioner_id_fkey";
ALTER TABLE "visit" ADD CONSTRAINT "visit_practitioner_id_facility_id_fkey" FOREIGN KEY ("practitioner_id", "facility_id") REFERENCES "practitioner"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "visit" DROP CONSTRAINT "visit_room_id_fkey";
ALTER TABLE "visit" ADD CONSTRAINT "visit_room_id_facility_id_fkey" FOREIGN KEY ("room_id", "facility_id") REFERENCES "room"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "invoice" DROP CONSTRAINT "invoice_patient_id_fkey";
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_patient_id_facility_id_fkey" FOREIGN KEY ("patient_id", "facility_id") REFERENCES "patient"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "invoice" DROP CONSTRAINT "invoice_visit_id_fkey";
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_visit_id_facility_id_fkey" FOREIGN KEY ("visit_id", "facility_id") REFERENCES "visit"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "lab_order" DROP CONSTRAINT "lab_order_visit_id_fkey";
ALTER TABLE "lab_order" ADD CONSTRAINT "lab_order_visit_id_facility_id_fkey" FOREIGN KEY ("visit_id", "facility_id") REFERENCES "visit"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "lab_order" DROP CONSTRAINT "lab_order_practitioner_id_fkey";
ALTER TABLE "lab_order" ADD CONSTRAINT "lab_order_practitioner_id_facility_id_fkey" FOREIGN KEY ("practitioner_id", "facility_id") REFERENCES "practitioner"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "appointment" DROP CONSTRAINT "appointment_patient_id_fkey";
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_patient_id_facility_id_fkey" FOREIGN KEY ("patient_id", "facility_id") REFERENCES "patient"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "appointment" DROP CONSTRAINT "appointment_practitioner_id_fkey";
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_practitioner_id_facility_id_fkey" FOREIGN KEY ("practitioner_id", "facility_id") REFERENCES "practitioner"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "appointment" DROP CONSTRAINT "appointment_department_id_fkey";
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_department_id_facility_id_fkey" FOREIGN KEY ("department_id", "facility_id") REFERENCES "department"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
