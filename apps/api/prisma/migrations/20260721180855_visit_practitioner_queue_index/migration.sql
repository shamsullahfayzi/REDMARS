-- CreateIndex
CREATE INDEX "visit_facility_id_practitioner_id_status_started_at_idx" ON "visit"("facility_id", "practitioner_id", "status", "started_at");
