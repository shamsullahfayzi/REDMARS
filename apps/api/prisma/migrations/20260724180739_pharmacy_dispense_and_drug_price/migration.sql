-- AlterTable
ALTER TABLE "drug" ADD COLUMN     "sell_price" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "prescription" ADD COLUMN     "dispensed_at" TIMESTAMP(3),
ADD COLUMN     "dispensed_by" TEXT;
