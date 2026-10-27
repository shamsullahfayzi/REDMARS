-- Additive registration. CRM remains off until an administrator enables it.
ALTER TYPE "ModuleKey" ADD VALUE IF NOT EXISTS 'crm';

CREATE TABLE "rate_limit_bucket" (
  "key" TEXT PRIMARY KEY,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "count" INTEGER NOT NULL CHECK ("count" > 0)
);
CREATE INDEX "rate_limit_bucket_expires_at_idx" ON "rate_limit_bucket" ("expires_at");

INSERT INTO permission(id,code,resource,action) VALUES
 (gen_random_uuid()::text,'crm.read','crm','read'),
 (gen_random_uuid()::text,'crm.configure','crm','configure')
ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permission(role_id,permission_id)
 SELECT r.id,p.id FROM role r CROSS JOIN permission p
 WHERE (r.code IN ('admin','call_center') AND p.code='crm.read')
    OR (r.code='call_center' AND p.code IN ('auth.login','auth.me'))
    OR (r.code='admin' AND p.code='crm.configure')
ON CONFLICT DO NOTHING;
