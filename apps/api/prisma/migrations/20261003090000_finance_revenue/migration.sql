BEGIN;
CREATE SEQUENCE integration_event_sequence_seq;
ALTER TABLE integration_event ADD COLUMN sequence integer;
WITH ordered AS (SELECT id,row_number() OVER(ORDER BY occurred_at,id) AS n FROM integration_event)
UPDATE integration_event e SET sequence=o.n FROM ordered o WHERE o.id=e.id;
SELECT setval('integration_event_sequence_seq',COALESCE((SELECT max(sequence) FROM integration_event),0)+1,false);
ALTER TABLE integration_event ALTER COLUMN sequence SET DEFAULT nextval('integration_event_sequence_seq'), ALTER COLUMN sequence SET NOT NULL;
ALTER SEQUENCE integration_event_sequence_seq OWNED BY integration_event.sequence;
CREATE UNIQUE INDEX integration_event_sequence_key ON integration_event(sequence);
CREATE UNIQUE INDEX invoice_id_facility_id_key ON invoice(id,facility_id);
CREATE UNIQUE INDEX panel_id_facility_id_key ON panel(id,facility_id);
ALTER TABLE invoice DROP CONSTRAINT invoice_panel_id_fkey;
ALTER TABLE invoice ADD CONSTRAINT invoice_panel_id_facility_id_fkey FOREIGN KEY(panel_id,facility_id) REFERENCES panel(id,facility_id) ON DELETE RESTRICT;
ALTER TABLE finance_journal ADD COLUMN invoice_id text, ADD COLUMN payment_id text, ADD COLUMN panel_id text;
ALTER TABLE finance_journal ADD CONSTRAINT finance_journal_invoice_fk FOREIGN KEY(invoice_id,facility_id) REFERENCES invoice(id,facility_id) ON DELETE RESTRICT,
 ADD CONSTRAINT finance_journal_panel_fk FOREIGN KEY(panel_id,facility_id) REFERENCES panel(id,facility_id) ON DELETE RESTRICT;
-- Backfill source links without changing a single posted amount or date.
ALTER TABLE finance_journal DISABLE TRIGGER finance_journal_guard;
ALTER TABLE finance_journal DISABLE TRIGGER finance_review_guard;
UPDATE finance_journal j SET invoice_id=i.id, panel_id=i.panel_id
 FROM integration_event e,invoice i WHERE j.source_type='hospital' AND j.source_id=e.id
 AND e.aggregate_type='Invoice' AND i.id=e.aggregate_id AND i.facility_id=j.facility_id;
UPDATE finance_journal j SET invoice_id=i.id,payment_id=p.id,panel_id=i.panel_id
 FROM integration_event e,payment p,invoice i WHERE j.source_type='hospital' AND j.source_id=e.id
 AND e.aggregate_type='Payment' AND p.id=e.aggregate_id AND i.id=p.invoice_id AND i.facility_id=j.facility_id;
ALTER TABLE finance_journal ENABLE TRIGGER finance_journal_guard;
ALTER TABLE finance_journal ENABLE TRIGGER finance_review_guard;

