-- Align the deposit-to-invoice constraint name with Prisma's generated model.
ALTER TABLE "reception_patient_deposit"
  RENAME CONSTRAINT "reception_patient_deposit_invoice_id_facility_id_fkey"
  TO "reception_patient_deposit_applied_invoice_id_facility_id_fkey";
