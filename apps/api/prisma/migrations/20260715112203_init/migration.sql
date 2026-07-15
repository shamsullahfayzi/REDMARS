-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other', 'unknown');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('planned', 'arrived', 'in_progress', 'on_hold', 'completed', 'cancelled', 'entered_in_error');

-- CreateEnum
CREATE TYPE "VisitType" AS ENUM ('opd_consult', 'follow_up', 'walk_in_lab', 'walk_in_pharmacy', 'emergency', 'ipd');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('booked', 'arrived', 'fulfilled', 'cancelled', 'no_show');

-- CreateEnum
CREATE TYPE "DepartmentType" AS ENUM ('opd', 'ipd', 'emergency', 'laboratory', 'pharmacy', 'radiology', 'administration');

-- CreateEnum
CREATE TYPE "GuardianRelation" AS ENUM ('son_of', 'daughter_of', 'wife_of', 'husband_of', 'father_of', 'mother_of', 'other');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'active', 'on_hold', 'completed', 'cancelled', 'entered_in_error');

-- CreateEnum
CREATE TYPE "LabOrderItemStatus" AS ENUM ('ordered', 'sample_collected', 'in_progress', 'resulted', 'verified', 'cancelled');

-- CreateEnum
CREATE TYPE "DiagnosisCertainty" AS ENUM ('provisional', 'differential', 'confirmed', 'refuted');

-- CreateEnum
CREATE TYPE "AllergySeverity" AS ENUM ('mild', 'moderate', 'severe');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card', 'bank_transfer', 'mobile_money', 'panel', 'waiver');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('create', 'update', 'delete', 'read', 'login', 'logout', 'failed_login', 'print', 'export');

-- CreateEnum
CREATE TYPE "ModuleKey" AS ENUM ('lab', 'pharmacy', 'ipd', 'emergency', 'radiology', 'billing', 'reports');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('active', 'expiring_soon', 'past_due', 'suspended');

-- CreateTable
CREATE TABLE "facility" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_local" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "logo_path" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kabul',
    "currency" TEXT NOT NULL DEFAULT 'AFN',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_local" TEXT,
    "type" "DepartmentType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_role" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speciality" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "speciality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practitioner" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "user_id" TEXT,
    "speciality_id" TEXT,
    "code" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "license_no" TEXT,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "practitioner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practitioner_department" (
    "practitioner_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,

    CONSTRAINT "practitioner_department_pkey" PRIMARY KEY ("practitioner_id","department_id")
);

