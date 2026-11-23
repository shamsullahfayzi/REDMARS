-- AlterTable
ALTER TABLE "drug" ADD COLUMN     "reorder_threshold" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "pharmacy_batch" (
    "id" TEXT NOT NULL,
    "drug_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "lot" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "expires_on" DATE NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quarantined" BOOLEAN NOT NULL DEFAULT false,
    "receipt_key" TEXT NOT NULL,

    CONSTRAINT "pharmacy_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pharmacy_movement" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "item_id" TEXT,
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "actor_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pharmacy_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pharmacy_alternative" (
    "drug_id" TEXT NOT NULL,
    "alternative_id" TEXT NOT NULL,

    CONSTRAINT "pharmacy_alternative_pkey" PRIMARY KEY ("drug_id","alternative_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pharmacy_batch_receipt_key_key" ON "pharmacy_batch"("receipt_key");

-- CreateIndex
CREATE INDEX "pharmacy_batch_drug_id_expires_on_id_idx" ON "pharmacy_batch"("drug_id", "expires_on", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacy_movement_batch_id_item_id_kind_key" ON "pharmacy_movement"("batch_id", "item_id", "kind");

-- AddForeignKey
ALTER TABLE "pharmacy_batch" ADD CONSTRAINT "pharmacy_batch_drug_id_fkey" FOREIGN KEY ("drug_id") REFERENCES "drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_batch" ADD CONSTRAINT "pharmacy_batch_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "finance_supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_movement" ADD CONSTRAINT "pharmacy_movement_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "pharmacy_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_movement" ADD CONSTRAINT "pharmacy_movement_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "prescription_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_alternative" ADD CONSTRAINT "pharmacy_alternative_drug_id_fkey" FOREIGN KEY ("drug_id") REFERENCES "drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_alternative" ADD CONSTRAINT "pharmacy_alternative_alternative_id_fkey" FOREIGN KEY ("alternative_id") REFERENCES "drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE pharmacy_batch ADD CHECK (quantity >= 0);
ALTER TABLE drug ADD CHECK (reorder_threshold >= 0);
ALTER TABLE pharmacy_alternative ADD CHECK (drug_id <> alternative_id);

INSERT INTO permission (id, code, resource, action)
SELECT gen_random_uuid()::text, 'inventory.' || action, 'inventory', action
FROM unnest(ARRAY['view','manage','availability']) AS action ON CONFLICT DO NOTHING;
INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r CROSS JOIN permission p
WHERE (p.code = 'inventory.view' AND r.code IN ('admin','pharmacist','management'))
   OR (p.code = 'inventory.manage' AND r.code IN ('admin','pharmacist'))
   OR (p.code = 'inventory.availability' AND r.code IN ('admin','pharmacist','doctor'))
ON CONFLICT DO NOTHING;
