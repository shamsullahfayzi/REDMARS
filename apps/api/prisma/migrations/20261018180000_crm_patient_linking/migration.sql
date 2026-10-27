CREATE TABLE crm_lead_patient (
 id TEXT PRIMARY KEY, facility_id TEXT NOT NULL, lead_id TEXT NOT NULL,
 link_id TEXT NOT NULL, patient_id TEXT NOT NULL, action TEXT NOT NULL,
 created_by TEXT NOT NULL, created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 revoked_at TIMESTAMPTZ(3), revoked_by TEXT, reason TEXT,
 CONSTRAINT crm_lead_patient_lead_fk FOREIGN KEY(lead_id,facility_id) REFERENCES crm_lead(id,facility_id) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT crm_lead_patient_link_fk FOREIGN KEY(link_id,patient_id,facility_id) REFERENCES crm_relationship(id,patient_id,facility_id) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT crm_lead_patient_actor_fk FOREIGN KEY(created_by,facility_id) REFERENCES app_user(id,facility_id) ON DELETE RESTRICT,
 CONSTRAINT crm_lead_patient_revoker_fk FOREIGN KEY(revoked_by,facility_id) REFERENCES app_user(id,facility_id) ON DELETE RESTRICT,
 CONSTRAINT crm_lead_patient_action CHECK(action IN ('linked','registered')),
 CONSTRAINT crm_lead_patient_revocation CHECK((revoked_at IS NULL AND revoked_by IS NULL AND reason IS NULL) OR
 (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND reason IN ('wrong_patient','wrong_lead','duplicate_inquiry','authorization_withdrawn')))
);
CREATE UNIQUE INDEX crm_lead_patient_active ON crm_lead_patient(lead_id) WHERE revoked_at IS NULL;
CREATE INDEX crm_lead_patient_facility_id_lead_id_created_at_idx ON crm_lead_patient(facility_id,lead_id,created_at);
INSERT INTO permission(id,code,resource,action) VALUES
 (gen_random_uuid()::text,'crm.patients.link','crm.patients','link') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permission(role_id,permission_id)
 SELECT r.id,p.id FROM role r CROSS JOIN permission p
 WHERE r.code IN ('admin','call_center') AND p.code='crm.patients.link' ON CONFLICT DO NOTHING;
