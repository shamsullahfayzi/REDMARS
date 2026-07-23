-- The lab order number is issued per facility (the counter restarts at 1 in each), so it is
-- unique WITHIN a facility, not globally — the same rule invoiceNo already follows. A bare
-- UNIQUE on order_no collides the moment a second facility places its first order. This
-- denormalises facility_id onto lab_order (as invoice already carries it) and rescopes the
-- uniqueness. facility_id is backfilled from each order's visit before it is made NOT NULL.

-- 1. Add nullable, backfill from the visit, then enforce.
ALTER TABLE "lab_order" ADD COLUMN "facility_id" TEXT;

UPDATE "lab_order" AS lo
SET "facility_id" = v."facility_id"
FROM "visit" AS v
WHERE v."id" = lo."visit_id";

ALTER TABLE "lab_order" ALTER COLUMN "facility_id" SET NOT NULL;

-- 2. Global unique on order_no becomes per-facility unique.
DROP INDEX "lab_order_order_no_key";
CREATE UNIQUE INDEX "lab_order_facility_id_order_no_key" ON "lab_order"("facility_id", "order_no");

-- 3. The FK, matching invoice's own facility relation (RESTRICT on delete).
CREATE INDEX "lab_order_facility_id_idx" ON "lab_order"("facility_id");
ALTER TABLE "lab_order" ADD CONSTRAINT "lab_order_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