-- CreateTable
CREATE TABLE "patient" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "prefix" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "date_of_birth" DATE,
    "estimated_age_years" INTEGER,
    "estimated_age_months" INTEGER,
    "estimated_age_days" INTEGER,
    "age_recorded_at" DATE,
    "gender" "Gender" NOT NULL,
    "guardian_name" TEXT,
    "guardian_relation" "GuardianRelation",
    "phone" TEXT,
    "alt_phone" TEXT,
    "address" TEXT,
    "district" TEXT,
    "province" TEXT,
    "national_id" TEXT,
    "passport_no" TEXT,
    "occupation" TEXT,
    "nationality" TEXT,
    "blood_group" TEXT,
    "is_deceased" BOOLEAN NOT NULL DEFAULT false,
    "deceased_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" TEXT,

    CONSTRAINT "patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_identifier" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_identifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allergy" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "drug_id" TEXT,
    "substance" TEXT NOT NULL,
    "reaction" TEXT,
    "severity" "AllergySeverity" NOT NULL,
    "noted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "noted_by" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "allergy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "practitioner_id" TEXT,
    "department_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'booked',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "department_id" TEXT NOT NULL,
    "practitioner_id" TEXT,
    "room_id" TEXT,
    "visit_no" TEXT NOT NULL,
    "type" "VisitType" NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'arrived',
    "chief_complaint" TEXT,
    "referred_by" TEXT,
    "referral_source" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_status_history" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "status" "VisitStatus" NOT NULL,
    "changed_by" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "visit_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vitals" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "systolic_bp" INTEGER,
    "diastolic_bp" INTEGER,
    "pulse" INTEGER,
    "temperature_c" DECIMAL(4,1),
    "respiratory" INTEGER,
    "spo2" INTEGER,
    "weight_kg" DECIMAL(5,2),
    "height_cm" DECIMAL(5,2),
    "recorded_by" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icd_code" (
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "title_local" TEXT,
    "chapter" TEXT,
    "is_billable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "icd_code_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "diagnosis" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "practitioner_id" TEXT,
    "icd_code" TEXT,
    "text" TEXT NOT NULL,
    "certainty" "DiagnosisCertainty" NOT NULL DEFAULT 'provisional',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_note" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "practitioner_id" TEXT,
    "note_type" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "practitioner_id" TEXT,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drug" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "generic_name" TEXT NOT NULL,
    "brand_name" TEXT,
    "atc_code" TEXT,
    "strength" TEXT,
    "form" TEXT,
    "default_route" TEXT,
    "default_freq" TEXT,
    "default_duration" TEXT,
    "is_controlled" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drug_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drug_interaction" (
    "id" TEXT NOT NULL,
    "drug_a_id" TEXT NOT NULL,
    "drug_b_id" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "drug_interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "practitioner_id" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'active',
    "advice" TEXT,
    "follow_up_date" DATE,
    "printed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_item" (
    "id" TEXT NOT NULL,
    "prescription_id" TEXT NOT NULL,
    "drug_id" TEXT NOT NULL,
    "drug_name_at_time" TEXT NOT NULL,
    "dose" TEXT,
    "frequency" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "quantity" INTEGER,
    "instructions" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_test" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_local" TEXT,
    "loinc_code" TEXT,
    "specimen" TEXT,
    "unit" TEXT,
    "price" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_test_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_panel" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "lab_panel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_panel_test" (
    "panel_id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,

    CONSTRAINT "lab_panel_test_pkey" PRIMARY KEY ("panel_id","test_id")
);

