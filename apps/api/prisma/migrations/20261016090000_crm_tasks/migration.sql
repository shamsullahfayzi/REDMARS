-- CreateTable
CREATE TABLE "crm_task" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "interaction_id" TEXT NOT NULL,
    "prescription_id" TEXT,
    "owner_id" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "reminder_at" TIMESTAMPTZ(3),
    "reminder_acknowledged_at" TIMESTAMPTZ(3),
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "outcome" TEXT NOT NULL DEFAULT '',
    "escalations" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "crm_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_task_history" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "event" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "owner_id" TEXT,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "reminder_at" TIMESTAMPTZ(3),
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "changed_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_task_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_task_facility_id_owner_id_status_due_at_idx" ON "crm_task"("facility_id", "owner_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "crm_task_facility_id_status_reminder_at_idx" ON "crm_task"("facility_id", "status", "reminder_at");

-- CreateIndex
CREATE UNIQUE INDEX "crm_task_id_facility_id_key" ON "crm_task"("id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_task_history_task_id_version_key" ON "crm_task_history"("task_id", "version");

-- AddForeignKey
ALTER TABLE "crm_task" ADD CONSTRAINT "crm_task_interaction_id_facility_id_fkey" FOREIGN KEY ("interaction_id", "facility_id") REFERENCES "crm_interaction"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_task" ADD CONSTRAINT "crm_task_owner_id_facility_id_fkey" FOREIGN KEY ("owner_id", "facility_id") REFERENCES "app_user"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_task" ADD CONSTRAINT "crm_task_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_task_history" ADD CONSTRAINT "crm_task_history_task_id_facility_id_fkey" FOREIGN KEY ("task_id", "facility_id") REFERENCES "crm_task"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_task_history" ADD CONSTRAINT "crm_task_history_changed_by_facility_id_fkey" FOREIGN KEY ("changed_by", "facility_id") REFERENCES "app_user"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_task_history" ADD CONSTRAINT "crm_task_history_owner_id_facility_id_fkey" FOREIGN KEY ("owner_id", "facility_id") REFERENCES "app_user"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE crm_task
 ADD CHECK (priority IN ('low','normal','high','urgent')),
 ADD CHECK (status IN ('open','in_progress','completed','cancelled')),
 ADD CHECK (version>=0 AND escalations>=0),
 ADD CHECK (reminder_at IS NULL OR reminder_at<=due_at),
 ADD CHECK (reminder_acknowledged_at IS NULL OR reminder_at IS NOT NULL),
 ADD CHECK ((status IN ('completed','cancelled') AND closed_at IS NOT NULL AND length(trim(outcome))>=3) OR (status IN ('open','in_progress') AND closed_at IS NULL AND outcome='')),
 ADD CHECK (status<>'in_progress' OR owner_id IS NOT NULL);
ALTER TABLE crm_task_history ADD CHECK (version>=0);
INSERT INTO permission(id,code,resource,action) VALUES
 (gen_random_uuid()::text,'crm.tasks.write','crm.tasks','write'),
 (gen_random_uuid()::text,'crm.tasks.assign','crm.tasks','assign') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permission(role_id,permission_id)
 SELECT r.id,p.id FROM role r CROSS JOIN permission p
 WHERE (r.code IN ('admin','call_center') AND p.code='crm.tasks.write')
 OR (r.code='admin' AND p.code='crm.tasks.assign') ON CONFLICT DO NOTHING;
