-- AlterTable
ALTER TABLE "crm_interaction" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'interaction';

-- CreateTable
CREATE TABLE "crm_call" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "interaction_id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "caller_phone" TEXT NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "next_action" TEXT NOT NULL,
    "action_note" TEXT NOT NULL,
    "related_call_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMPTZ(3),
    "completed_by" TEXT,
    "completion_note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "crm_call_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_call_interaction_id_key" ON "crm_call"("interaction_id");

-- CreateIndex
CREATE INDEX "crm_call_facility_id_state_completed_at_idx" ON "crm_call"("facility_id", "state", "completed_at");

-- CreateIndex
CREATE INDEX "crm_call_facility_id_caller_phone_idx" ON "crm_call"("facility_id", "caller_phone");

-- CreateIndex
CREATE UNIQUE INDEX "crm_call_id_facility_id_key" ON "crm_call"("id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_call_interaction_id_facility_id_key" ON "crm_call"("interaction_id", "facility_id");

-- AddForeignKey
ALTER TABLE "crm_call" ADD CONSTRAINT "crm_call_interaction_id_facility_id_fkey" FOREIGN KEY ("interaction_id", "facility_id") REFERENCES "crm_interaction"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_call" ADD CONSTRAINT "crm_call_related_call_id_facility_id_fkey" FOREIGN KEY ("related_call_id", "facility_id") REFERENCES "crm_call"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_call" ADD CONSTRAINT "crm_call_completed_by_facility_id_fkey" FOREIGN KEY ("completed_by", "facility_id") REFERENCES "app_user"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE crm_interaction DROP CONSTRAINT crm_interaction_check;
ALTER TABLE crm_interaction
 ADD CHECK (kind IN ('interaction','call')),
 ADD CHECK (kind='call' OR lead_id IS NOT NULL OR contact_id IS NOT NULL),
 ADD CHECK (kind<>'call' OR (channel='call' AND direction IN ('inbound','outbound')));
ALTER TABLE crm_call
 ADD CHECK (state IN ('answered','missed','no_answer')),
 ADD CHECK (next_action IN ('none','callback','provide_information','escalate','clinical_follow_up')),
 ADD CHECK (version>=0),
 ADD CHECK ((completed_at IS NULL)=(completed_by IS NULL)),
 ADD CHECK (next_action<>'none' OR completed_at IS NOT NULL),
 ADD CHECK (next_action='none' OR length(trim(action_note))>=3),
 ADD CHECK ((state='answered')=(ended_at IS NOT NULL)),
 ADD CHECK (state='answered' OR next_action<>'none'),
 ADD CHECK (related_call_id IS NULL OR related_call_id<>id);
INSERT INTO permission(id,code,resource,action) VALUES
 (gen_random_uuid()::text,'crm.calls.write','crm.calls','write') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permission(role_id,permission_id)
 SELECT r.id,p.id FROM role r CROSS JOIN permission p
 WHERE r.code IN ('admin','call_center') AND p.code='crm.calls.write' ON CONFLICT DO NOTHING;