-- CreateTable
CREATE TABLE "reference_range" (
    "id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,
    "gender" "Gender",
    "min_age" INTEGER,
    "max_age" INTEGER,
    "low_value" DECIMAL(12,4),
    "high_value" DECIMAL(12,4),
    "text_value" TEXT,

    CONSTRAINT "reference_range_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_order" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "practitioner_id" TEXT,
    "order_no" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'active',
    "clinical_note" TEXT,
    "ordered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_order_item" (
    "id" TEXT NOT NULL,
    "lab_order_id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,
    "test_name_at_time" TEXT NOT NULL,
    "status" "LabOrderItemStatus" NOT NULL DEFAULT 'ordered',
    "sample_collected_at" TIMESTAMP(3),
    "sample_collected_by" TEXT,

    CONSTRAINT "lab_order_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_result" (
    "id" TEXT NOT NULL,
    "lab_order_item_id" TEXT NOT NULL,
    "value_numeric" DECIMAL(12,4),
    "value_text" TEXT,
    "unit" TEXT,
    "is_abnormal" BOOLEAN NOT NULL DEFAULT false,
    "flag" TEXT,
    "comment" TEXT,
    "entered_by" TEXT,
    "entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_by" TEXT,
    "verified_at" TIMESTAMP(3),

    CONSTRAINT "lab_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fee" DECIMAL(12,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "panel" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "phone" TEXT,
    "discount_pct" DECIMAL(5,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "panel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "visit_id" TEXT,
    "panel_id" TEXT,
    "panel_ref_no" TEXT,
    "invoice_no" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'AFN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_item" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "ref_type" TEXT NOT NULL,
    "ref_id" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "invoice_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "receipt_no" TEXT,
    "received_by" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_reversed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequence" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "prefix" TEXT,
    "year" INTEGER,
    "current" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "number_sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setting" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" "LicenseStatus" NOT NULL DEFAULT 'active',
    "paid_through_date" DATE NOT NULL,
    "signed_token" TEXT,
    "hardware_fingerprint" TEXT,
    "monthly_fee" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'AFN',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "license_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_module" (
    "facility_id" TEXT NOT NULL,
    "module" "ModuleKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabled_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facility_module_pkey" PRIMARY KEY ("facility_id","module")
);

-- CreateIndex
CREATE UNIQUE INDEX "facility_code_key" ON "facility"("code");

-- CreateIndex
CREATE INDEX "department_facility_id_type_idx" ON "department"("facility_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "department_facility_id_code_key" ON "department"("facility_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "room_facility_id_code_key" ON "room"("facility_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_facility_id_username_key" ON "app_user"("facility_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "role_code_key" ON "role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permission_code_key" ON "permission"("code");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "audit_log_facility_id_entity_entity_id_idx" ON "audit_log"("facility_id", "entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_facility_id_created_at_idx" ON "audit_log"("facility_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "speciality_code_key" ON "speciality"("code");

-- CreateIndex
CREATE UNIQUE INDEX "practitioner_user_id_key" ON "practitioner"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "practitioner_facility_id_code_key" ON "practitioner"("facility_id", "code");

-- CreateIndex
CREATE INDEX "patient_facility_id_phone_idx" ON "patient"("facility_id", "phone");

-- CreateIndex
CREATE INDEX "patient_facility_id_last_name_first_name_idx" ON "patient"("facility_id", "last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "patient_facility_id_mrn_key" ON "patient"("facility_id", "mrn");

-- CreateIndex
CREATE INDEX "patient_identifier_patient_id_idx" ON "patient_identifier"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_identifier_system_value_key" ON "patient_identifier"("system", "value");

-- CreateIndex
CREATE INDEX "allergy_patient_id_idx" ON "allergy"("patient_id");

-- CreateIndex
CREATE INDEX "appointment_facility_id_scheduled_at_idx" ON "appointment"("facility_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "appointment_patient_id_idx" ON "appointment"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "visit_appointment_id_key" ON "visit"("appointment_id");

-- CreateIndex
CREATE INDEX "visit_facility_id_department_id_status_started_at_idx" ON "visit"("facility_id", "department_id", "status", "started_at");

-- CreateIndex
CREATE INDEX "visit_patient_id_started_at_idx" ON "visit"("patient_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "visit_facility_id_visit_no_key" ON "visit"("facility_id", "visit_no");

-- CreateIndex
CREATE INDEX "visit_status_history_visit_id_idx" ON "visit_status_history"("visit_id");

-- CreateIndex
CREATE INDEX "vitals_visit_id_idx" ON "vitals"("visit_id");

-- CreateIndex
CREATE INDEX "icd_code_title_idx" ON "icd_code"("title");

-- CreateIndex
CREATE INDEX "diagnosis_visit_id_idx" ON "diagnosis"("visit_id");

-- CreateIndex
CREATE INDEX "clinical_note_visit_id_idx" ON "clinical_note"("visit_id");

-- CreateIndex
CREATE INDEX "attachment_visit_id_idx" ON "attachment"("visit_id");

-- CreateIndex
CREATE INDEX "template_facility_id_type_idx" ON "template"("facility_id", "type");

-- CreateIndex
CREATE INDEX "drug_facility_id_generic_name_idx" ON "drug"("facility_id", "generic_name");

-- CreateIndex
CREATE UNIQUE INDEX "drug_facility_id_code_key" ON "drug"("facility_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "drug_interaction_drug_a_id_drug_b_id_key" ON "drug_interaction"("drug_a_id", "drug_b_id");

-- CreateIndex
CREATE INDEX "prescription_visit_id_idx" ON "prescription"("visit_id");

-- CreateIndex
CREATE INDEX "prescription_item_prescription_id_idx" ON "prescription_item"("prescription_id");

-- CreateIndex
CREATE UNIQUE INDEX "lab_test_facility_id_code_key" ON "lab_test"("facility_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "lab_panel_facility_id_code_key" ON "lab_panel"("facility_id", "code");

-- CreateIndex
CREATE INDEX "reference_range_test_id_idx" ON "reference_range"("test_id");

-- CreateIndex
CREATE UNIQUE INDEX "lab_order_order_no_key" ON "lab_order"("order_no");

-- CreateIndex
CREATE INDEX "lab_order_visit_id_idx" ON "lab_order"("visit_id");

-- CreateIndex
CREATE INDEX "lab_order_item_lab_order_id_idx" ON "lab_order_item"("lab_order_id");

-- CreateIndex
CREATE INDEX "lab_order_item_status_idx" ON "lab_order_item"("status");

-- CreateIndex
CREATE UNIQUE INDEX "lab_result_lab_order_item_id_key" ON "lab_result"("lab_order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_facility_id_code_key" ON "service"("facility_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "panel_facility_id_code_key" ON "panel"("facility_id", "code");

-- CreateIndex
CREATE INDEX "invoice_patient_id_idx" ON "invoice"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_facility_id_invoice_no_key" ON "invoice"("facility_id", "invoice_no");

-- CreateIndex
CREATE INDEX "invoice_item_invoice_id_idx" ON "invoice_item"("invoice_id");

-- CreateIndex
CREATE INDEX "payment_invoice_id_idx" ON "payment"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "number_sequence_facility_id_key_year_key" ON "number_sequence"("facility_id", "key", "year");

-- CreateIndex
CREATE UNIQUE INDEX "setting_facility_id_key_key" ON "setting"("facility_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "license_facility_id_key" ON "license"("facility_id");

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room" ADD CONSTRAINT "room_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room" ADD CONSTRAINT "room_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner" ADD CONSTRAINT "practitioner_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner" ADD CONSTRAINT "practitioner_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner" ADD CONSTRAINT "practitioner_speciality_id_fkey" FOREIGN KEY ("speciality_id") REFERENCES "speciality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner_department" ADD CONSTRAINT "practitioner_department_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner_department" ADD CONSTRAINT "practitioner_department_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient" ADD CONSTRAINT "patient_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_identifier" ADD CONSTRAINT "patient_identifier_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allergy" ADD CONSTRAINT "allergy_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allergy" ADD CONSTRAINT "allergy_drug_id_fkey" FOREIGN KEY ("drug_id") REFERENCES "drug"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_status_history" ADD CONSTRAINT "visit_status_history_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vitals" ADD CONSTRAINT "vitals_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnosis" ADD CONSTRAINT "diagnosis_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnosis" ADD CONSTRAINT "diagnosis_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnosis" ADD CONSTRAINT "diagnosis_icd_code_fkey" FOREIGN KEY ("icd_code") REFERENCES "icd_code"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_note" ADD CONSTRAINT "clinical_note_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_note" ADD CONSTRAINT "clinical_note_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template" ADD CONSTRAINT "template_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drug" ADD CONSTRAINT "drug_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drug_interaction" ADD CONSTRAINT "drug_interaction_drug_a_id_fkey" FOREIGN KEY ("drug_a_id") REFERENCES "drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drug_interaction" ADD CONSTRAINT "drug_interaction_drug_b_id_fkey" FOREIGN KEY ("drug_b_id") REFERENCES "drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_item" ADD CONSTRAINT "prescription_item_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_item" ADD CONSTRAINT "prescription_item_drug_id_fkey" FOREIGN KEY ("drug_id") REFERENCES "drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_test" ADD CONSTRAINT "lab_test_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_panel" ADD CONSTRAINT "lab_panel_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_panel_test" ADD CONSTRAINT "lab_panel_test_panel_id_fkey" FOREIGN KEY ("panel_id") REFERENCES "lab_panel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_panel_test" ADD CONSTRAINT "lab_panel_test_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "lab_test"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_range" ADD CONSTRAINT "reference_range_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "lab_test"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_order" ADD CONSTRAINT "lab_order_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_order" ADD CONSTRAINT "lab_order_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_order_item" ADD CONSTRAINT "lab_order_item_lab_order_id_fkey" FOREIGN KEY ("lab_order_id") REFERENCES "lab_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_order_item" ADD CONSTRAINT "lab_order_item_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "lab_test"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_result" ADD CONSTRAINT "lab_result_lab_order_item_id_fkey" FOREIGN KEY ("lab_order_item_id") REFERENCES "lab_order_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service" ADD CONSTRAINT "service_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service" ADD CONSTRAINT "service_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panel" ADD CONSTRAINT "panel_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_panel_id_fkey" FOREIGN KEY ("panel_id") REFERENCES "panel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_item" ADD CONSTRAINT "invoice_item_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_sequence" ADD CONSTRAINT "number_sequence_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting" ADD CONSTRAINT "setting_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license" ADD CONSTRAINT "license_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_module" ADD CONSTRAINT "facility_module_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
