BEGIN;
ALTER TABLE finance_supplier ADD COLUMN terms_days integer NOT NULL DEFAULT 0 CHECK(terms_days BETWEEN 0 AND 365), ADD COLUMN terms text NOT NULL DEFAULT '', ADD COLUMN contact text NOT NULL DEFAULT '';
CREATE TABLE finance_cost_centre (
 id text PRIMARY KEY, facility_id text NOT NULL REFERENCES facility(id) ON DELETE RESTRICT,
 code text NOT NULL, name text NOT NULL, is_active boolean NOT NULL DEFAULT true,
 UNIQUE(id,facility_id), UNIQUE(facility_id,code)
);
ALTER TABLE finance_journal_line ADD COLUMN cost_centre_id text,
 ADD CONSTRAINT finance_line_centre_fk FOREIGN KEY(cost_centre_id,facility_id) REFERENCES finance_cost_centre(id,facility_id) ON DELETE RESTRICT;
CREATE TABLE finance_expense_mapping (
 id text PRIMARY KEY, facility_id text NOT NULL REFERENCES facility(id) ON DELETE RESTRICT,
 category text NOT NULL, account_id text NOT NULL, cost_centre_id text,
 UNIQUE(facility_id,category),
 FOREIGN KEY(account_id,facility_id) REFERENCES finance_account(id,facility_id) ON DELETE RESTRICT,
 FOREIGN KEY(cost_centre_id,facility_id) REFERENCES finance_cost_centre(id,facility_id) ON DELETE RESTRICT
);
CREATE TABLE finance_procurement_receipt (
 id text PRIMARY KEY, facility_id text NOT NULL REFERENCES facility(id) ON DELETE RESTRICT,
 supplier_id text NOT NULL, source_system text NOT NULL, po_reference text NOT NULL, grn_reference text NOT NULL,
 received_on timestamptz(3) NOT NULL, lines jsonb NOT NULL,
 amount numeric(18,2) NOT NULL CHECK(amount>0 AND amount::text NOT IN ('NaN','Infinity','-Infinity')),
 created_by text NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(id,facility_id), UNIQUE(facility_id,source_system,grn_reference),
 FOREIGN KEY(supplier_id,facility_id) REFERENCES finance_supplier(id,facility_id) ON DELETE RESTRICT,
 FOREIGN KEY(created_by,facility_id) REFERENCES app_user(id,facility_id) ON DELETE RESTRICT
);
ALTER TABLE finance_bill ADD COLUMN kind text NOT NULL DEFAULT 'bill' CHECK(kind IN ('bill','opening','procurement')),
 ADD COLUMN receipt_id text UNIQUE,
 ADD CONSTRAINT finance_bill_receipt_fk FOREIGN KEY(receipt_id,facility_id) REFERENCES finance_procurement_receipt(id,facility_id) ON DELETE RESTRICT;
DROP INDEX finance_settlement_journal_id_key;
DROP INDEX finance_settlement_journal_id_facility_id_key;
CREATE UNIQUE INDEX finance_settlement_journal_id_bill_id_key ON finance_settlement(journal_id,bill_id);
CREATE TRIGGER finance_receipt_immutable BEFORE UPDATE OR DELETE ON finance_procurement_receipt FOR EACH ROW EXECUTE FUNCTION finance_immutable_source();
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['finance_cost_centre','finance_expense_mapping','finance_procurement_receipt'] LOOP
 EXECUTE format('CREATE TRIGGER finance_capture_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION finance_capture_audit()',tbl);
 END LOOP;
END $$;

CREATE FUNCTION finance_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b finance_bill; j finance_journal; reserved numeric;
BEGIN
 SELECT * INTO b FROM finance_bill WHERE id=NEW.bill_id AND facility_id=NEW.facility_id FOR UPDATE;
 SELECT * INTO j FROM finance_journal WHERE id=NEW.journal_id AND facility_id=NEW.facility_id FOR UPDATE;
 IF b.id IS NULL OR j.id IS NULL OR j.status<>'draft' OR j.source_type<>'supplier_payment' THEN RAISE EXCEPTION 'Invalid supplier payment source'; END IF;
 IF NOT EXISTS(SELECT 1 FROM finance_journal WHERE id=b.journal_id AND status='posted' AND date<=j.date)
 OR EXISTS(SELECT 1 FROM finance_journal WHERE reversal_of_id=b.journal_id) THEN RAISE EXCEPTION 'Payment needs a posted bill without reversal and cannot predate it'; END IF;
 IF EXISTS(SELECT 1 FROM finance_settlement s JOIN finance_bill other ON other.id=s.bill_id WHERE s.journal_id=j.id AND other.supplier_id<>b.supplier_id) THEN RAISE EXCEPTION 'One payment must belong to one supplier'; END IF;
 SELECT COALESCE(sum(s.amount),0) INTO reserved FROM finance_settlement s JOIN finance_journal p ON p.id=s.journal_id
 LEFT JOIN finance_journal r ON r.reversal_of_id=p.id AND r.status='posted' WHERE s.bill_id=b.id AND r.id IS NULL;
 IF reserved+NEW.amount>b.amount THEN RAISE EXCEPTION 'Payment exceeds balance after reserved drafts'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_allocation_guard BEFORE INSERT ON finance_settlement FOR EACH ROW EXECUTE FUNCTION finance_allocation_guard();

