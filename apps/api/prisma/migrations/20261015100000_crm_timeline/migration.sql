-- CreateTable
CREATE TABLE "crm_interaction" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "contact_id" TEXT,
    "link_id" TEXT,
    "purpose" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "recorded_by" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "voided" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "crm_interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_interaction_revision" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "interaction_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "voided" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "changed_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_interaction_revision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_interaction_facility_id_lead_id_occurred_at_idx" ON "crm_interaction"("facility_id", "lead_id", "occurred_at");

-- CreateIndex
CREATE INDEX "crm_interaction_facility_id_contact_id_occurred_at_idx" ON "crm_interaction"("facility_id", "contact_id", "occurred_at");

-- CreateIndex
CREATE INDEX "crm_interaction_facility_id_expires_at_idx" ON "crm_interaction"("facility_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "crm_interaction_id_facility_id_key" ON "crm_interaction"("id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_interaction_revision_interaction_id_version_key" ON "crm_interaction_revision"("interaction_id", "version");

-- AddForeignKey
ALTER TABLE "crm_interaction" ADD CONSTRAINT "crm_interaction_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_interaction" ADD CONSTRAINT "crm_interaction_lead_id_facility_id_fkey" FOREIGN KEY ("lead_id", "facility_id") REFERENCES "crm_lead"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_interaction" ADD CONSTRAINT "crm_interaction_contact_id_facility_id_fkey" FOREIGN KEY ("contact_id", "facility_id") REFERENCES "crm_contact"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_interaction" ADD CONSTRAINT "crm_interaction_link_id_contact_id_facility_id_fkey" FOREIGN KEY ("link_id", "contact_id", "facility_id") REFERENCES "crm_relationship"("id", "contact_id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_interaction" ADD CONSTRAINT "crm_interaction_recorded_by_facility_id_fkey" FOREIGN KEY ("recorded_by", "facility_id") REFERENCES "app_user"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_interaction_revision" ADD CONSTRAINT "crm_interaction_revision_interaction_id_facility_id_fkey" FOREIGN KEY ("interaction_id", "facility_id") REFERENCES "crm_interaction"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_interaction_revision" ADD CONSTRAINT "crm_interaction_revision_changed_by_facility_id_fkey" FOREIGN KEY ("changed_by", "facility_id") REFERENCES "app_user"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE crm_interaction
 ADD CHECK (lead_id IS NOT NULL OR contact_id IS NOT NULL),
 ADD CHECK ((link_id IS NULL AND purpose='enquiry') OR (link_id IS NOT NULL AND contact_id IS NOT NULL AND purpose IN ('scheduling','follow_up'))),
 ADD CHECK (channel IN ('call','in_person','sms','whatsapp','email','other')),
 ADD CHECK (direction IN ('inbound','outbound','internal')),
 ADD CHECK (outcome IN ('information_given','follow_up_needed','no_response','escalated','other')),
 ADD CHECK (version>=0 AND expires_at>occurred_at);
ALTER TABLE crm_interaction_revision ADD CHECK (version>=0), ADD CHECK (outcome IN ('information_given','follow_up_needed','no_response','escalated','other'));
INSERT INTO permission(id,code,resource,action) VALUES
 (gen_random_uuid()::text,'crm.interactions.write','crm.interactions','write'),
 (gen_random_uuid()::text,'crm.interactions.correct','crm.interactions','correct') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permission(role_id,permission_id)
 SELECT r.id,p.id FROM role r CROSS JOIN permission p
 WHERE (r.code IN ('admin','call_center') AND p.code='crm.interactions.write')
 OR (r.code='admin' AND p.code='crm.interactions.correct') ON CONFLICT DO NOTHING;
