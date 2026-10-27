BEGIN;

ALTER TABLE finance_account ADD COLUMN parent_id text,
  ADD COLUMN normal_balance text,
  ADD COLUMN is_posting boolean NOT NULL DEFAULT true;
UPDATE finance_account SET normal_balance=CASE WHEN type IN ('asset','expense') THEN 'debit' ELSE 'credit' END;
ALTER TABLE finance_account ALTER COLUMN normal_balance SET NOT NULL;
ALTER TABLE finance_account ADD CONSTRAINT account_normal_balance CHECK (normal_balance IN ('debit','credit')),
  ADD CONSTRAINT account_parent_facility FOREIGN KEY(parent_id,facility_id) REFERENCES finance_account(id,facility_id) ON DELETE RESTRICT,
  ADD CONSTRAINT account_group_flags CHECK (is_posting OR (NOT is_cash AND NOT is_control));

CREATE FUNCTION finance_account_hierarchy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p finance_account;
BEGIN
  PERFORM id FROM facility WHERE id=NEW.facility_id FOR UPDATE;
  IF NEW.normal_balance IS NULL THEN
    NEW.normal_balance:=CASE WHEN NEW.type IN ('asset','expense') THEN 'debit' ELSE 'credit' END;
  END IF;
  IF TG_OP='UPDATE' AND (OLD.normal_balance,OLD.is_posting) IS DISTINCT FROM (NEW.normal_balance,NEW.is_posting)
    AND (OLD.system_key IS NOT NULL OR EXISTS (SELECT 1 FROM finance_journal_line WHERE account_id=OLD.id)) THEN
    RAISE EXCEPTION 'Used or system account classification cannot change';
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO p FROM finance_account WHERE id=NEW.parent_id AND facility_id=NEW.facility_id;
    IF p.id IS NULL OR p.is_posting OR p.type<>NEW.type OR NOT p.is_active THEN
      RAISE EXCEPTION 'Parent must be an active group of the same type and facility';
    END IF;
    IF EXISTS (WITH RECURSIVE ancestors AS (
      SELECT id,parent_id FROM finance_account WHERE id=NEW.parent_id
      UNION SELECT a.id,a.parent_id FROM finance_account a JOIN ancestors ancestor ON a.id=ancestor.parent_id
    ) SELECT 1 FROM ancestors WHERE id=NEW.id) OR NEW.parent_id=NEW.id THEN
      RAISE EXCEPTION 'Account hierarchy cannot contain a cycle';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM finance_account WHERE parent_id=NEW.id AND (NEW.is_posting OR type<>NEW.type OR NOT NEW.is_active)) THEN
    RAISE EXCEPTION 'A parent must remain an active group of the same type as its children';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finance_account_hierarchy_guard BEFORE INSERT OR UPDATE ON finance_account FOR EACH ROW EXECUTE FUNCTION finance_account_hierarchy();

ALTER TABLE finance_journal_line ADD COLUMN currency text NOT NULL DEFAULT 'AFN',
 ADD COLUMN exchange_rate numeric(20,10) NOT NULL DEFAULT 1,
 ADD COLUMN base_debit numeric(18,2) GENERATED ALWAYS AS (round(debit*exchange_rate,2)) STORED,
 ADD COLUMN base_credit numeric(18,2) GENERATED ALWAYS AS (round(credit*exchange_rate,2)) STORED,
 ADD CONSTRAINT finance_line_currency CHECK(currency='AFN' AND exchange_rate=1);
ALTER TABLE finance_journal_line ALTER COLUMN base_debit SET NOT NULL, ALTER COLUMN base_credit SET NOT NULL;

CREATE TABLE finance_audit (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 facility_id text NOT NULL REFERENCES facility(id) ON DELETE RESTRICT,
 journal_id text, actor_id text, occurred_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
 action text NOT NULL, entity text NOT NULL, entity_id text NOT NULL,
 before jsonb, after jsonb
);
CREATE INDEX finance_audit_facility_id_journal_id_occurred_at_idx ON finance_audit(facility_id,journal_id,occurred_at);
CREATE FUNCTION finance_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE LOG 'Blocked mutation of append-only finance audit: %, user %',TG_OP,current_user;
 RAISE EXCEPTION 'Finance audit history is append-only';