CREATE TABLE finance_revenue_mapping (
 id text PRIMARY KEY, facility_id text NOT NULL REFERENCES facility(id) ON DELETE RESTRICT,
 category text NOT NULL, account_id text NOT NULL,
 CONSTRAINT finance_mapping_account_fk FOREIGN KEY(account_id,facility_id) REFERENCES finance_account(id,facility_id) ON DELETE RESTRICT,
 CONSTRAINT finance_mapping_category CHECK(category IN ('consultation','laboratory','pharmacy','procedure','registration','other','discount','refund') OR category ~ '^service:[a-f0-9-]{36}$')
);
CREATE UNIQUE INDEX finance_revenue_mapping_facility_id_category_key ON finance_revenue_mapping(facility_id,category);
CREATE TABLE finance_invoice_state (
 id text PRIMARY KEY,facility_id text NOT NULL REFERENCES facility(id) ON DELETE RESTRICT,
 invoice_id text NOT NULL,target jsonb NOT NULL,
 FOREIGN KEY(invoice_id,facility_id) REFERENCES invoice(id,facility_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX finance_invoice_state_invoice_id_key ON finance_invoice_state(invoice_id);
CREATE UNIQUE INDEX finance_invoice_state_invoice_id_facility_id_key ON finance_invoice_state(invoice_id,facility_id);
CREATE FUNCTION finance_mapping_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM finance_account WHERE id=NEW.account_id AND facility_id=NEW.facility_id AND type='revenue' AND is_posting AND is_active) THEN
 RAISE EXCEPTION 'Revenue mapping requires an active posting revenue account in this facility'; END IF;
 IF NEW.category LIKE 'service:%' AND NOT EXISTS(SELECT 1 FROM service WHERE id=substring(NEW.category from 9) AND facility_id=NEW.facility_id) THEN RAISE EXCEPTION 'Service belongs to a different facility'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_mapping_guard BEFORE INSERT OR UPDATE ON finance_revenue_mapping FOR EACH ROW EXECUTE FUNCTION finance_mapping_guard();
CREATE FUNCTION finance_install_revenue(fid text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record; aid text;
BEGIN
 FOR r IN SELECT * FROM (VALUES ('4890','Patient discounts','discount'),('4895','Patient refunds and credits','refund')) t(code,name,key) LOOP
  SELECT id INTO aid FROM finance_account WHERE facility_id=fid AND system_key=r.key;
  IF aid IS NULL THEN
   INSERT INTO finance_account(id,facility_id,code,name,type,normal_balance,is_control,system_key,parent_id)
   VALUES(gen_random_uuid()::text,fid,r.code,r.name,'revenue','debit',true,r.key,(SELECT id FROM finance_account WHERE facility_id=fid AND system_key='_group_revenue')) RETURNING id INTO aid;
  END IF;
  INSERT INTO finance_revenue_mapping(id,facility_id,category,account_id) VALUES(gen_random_uuid()::text,fid,r.key,aid) ON CONFLICT(facility_id,category) DO NOTHING;
 END LOOP;
 FOR r IN SELECT * FROM (VALUES ('consultation','4010'),('laboratory','4020'),('pharmacy','4030'),('procedure','4040'),('registration','4000'),('other','4000')) t(category,code) LOOP
  SELECT id INTO aid FROM finance_account WHERE facility_id=fid AND code=r.code AND type='revenue' AND is_active AND is_posting;
  IF aid IS NULL THEN SELECT id INTO aid FROM finance_account WHERE facility_id=fid AND system_key='revenue'; END IF;
  INSERT INTO finance_revenue_mapping(id,facility_id,category,account_id) VALUES(gen_random_uuid()::text,fid,r.category,aid) ON CONFLICT(facility_id,category) DO NOTHING;
 END LOOP;
END $$;
SELECT finance_install_revenue(facility_id) FROM finance_settings;

CREATE TABLE finance_till_close (
 id text PRIMARY KEY, facility_id text NOT NULL REFERENCES facility(id) ON DELETE RESTRICT,
 user_id text NOT NULL, origin text NOT NULL CHECK(origin IN ('reception','lab','pharmacy','other')),label text NOT NULL,
 starts_at timestamptz(3) NOT NULL, ends_at timestamptz(3) NOT NULL,
 opening numeric(18,2) NOT NULL,expected numeric(18,2) NOT NULL,counted numeric(18,2) NOT NULL,difference numeric(18,2) NOT NULL,
 payment_ids jsonb NOT NULL,note text NOT NULL,created_by text NOT NULL,created_at timestamptz(3) NOT NULL DEFAULT now(),
 approved_by text,approved_at timestamptz(3),
 FOREIGN KEY(user_id,facility_id) REFERENCES app_user(id,facility_id) ON DELETE RESTRICT,
 FOREIGN KEY(created_by,facility_id) REFERENCES app_user(id,facility_id) ON DELETE RESTRICT,
 FOREIGN KEY(approved_by,facility_id) REFERENCES app_user(id,facility_id) ON DELETE RESTRICT,
 CHECK(starts_at<ends_at), CHECK(opening>=0 AND counted>=0 AND difference=counted-expected),
 CHECK(opening::text NOT IN ('NaN','Infinity','-Infinity') AND expected::text NOT IN ('NaN','Infinity','-Infinity') AND counted::text NOT IN ('NaN','Infinity','-Infinity') AND difference::text NOT IN ('NaN','Infinity','-Infinity')),
 CHECK((approved_at IS NULL AND approved_by IS NULL) OR (approved_at IS NOT NULL AND approved_by IS NOT NULL AND approved_by<>created_by))
);
CREATE UNIQUE INDEX finance_till_close_id_facility_id_key ON finance_till_close(id,facility_id);
CREATE INDEX finance_till_close_facility_id_user_id_starts_at_idx ON finance_till_close(facility_id,user_id,starts_at);
CREATE FUNCTION finance_till_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Till counts are immutable'; END IF;
 PERFORM id FROM app_user WHERE id=NEW.user_id AND facility_id=NEW.facility_id FOR UPDATE;
 IF TG_OP='UPDATE' AND (OLD.approved_at IS NOT NULL OR (to_jsonb(OLD)-'approved_at'-'approved_by') IS DISTINCT FROM (to_jsonb(NEW)-'approved_at'-'approved_by')) THEN RAISE EXCEPTION 'Till counts are immutable'; END IF;
 IF NEW.ends_at>clock_timestamp() THEN RAISE EXCEPTION 'A future shift cannot be closed'; END IF;
 IF EXISTS(SELECT 1 FROM finance_till_close WHERE facility_id=NEW.facility_id AND user_id=NEW.user_id AND origin=NEW.origin AND id<>NEW.id AND starts_at<NEW.ends_at AND ends_at>NEW.starts_at) THEN RAISE EXCEPTION 'Till close overlaps an existing shift'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_till_guard BEFORE INSERT OR UPDATE OR DELETE ON finance_till_close FOR EACH ROW EXECUTE FUNCTION finance_till_guard();
CREATE FUNCTION finance_payment_closed_shift() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fid text; origin text;
BEGIN
 SELECT facility_id INTO fid FROM invoice WHERE id=NEW.invoice_id;
 PERFORM id FROM app_user WHERE id=NEW.received_by AND facility_id=fid FOR UPDATE;
 SELECT CASE WHEN bool_or(ref_type='prescription_item') THEN 'pharmacy' WHEN bool_or(ref_type='lab_order_item') THEN 'lab' WHEN bool_or(ref_type IN ('service','card_registration')) THEN 'reception' ELSE 'other' END INTO origin FROM invoice_item WHERE invoice_id=NEW.invoice_id;
 IF EXISTS(SELECT 1 FROM finance_till_close c WHERE c.facility_id=fid AND c.user_id=NEW.received_by AND c.origin=origin AND c.starts_at<=NEW.received_at AND c.ends_at>NEW.received_at) THEN RAISE EXCEPTION 'Cannot add a payment to a closed till shift'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_payment_shift_guard BEFORE INSERT ON payment FOR EACH ROW EXECUTE FUNCTION finance_payment_closed_shift();

CREATE TABLE finance_deposit (
 id text PRIMARY KEY,facility_id text NOT NULL REFERENCES facility(id) ON DELETE RESTRICT,
 journal_id text NOT NULL,till_close_id text,reference text NOT NULL,amount numeric(18,2) NOT NULL CHECK(amount>0 AND amount::text NOT IN ('NaN','Infinity','-Infinity')),
 FOREIGN KEY(journal_id,facility_id) REFERENCES finance_journal(id,facility_id) ON DELETE RESTRICT,
 FOREIGN KEY(till_close_id,facility_id) REFERENCES finance_till_close(id,facility_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX finance_deposit_journal_id_key ON finance_deposit(journal_id);
CREATE UNIQUE INDEX finance_deposit_journal_id_facility_id_key ON finance_deposit(journal_id,facility_id);
CREATE UNIQUE INDEX finance_deposit_facility_id_reference_key ON finance_deposit(facility_id,reference);
CREATE TRIGGER finance_deposit_immutable BEFORE UPDATE OR DELETE ON finance_deposit FOR EACH ROW EXECUTE FUNCTION finance_immutable_source();
CREATE TRIGGER finance_mapping_audit AFTER INSERT OR UPDATE OR DELETE ON finance_revenue_mapping FOR EACH ROW EXECUTE FUNCTION finance_capture_audit();
CREATE TRIGGER finance_till_audit AFTER INSERT OR UPDATE OR DELETE ON finance_till_close FOR EACH ROW EXECUTE FUNCTION finance_capture_audit();
CREATE TRIGGER finance_deposit_audit AFTER INSERT OR UPDATE OR DELETE ON finance_deposit FOR EACH ROW EXECUTE FUNCTION finance_capture_audit();

CREATE FUNCTION finance_journal_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payment p JOIN invoice i ON i.id=p.invoice_id WHERE p.id=NEW.payment_id AND i.id=NEW.invoice_id AND i.facility_id=NEW.facility_id) THEN RAISE EXCEPTION 'Payment and journal must refer to the same facility and invoice'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_journal_source_guard BEFORE INSERT OR UPDATE ON finance_journal FOR EACH ROW EXECUTE FUNCTION finance_journal_source_guard();
COMMIT;
