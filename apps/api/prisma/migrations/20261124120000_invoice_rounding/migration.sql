BEGIN;
ALTER TABLE invoice ADD COLUMN rounding_adjustment DECIMAL(3,2);
ALTER TABLE invoice DROP CONSTRAINT invoice_money_valid;
ALTER TABLE invoice ADD CONSTRAINT invoice_money_valid CHECK (
  subtotal >= 0 AND discount >= 0 AND discount <= subtotal AND
  (rounding_adjustment IS NULL OR (rounding_adjustment >= 0 AND rounding_adjustment < 1 AND total = floor(subtotal - discount))) AND
  total = subtotal - discount - coalesce(rounding_adjustment, 0) AND paid_amount >= 0 AND paid_amount <= total
) NOT VALID;
COMMIT;
