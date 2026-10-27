-- CreateTable
CREATE TABLE "crm_contact" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "alt_phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "preferred_channel" TEXT NOT NULL,
    "safe_instructions" TEXT NOT NULL,
    "do_not_contact" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_relationship" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "authority" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT,
    "authorized_by" TEXT,
    "authorized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_consent" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "link_id" TEXT,
    "channel" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "recorded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "crm_consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_verification" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "link_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "verified_by" TEXT NOT NULL,
    "contact_version" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_contact_facility_id_name_key_idx" ON "crm_contact"("facility_id", "name_key");

-- CreateIndex
CREATE INDEX "crm_contact_facility_id_phone_idx" ON "crm_contact"("facility_id", "phone");

-- CreateIndex
CREATE INDEX "crm_contact_facility_id_alt_phone_idx" ON "crm_contact"("facility_id", "alt_phone");

-- CreateIndex
CREATE UNIQUE INDEX "crm_contact_id_facility_id_key" ON "crm_contact"("id", "facility_id");

-- CreateIndex
CREATE INDEX "crm_relationship_facility_id_patient_id_idx" ON "crm_relationship"("facility_id", "patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_relationship_contact_id_patient_id_key" ON "crm_relationship"("contact_id", "patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_relationship_id_contact_id_facility_id_key" ON "crm_relationship"("id", "contact_id", "facility_id");

-- CreateIndex
CREATE INDEX "crm_consent_facility_id_contact_id_sequence_idx" ON "crm_consent"("facility_id", "contact_id", "sequence");

-- CreateIndex
CREATE INDEX "crm_verification_facility_id_link_id_verified_by_created_at_idx" ON "crm_verification"("facility_id", "link_id", "verified_by", "created_at");

-- AddForeignKey
ALTER TABLE "crm_contact" ADD CONSTRAINT "crm_contact_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_relationship" ADD CONSTRAINT "crm_relationship_contact_id_facility_id_fkey" FOREIGN KEY ("contact_id", "facility_id") REFERENCES "crm_contact"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_relationship" ADD CONSTRAINT "crm_relationship_patient_id_facility_id_fkey" FOREIGN KEY ("patient_id", "facility_id") REFERENCES "patient"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_consent" ADD CONSTRAINT "crm_consent_contact_id_facility_id_fkey" FOREIGN KEY ("contact_id", "facility_id") REFERENCES "crm_contact"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_consent" ADD CONSTRAINT "crm_consent_link_id_contact_id_facility_id_fkey" FOREIGN KEY ("link_id", "contact_id", "facility_id") REFERENCES "crm_relationship"("id", "contact_id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_verification" ADD CONSTRAINT "crm_verification_link_id_contact_id_facility_id_fkey" FOREIGN KEY ("link_id", "contact_id", "facility_id") REFERENCES "crm_relationship"("id", "contact_id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Closed vocabularies and consent scope are protected even for direct DB writes.
ALTER TABLE crm_contact ADD CHECK (version >= 0), ADD CHECK (language IN ('prs','ps','en','other')), ADD CHECK (preferred_channel IN ('call','sms','whatsapp','email'));
ALTER TABLE crm_relationship ADD CHECK (authority IN ('pending','scheduling','follow_up','both','revoked')), ADD CHECK (relationship IN ('self','parent','spouse','sibling','child','guardian','other')), ADD CHECK (authority = 'pending' OR (source IN ('verbal','written','legal_guardian') AND authorized_by IS NOT NULL AND authorized_at IS NOT NULL));
ALTER TABLE crm_consent ADD CHECK (channel IN ('call','sms','whatsapp','email')), ADD CHECK (status IN ('granted','withdrawn')), ADD CHECK (source IN ('verbal','written','legal_guardian')), ADD CHECK ((purpose = 'enquiry' AND link_id IS NULL) OR (purpose IN ('scheduling','follow_up') AND link_id IS NOT NULL)), ADD CHECK (sequence > 0);
ALTER TABLE crm_verification ADD CHECK (method IN ('identity_document','approved_questions')), ADD CHECK (contact_version > 0);
INSERT INTO permission(id,code,resource,action) VALUES
 (gen_random_uuid()::text,'crm.contacts.write','crm.contacts','write'),
 (gen_random_uuid()::text,'crm.contacts.authorize','crm.contacts','authorize')
ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permission(role_id,permission_id)
 SELECT r.id,p.id FROM role r CROSS JOIN permission p
 WHERE (r.code IN ('admin','call_center') AND p.code='crm.contacts.write')
    OR (r.code='admin' AND p.code='crm.contacts.authorize')
ON CONFLICT DO NOTHING;
