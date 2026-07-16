-- Split the single local-name column into Dari (prs) and Pashto (ps) on every
-- table that had one: facility, department, lab_test.
--
-- RENAME, not drop-and-add: the existing name_local values are Dari, so they move
-- intact into name_local_prs. A fresh ADD/DROP would have thrown that data away.

ALTER TABLE "facility" RENAME COLUMN "name_local" TO "name_local_prs";
ALTER TABLE "facility" ADD COLUMN "name_local_ps" TEXT;

ALTER TABLE "department" RENAME COLUMN "name_local" TO "name_local_prs";
ALTER TABLE "department" ADD COLUMN "name_local_ps" TEXT;

ALTER TABLE "lab_test" RENAME COLUMN "name_local" TO "name_local_prs";
ALTER TABLE "lab_test" ADD COLUMN "name_local_ps" TEXT;
