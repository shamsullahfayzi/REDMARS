-- DropIndex
DROP INDEX "lab_order_facility_id_idx";

-- AlterTable
ALTER TABLE "invoice" ADD COLUMN     "discount_approved_at" TIMESTAMP(3),
ADD COLUMN     "discount_approved_by" TEXT;