CREATE FUNCTION finance_payable_post_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b finance_bill; allocated numeric; ap text; r finance_procurement_receipt;
BEGIN
 IF NEW.status<>'posted' THEN RETURN NEW; END IF;
 SELECT id INTO ap FROM finance_account WHERE facility_id=NEW.facility_id AND system_key='payable';
 IF EXISTS(SELECT 1 FROM finance_journal_line l JOIN finance_cost_centre c ON c.id=l.cost_centre_id WHERE l.journal_id=NEW.id AND NOT c.is_active) THEN RAISE EXCEPTION 'Inactive cost centre'; END IF;
 IF NEW.reversal_of_id IS NOT NULL AND (
  EXISTS(SELECT account_id,cost_centre_id,debit,credit FROM finance_journal_line WHERE journal_id=NEW.id EXCEPT ALL SELECT account_id,cost_centre_id,credit,debit FROM finance_journal_line WHERE journal_id=NEW.reversal_of_id)
  OR EXISTS(SELECT account_id,cost_centre_id,credit,debit FROM finance_journal_line WHERE journal_id=NEW.reversal_of_id EXCEPT ALL SELECT account_id,cost_centre_id,debit,credit FROM finance_journal_line WHERE journal_id=NEW.id)
 ) THEN RAISE EXCEPTION 'Reversal must preserve cost centres'; END IF;
 IF NEW.source_type='supplier_bill' THEN
  SELECT * INTO b FROM finance_bill WHERE journal_id=NEW.id AND facility_id=NEW.facility_id;
  IF b.id IS NULL OR b.amount<>(SELECT COALESCE(sum(credit-debit),0) FROM finance_journal_line WHERE journal_id=NEW.id AND account_id=ap)
   OR EXISTS(SELECT 1 FROM finance_journal_line l JOIN finance_account a ON a.id=l.account_id WHERE l.journal_id=NEW.id AND l.debit>0 AND (a.is_cash OR a.is_control OR (b.kind<>'opening' AND a.type NOT IN ('expense','asset')) OR (b.kind='opening' AND a.system_key IS DISTINCT FROM 'opening')))
   OR (b.kind<>'opening' AND b.due_on<NEW.date) THEN RAISE EXCEPTION 'Bill must match its payable and expense/asset journal'; END IF;
  IF b.kind='opening' AND NEW.date<>(SELECT cutover_date FROM finance_settings WHERE facility_id=NEW.facility_id) THEN RAISE EXCEPTION 'Opening supplier balance must use cutover date'; END IF;
  IF b.kind='procurement' THEN
   SELECT * INTO r FROM finance_procurement_receipt WHERE id=b.receipt_id AND facility_id=NEW.facility_id;
   IF r.id IS NULL OR r.supplier_id<>b.supplier_id OR r.amount<>b.amount OR NEW.date<r.received_on THEN RAISE EXCEPTION 'Procurement bill must match received goods'; END IF;
  END IF;
 END IF;
 IF NEW.source_type='supplier_payment' THEN
  SELECT COALESCE(sum(amount),0) INTO allocated FROM finance_settlement WHERE journal_id=NEW.id;
  IF allocated<=0 OR allocated<>(SELECT COALESCE(sum(debit-credit),0) FROM finance_journal_line WHERE journal_id=NEW.id AND account_id=ap)
   OR allocated<>(SELECT COALESCE(sum(l.credit-l.debit),0) FROM finance_journal_line l JOIN finance_account a ON a.id=l.account_id WHERE l.journal_id=NEW.id AND a.is_cash)
   OR EXISTS(SELECT 1 FROM finance_journal_line l JOIN finance_account a ON a.id=l.account_id WHERE l.journal_id=NEW.id AND l.account_id<>ap AND NOT a.is_cash)
   OR (SELECT count(DISTINCT b.supplier_id) FROM finance_settlement s JOIN finance_bill b ON b.id=s.bill_id WHERE s.journal_id=NEW.id)<>1 THEN RAISE EXCEPTION 'Payment journal must match all allocations'; END IF;
  FOR b IN SELECT bill.* FROM finance_bill bill JOIN finance_settlement s ON s.bill_id=bill.id WHERE s.journal_id=NEW.id ORDER BY bill.id FOR UPDATE OF bill LOOP
   IF NOT EXISTS(SELECT 1 FROM finance_journal WHERE id=b.journal_id AND status='posted' AND date<=NEW.date)
    OR EXISTS(SELECT 1 FROM finance_journal WHERE reversal_of_id=b.journal_id) THEN RAISE EXCEPTION 'Payment needs posted bills without pending reversals'; END IF;
   IF (SELECT COALESCE(sum(s.amount),0) FROM finance_settlement s JOIN finance_journal j ON j.id=s.journal_id LEFT JOIN finance_journal rev ON rev.reversal_of_id=j.id AND rev.status='posted' WHERE s.bill_id=b.id AND rev.id IS NULL)>b.amount THEN RAISE EXCEPTION 'Payment exceeds bill after reserved drafts'; END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_payable_post_guard BEFORE INSERT OR UPDATE ON finance_journal FOR EACH ROW EXECUTE FUNCTION finance_payable_post_guard();
COMMIT;
