-- Existing appointments remain date-only; never invent historical durations.
ALTER TABLE appointment ADD COLUMN ends_at TIMESTAMP(3), ADD COLUMN crm_link_id TEXT, ADD COLUMN crm_lead_id TEXT;
CREATE UNIQUE INDEX crm_relationship_id_patient_id_facility_id_key ON crm_relationship(id,patient_id,facility_id);
ALTER TABLE appointment ADD CONSTRAINT appointment_crm_link_fkey FOREIGN KEY(crm_link_id,patient_id,facility_id) REFERENCES crm_relationship(id,patient_id,facility_id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE appointment ADD CONSTRAINT appointment_crm_lead_fkey FOREIGN KEY(crm_lead_id,facility_id) REFERENCES crm_lead(id,facility_id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE appointment ADD CONSTRAINT appointment_duration_check CHECK(ends_at IS NULL OR (practitioner_id IS NOT NULL AND ends_at >= scheduled_at + INTERVAL '5 minutes' AND ends_at <= scheduled_at + INTERVAL '240 minutes'));
ALTER TABLE appointment ADD CONSTRAINT appointment_crm_source_check CHECK(crm_lead_id IS NULL OR crm_link_id IS NOT NULL);
CREATE EXTENSION IF NOT EXISTS btree_gist;
-- Half-open ranges permit adjacent appointments and protect all writers.
ALTER TABLE appointment ADD CONSTRAINT appointment_provider_overlap EXCLUDE USING gist
 (facility_id WITH =, practitioner_id WITH =, tsrange(scheduled_at,ends_at,'[)') WITH &&)
 WHERE (ends_at IS NOT NULL AND status IN ('booked','arrived','fulfilled'));
ALTER TABLE appointment ADD CONSTRAINT appointment_patient_overlap EXCLUDE USING gist
 (facility_id WITH =, patient_id WITH =, tsrange(scheduled_at,ends_at,'[)') WITH &&)
 WHERE (ends_at IS NOT NULL AND status IN ('booked','arrived','fulfilled'));
INSERT INTO permission(id,code,resource,action) VALUES
 (gen_random_uuid()::text,'crm.appointments.write','crm.appointments','write') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permission(role_id,permission_id)
 SELECT r.id,p.id FROM role r CROSS JOIN permission p
 WHERE r.code IN ('admin','call_center') AND p.code='crm.appointments.write' ON CONFLICT DO NOTHING;
