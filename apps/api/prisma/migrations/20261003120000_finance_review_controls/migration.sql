BEGIN;
CREATE OR REPLACE FUNCTION finance_payment_closed_shift() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fid text; till_origin text;
BEGIN
 SELECT facility_id INTO fid FROM invoice WHERE id=NEW.invoice_id;
 PERFORM id FROM app_user WHERE id=NEW.received_by AND facility_id=fid FOR UPDATE;
 SELECT CASE WHEN bool_or(ref_type='prescription_item') THEN 'pharmacy' WHEN bool_or(ref_type='lab_order_item') THEN 'lab' WHEN bool_or(ref_type IN ('service','card_registration')) THEN 'reception' ELSE 'other' END INTO till_origin FROM invoice_item WHERE invoice_id=NEW.invoice_id;
 IF EXISTS(SELECT 1 FROM finance_till_close c WHERE c.facility_id=fid AND c.user_id=NEW.received_by AND c.origin=till_origin AND c.starts_at<=NEW.received_at AND c.ends_at>NEW.received_at) THEN RAISE EXCEPTION 'Cannot add a payment to a closed till shift'; END IF;
 RETURN NEW;
END $$;
INSERT INTO role_permission(role_id,permission_id,condition)
SELECT r.id,p.id,NULL FROM role r,permission p WHERE r.code='accountant' AND p.code='finance.post'
ON CONFLICT(role_id,permission_id) DO UPDATE SET condition=NULL;

CREATE FUNCTION finance_log_rejected_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE jid text; is_posted boolean;
BEGIN
 jid:=CASE WHEN TG_TABLE_NAME='finance_journal' THEN OLD.id ELSE OLD.journal_id END;
 SELECT status='posted' INTO is_posted FROM finance_journal WHERE id=jid;
 IF is_posted THEN RAISE LOG 'Blocked posted finance mutation: journal %, action %, database actor %, application actor %',jid,TG_OP,session_user,current_setting('redmars.finance_actor',true); END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aaa_finance_rejection_log BEFORE UPDATE OR DELETE ON finance_journal FOR EACH ROW EXECUTE FUNCTION finance_log_rejected_mutation();
CREATE TRIGGER aaa_finance_rejection_log BEFORE UPDATE OR DELETE ON finance_journal_line FOR EACH ROW EXECUTE FUNCTION finance_log_rejected_mutation();

CREATE FUNCTION finance_review_source_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE debt numeric; reserved numeric; deposit finance_deposit; counted numeric;
BEGIN
 IF NEW.status<>'posted' THEN RETURN NEW; END IF;
 IF NEW.reversal_of_id IS NOT NULL AND EXISTS(SELECT 1 FROM finance_journal_line l JOIN finance_statement_line sl ON sl.journal_line_id=l.id JOIN finance_statement s ON s.id=sl.statement_id WHERE l.journal_id=NEW.reversal_of_id AND s.reconciled_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Original journal belongs to a finalized bank statement';
 END IF;
 IF NEW.source_type='panel_receipt' THEN
   PERFORM id FROM invoice WHERE id=NEW.invoice_id AND facility_id=NEW.facility_id FOR UPDATE;
   SELECT COALESCE(sum(l.base_debit-l.base_credit),0) INTO debt FROM finance_journal_line l JOIN finance_journal j ON j.id=l.journal_id JOIN finance_account a ON a.id=l.account_id
     WHERE j.facility_id=NEW.facility_id AND j.invoice_id=NEW.invoice_id AND j.panel_id=NEW.panel_id AND j.status='posted' AND j.date<=NEW.date AND a.system_key='panel';
   SELECT COALESCE(sum(l.base_credit),0) INTO reserved FROM finance_journal_line l JOIN finance_journal j ON j.id=l.journal_id JOIN finance_account a ON a.id=l.account_id
     WHERE j.facility_id=NEW.facility_id AND j.invoice_id=NEW.invoice_id AND j.panel_id=NEW.panel_id AND j.status='draft' AND a.system_key='panel';
   IF NEW.invoice_id IS NULL OR NEW.panel_id IS NULL OR debt<reserved THEN RAISE EXCEPTION 'Panel receipts exceed the available posted debt'; END IF;
 END IF;
 IF NEW.source_type='bank_deposit' THEN
   SELECT * INTO deposit FROM finance_deposit WHERE journal_id=NEW.id;
   IF deposit.id IS NULL THEN RAISE EXCEPTION 'Deposit source is missing'; END IF;
   IF deposit.till_close_id IS NOT NULL THEN
     SELECT c.counted INTO counted FROM finance_till_close c WHERE c.id=deposit.till_close_id AND c.facility_id=NEW.facility_id AND c.approved_at IS NOT NULL FOR UPDATE;
     SELECT COALESCE(sum(d.amount),0) INTO reserved FROM finance_deposit d JOIN finance_journal j ON j.id=d.journal_id LEFT JOIN finance_journal r ON r.reversal_of_id=j.id AND r.status='posted' WHERE d.till_close_id=deposit.till_close_id AND r.id IS NULL;
     IF counted IS NULL OR reserved>counted THEN RAISE EXCEPTION 'Deposits exceed approved counted cash'; END IF;
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_review_source_balance BEFORE INSERT OR UPDATE ON finance_journal FOR EACH ROW EXECUTE FUNCTION finance_review_source_balance();
COMMIT;
