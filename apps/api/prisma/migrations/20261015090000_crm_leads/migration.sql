-- CreateTable
CREATE TABLE "crm_lead" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contact_id" TEXT,
    "owner_id" TEXT,
    "source" TEXT NOT NULL,
    "source_detail" TEXT NOT NULL,
    "service_interest" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "needs_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "service_matched" BOOLEAN NOT NULL DEFAULT false,
    "qualification_notes" TEXT NOT NULL,
    "closed_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "crm_lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_lead_status_change" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "changed_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "crm_lead_status_change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_lead_facility_id_status_updated_at_idx" ON "crm_lead"("facility_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "crm_lead_facility_id_owner_id_status_idx" ON "crm_lead"("facility_id", "owner_id", "status");

-- CreateIndex
CREATE INDEX "crm_lead_facility_id_contact_id_idx" ON "crm_lead"("facility_id", "contact_id");

-- CreateIndex
CREATE INDEX "crm_lead_facility_id_source_idx" ON "crm_lead"("facility_id", "source");

-- CreateIndex
CREATE UNIQUE INDEX "crm_lead_id_facility_id_key" ON "crm_lead"("id", "facility_id");

-- CreateIndex
CREATE INDEX "crm_lead_status_change_facility_id_lead_id_created_at_idx" ON "crm_lead_status_change"("facility_id", "lead_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "crm_lead_status_change_lead_id_sequence_key" ON "crm_lead_status_change"("lead_id", "sequence");

-- AddForeignKey
ALTER TABLE "crm_lead" ADD CONSTRAINT "crm_lead_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead" ADD CONSTRAINT "crm_lead_contact_id_facility_id_fkey" FOREIGN KEY ("contact_id", "facility_id") REFERENCES "crm_contact"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead" ADD CONSTRAINT "crm_lead_owner_id_facility_id_fkey" FOREIGN KEY ("owner_id", "facility_id") REFERENCES "app_user"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead_status_change" ADD CONSTRAINT "crm_lead_status_change_lead_id_facility_id_fkey" FOREIGN KEY ("lead_id", "facility_id") REFERENCES "crm_lead"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead_status_change" ADD CONSTRAINT "crm_lead_status_change_changed_by_facility_id_fkey" FOREIGN KEY ("changed_by", "facility_id") REFERENCES "app_user"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE crm_lead
 ADD CHECK (version >= 0),
 ADD CHECK (status IN ('new','contacted','qualified','on_hold','closed')),
 ADD CHECK (source IN ('phone','walk_in','referral','website','facebook','whatsapp','email','other')),
 ADD CHECK ((status='closed' AND closed_reason IS NOT NULL AND closed_reason IN ('resolved','not_interested','unreachable','duplicate','other')) OR (status<>'closed' AND closed_reason IS NULL)),
 ADD CHECK (status<>'qualified' OR (contact_id IS NOT NULL AND owner_id IS NOT NULL AND length(trim(service_interest))>0 AND needs_confirmed AND service_matched));
ALTER TABLE crm_lead_status_change
 ADD CHECK (sequence >= 0),
 ADD CHECK (from_status IS NULL OR from_status IN ('new','contacted','qualified','on_hold','closed')),
 ADD CHECK (to_status IN ('new','contacted','qualified','on_hold','closed'));
INSERT INTO permission(id,code,resource,action) VALUES
 (gen_random_uuid()::text,'crm.leads.write','crm.leads','write'),
 (gen_random_uuid()::text,'crm.leads.assign','crm.leads','assign')
ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permission(role_id,permission_id)
 SELECT r.id,p.id FROM role r CROSS JOIN permission p
 WHERE (r.code IN ('admin','call_center') AND p.code='crm.leads.write')
    OR (r.code='admin' AND p.code='crm.leads.assign')
ON CONFLICT DO NOTHING;
