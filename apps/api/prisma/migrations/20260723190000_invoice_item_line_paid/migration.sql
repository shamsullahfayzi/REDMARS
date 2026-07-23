-- Per-line settlement. An invoice can carry several lab tests, and a patient may pay for only
-- some of them, so paid-ness moves onto the LINE rather than living solely as one invoice
-- total. Backfill so existing data stays truthful: any line on an already-paid invoice is
-- paid, and any zero-cost line owes nothing and is treated as paid from birth.

ALTER TABLE "invoice_item"
  ADD COLUMN "is_paid" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "paid_at" TIMESTAMP(3);

-- Lines on invoices already settled in full (the reception check-in path pays in one shot).
UPDATE "invoice_item" AS ii
SET "is_paid" = true, "paid_at" = now()
FROM "invoice" AS inv
WHERE inv."id" = ii."invoice_id" AND inv."status" = 'paid';

-- Zero-cost lines owe nothing — paid by definition, whatever the invoice status.
UPDATE "invoice_item"
SET "is_paid" = true, "paid_at" = COALESCE("paid_at", now())
WHERE "total" = 0;