END $$;
CREATE TRIGGER finance_audit_immutable BEFORE UPDATE OR DELETE ON finance_audit FOR EACH ROW EXECUTE FUNCTION finance_audit_immutable();
CREATE TRIGGER finance_audit_no_truncate BEFORE TRUNCATE ON finance_audit FOR EACH STATEMENT EXECUTE FUNCTION finance_audit_immutable();
CREATE FUNCTION finance_legacy_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.entity LIKE 'Finance%' OR OLD.entity LIKE 'Fiscal%' THEN
   RAISE EXCEPTION 'Finance audit history is append-only';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_legacy_audit_immutable BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION finance_legacy_audit_guard();
CREATE TRIGGER finance_legacy_audit_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION finance_audit_immutable();

-- Database triggers also cover changes made outside Prisma. Unknown direct-SQL actors
-- remain NULL; database session_user is retained in the snapshot metadata.
CREATE FUNCTION finance_capture_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b jsonb; a jsonb; r jsonb; jid text;
BEGIN
 IF TG_OP<>'INSERT' THEN b:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN a:=to_jsonb(NEW); END IF;
 r:=COALESCE(a,b);
 jid:=CASE WHEN TG_TABLE_NAME='finance_journal' THEN r->>'id' ELSE r->>'journal_id' END;
 IF TG_TABLE_NAME='finance_journal' THEN
   IF b IS NOT NULL THEN b:=b || jsonb_build_object('lines',(SELECT COALESCE(jsonb_agg(to_jsonb(l)),'[]') FROM finance_journal_line l WHERE l.journal_id=jid)); END IF;
   IF a IS NOT NULL THEN a:=a || jsonb_build_object('lines',(SELECT COALESCE(jsonb_agg(to_jsonb(l)),'[]') FROM finance_journal_line l WHERE l.journal_id=jid)); END IF;
 END IF;
 INSERT INTO finance_audit(facility_id,journal_id,actor_id,action,entity,entity_id,before,after)
 VALUES(r->>'facility_id',jid,NULLIF(current_setting('redmars.finance_actor',true),''),lower(TG_OP),TG_TABLE_NAME,COALESCE(r->>'id',r->>'facility_id'),b,
   CASE WHEN a IS NULL THEN NULL ELSE a || jsonb_build_object('_database_user',session_user) END);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['finance_journal','finance_journal_line','finance_account','finance_bill','finance_settlement','finance_supplier','finance_statement','finance_statement_line','finance_settings','finance_period','fiscal_year'] LOOP
   EXECUTE format('CREATE TRIGGER finance_capture AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION finance_capture_audit()',tbl);
 END LOOP;
END $$;

