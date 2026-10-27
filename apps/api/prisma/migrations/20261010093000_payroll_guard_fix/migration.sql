CREATE OR REPLACE FUNCTION payroll_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb; run payroll_run; jid text;
BEGIN
 r:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 PERFORM id FROM facility WHERE id=r->>'facility_id' FOR UPDATE;
 IF TG_OP='UPDATE' AND ((to_jsonb(OLD)->>'facility_id') IS DISTINCT FROM r->>'facility_id' OR (to_jsonb(OLD)->>'id') IS DISTINCT FROM r->>'id') THEN RAISE EXCEPTION 'Payroll ownership is immutable'; END IF;
 IF TG_TABLE_NAME='payroll_run' THEN
  IF TG_OP<>'INSERT' AND OLD.status='approved' THEN RAISE EXCEPTION 'Approved payroll is immutable'; END IF;
  IF TG_OP<>'DELETE' THEN
   IF NOT EXISTS(SELECT 1 FROM finance_period p WHERE p.id=NEW.period_id AND p.facility_id=NEW.facility_id AND p.closed_at IS NULL AND NEW.date>=p.starts_on AND NEW.date<p.ends_on) THEN RAISE EXCEPTION 'Payroll requires an open matching period'; END IF;
   IF NEW.status='approved' AND (TG_OP='INSERT' OR OLD.status<>'reviewed') THEN RAISE EXCEPTION 'Review payroll before approval'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME IN ('payroll_item','payroll_repayment') THEN
  IF TG_TABLE_NAME='payroll_item' THEN SELECT * INTO run FROM payroll_run WHERE id=r->>'run_id';
  ELSE SELECT pr.* INTO run FROM payroll_run pr JOIN payroll_item i ON i.run_id=pr.id WHERE i.id=r->>'item_id'; END IF;
  IF run.status='approved' THEN RAISE EXCEPTION 'Approved payroll details are immutable'; END IF;
  IF TG_OP='UPDATE' AND ((to_jsonb(OLD)->>'run_id') IS DISTINCT FROM r->>'run_id' OR (to_jsonb(OLD)->>'item_id') IS DISTINCT FROM r->>'item_id' OR (to_jsonb(OLD)->>'loan_id') IS DISTINCT FROM r->>'loan_id') THEN RAISE EXCEPTION 'Payroll source links are immutable'; END IF;
  IF TG_TABLE_NAME='payroll_repayment' AND NOT EXISTS(SELECT 1 FROM payroll_item i JOIN payroll_loan l ON l.employee_id=i.employee_id AND l.facility_id=i.facility_id WHERE i.id=r->>'item_id' AND l.id=r->>'loan_id') AND TG_OP<>'DELETE' THEN RAISE EXCEPTION 'Loan deduction must belong to employee'; END IF;
 ELSIF TG_TABLE_NAME IN ('payroll_loan','payroll_payment') THEN
  IF TG_OP='DELETE' AND current_setting('redmars.finance_discard',true)=r->>'journal_id'
    AND EXISTS(SELECT 1 FROM finance_journal WHERE id=r->>'journal_id' AND status='draft') THEN RETURN OLD; END IF;
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Payroll transactions are immutable; reverse their journal'; END IF;
  jid:=r->>'journal_id';
  IF NOT EXISTS(SELECT 1 FROM finance_journal WHERE id=jid AND facility_id=r->>'facility_id' AND status='draft' AND source_type=TG_TABLE_NAME AND source_id=r->>'id') THEN RAISE EXCEPTION 'Payroll source needs its matching draft journal'; END IF;
  IF TG_TABLE_NAME='payroll_payment' THEN
   SELECT pr.* INTO run FROM payroll_run pr JOIN payroll_item i ON i.run_id=pr.id WHERE i.id=NEW.item_id;
   IF run.status<>'approved' OR NOT EXISTS(SELECT 1 FROM finance_journal j WHERE j.id=run.journal_id AND j.status='posted' AND NOT EXISTS(SELECT 1 FROM finance_journal rev WHERE rev.reversal_of_id=j.id)) THEN RAISE EXCEPTION 'Salary payment requires posted approved payroll'; END IF;
   IF NEW.amount+(SELECT COALESCE(sum(p.amount),0) FROM payroll_payment p JOIN finance_journal j ON j.id=p.journal_id LEFT JOIN finance_journal rev ON rev.reversal_of_id=j.id AND rev.status='posted' WHERE p.item_id=NEW.item_id AND rev.id IS NULL)>(SELECT net FROM payroll_item WHERE id=NEW.item_id) THEN RAISE EXCEPTION 'Salary overpayment including reserved drafts'; END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
