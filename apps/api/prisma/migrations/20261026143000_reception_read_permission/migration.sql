-- Read-only access to the shared reception operations board.
INSERT INTO "permission" ("id", "code", "resource", "action")
VALUES (gen_random_uuid()::text, 'reception.read', 'reception', 'read')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "role" r CROSS JOIN "permission" p
WHERE r.code IN ('admin','receptionist','nurse','doctor') AND p.code = 'reception.read'
ON CONFLICT DO NOTHING;