-- Install a hospital starter hierarchy without replacing custom or used accounts.
CREATE FUNCTION finance_install_chart(fid text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE kind text; gid text; item record;
BEGIN
 PERFORM id FROM facility WHERE id=fid FOR UPDATE;
 FOREACH kind IN ARRAY ARRAY['asset','liability','equity','revenue','expense'] LOOP
   SELECT id INTO gid FROM finance_account WHERE facility_id=fid AND system_key='_group_'||kind;
   IF gid IS NULL THEN
     INSERT INTO finance_account(id,facility_id,code,name,type,system_key,is_posting)
     VALUES(gen_random_uuid()::text,fid,'GROUP-'||upper(kind),initcap(kind),kind::"FinanceAccountType",'_group_'||kind,false) RETURNING id INTO gid;
   END IF;
   UPDATE finance_account SET parent_id=gid WHERE facility_id=fid AND type=kind::"FinanceAccountType" AND is_posting AND parent_id IS NULL;
 END LOOP;
 FOR item IN SELECT * FROM (VALUES
   ('1200','Medical and pharmacy inventory','asset'),('1300','Prepaid expenses','asset'),
   ('1500','Medical equipment','asset'),('1510','Furniture and office equipment','asset'),
   ('2100','Accrued expenses','liability'),('2200','Salaries payable','liability'),
   ('3200','Owner capital','equity'),('4010','Consultation revenue','revenue'),
   ('4020','Laboratory revenue','revenue'),('4030','Pharmacy revenue','revenue'),
   ('4040','Procedure revenue','revenue'),('5200','Salaries and wages','expense'),
   ('5300','Rent','expense'),('5400','Utilities and fuel','expense'),
   ('5500','Medical supplies expense','expense'),('5600','Repairs and maintenance','expense'),
   ('5700','Administrative expenses','expense')) v(code,name,kind)
 LOOP
   INSERT INTO finance_account(id,facility_id,code,name,type,parent_id)
   SELECT gen_random_uuid()::text,fid,item.code,item.name,item.kind::"FinanceAccountType",id
   FROM finance_account WHERE facility_id=fid AND system_key='_group_'||item.kind
   ON CONFLICT(facility_id,code) DO NOTHING;
 END LOOP;
END $$;
SELECT finance_install_chart(facility_id) FROM finance_settings;

CREATE FUNCTION finance_posting_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original finance_journal; bill finance_bill;
BEGIN
 IF NEW.status<>'posted' THEN RETURN NEW; END IF;
 IF NEW.created_by=NEW.posted_by THEN RAISE EXCEPTION 'A different accountant must review and post this entry'; END IF;
 IF EXISTS(SELECT 1 FROM finance_journal_line l JOIN finance_account a ON a.id=l.account_id WHERE l.journal_id=NEW.id AND NOT a.is_posting) THEN
   RAISE EXCEPTION 'Group accounts cannot receive journal entries';
 END IF;
 IF NEW.reversal_of_id IS NOT NULL THEN
   SELECT * INTO original FROM finance_journal WHERE id=NEW.reversal_of_id AND facility_id=NEW.facility_id FOR UPDATE;
   IF original.status<>'posted' OR original.reversal_of_id IS NOT NULL OR original.source_type='hospital' OR NEW.date<original.date THEN
     RAISE EXCEPTION 'Invalid reversal source or date';
   END IF;
   IF EXISTS(SELECT account_id,currency,exchange_rate,debit,credit FROM finance_journal_line WHERE journal_id=NEW.id
       EXCEPT ALL SELECT account_id,currency,exchange_rate,credit,debit FROM finance_journal_line WHERE journal_id=original.id)
     OR EXISTS(SELECT account_id,currency,exchange_rate,credit,debit FROM finance_journal_line WHERE journal_id=original.id
       EXCEPT ALL SELECT account_id,currency,exchange_rate,debit,credit FROM finance_journal_line WHERE journal_id=NEW.id) THEN
     RAISE EXCEPTION 'Reversal must exactly mirror the original lines';
   END IF;
   IF EXISTS(SELECT 1 FROM finance_bill b JOIN finance_settlement s ON s.bill_id=b.id
      JOIN finance_journal j ON j.id=s.journal_id LEFT JOIN finance_journal r ON r.reversal_of_id=j.id AND r.status='posted'
      WHERE b.journal_id=original.id AND r.id IS NULL) THEN RAISE EXCEPTION 'Reverse all supplier payments before reversing their bill'; END IF;
 END IF;
 IF NEW.source_type='supplier_payment' THEN
   SELECT b.* INTO bill FROM finance_bill b JOIN finance_settlement s ON s.bill_id=b.id WHERE s.journal_id=NEW.id FOR UPDATE OF b;
   IF bill.id IS NULL OR NOT EXISTS(SELECT 1 FROM finance_journal WHERE id=bill.journal_id AND status='posted')
     OR EXISTS(SELECT 1 FROM finance_journal WHERE reversal_of_id=bill.journal_id) THEN RAISE EXCEPTION 'Payment requires a posted bill without a pending reversal'; END IF;
   IF (SELECT COALESCE(sum(s.amount),0) FROM finance_settlement s JOIN finance_journal j ON j.id=s.journal_id
       LEFT JOIN finance_journal r ON r.reversal_of_id=j.id AND r.status='posted' WHERE s.bill_id=bill.id AND r.id IS NULL)>bill.amount THEN
     RAISE EXCEPTION 'Payments including reserved drafts exceed the bill';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_review_guard BEFORE INSERT OR UPDATE ON finance_journal FOR EACH ROW EXECUTE FUNCTION finance_posting_review_guard();

COMMIT;
