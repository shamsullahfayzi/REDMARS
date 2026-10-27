-- Serialize line mutation with posting, including callers using direct SQL.
CREATE OR REPLACE FUNCTION finance_guard_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE state "FinanceJournalStatus";
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT status INTO state FROM finance_journal WHERE id=OLD.journal_id FOR UPDATE;
    IF state='posted' THEN RAISE EXCEPTION 'Posted journal lines are immutable'; END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT status INTO state FROM finance_journal WHERE id=NEW.journal_id FOR UPDATE;
    IF state='posted' THEN RAISE EXCEPTION 'Posted journal lines are immutable'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION finance_immutable_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Finalized finance source records are immutable; correct their journal with a reversal'; END $$;
CREATE TRIGGER finance_bill_immutable BEFORE UPDATE OR DELETE ON finance_bill FOR EACH ROW EXECUTE FUNCTION finance_immutable_source();
CREATE TRIGGER finance_settlement_immutable BEFORE UPDATE OR DELETE ON finance_settlement FOR EACH ROW EXECUTE FUNCTION finance_immutable_source();
CREATE TRIGGER finance_settings_immutable BEFORE UPDATE OR DELETE ON finance_settings FOR EACH ROW EXECUTE FUNCTION finance_immutable_source();

CREATE FUNCTION finance_guard_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.facility_id,OLD.code,OLD.type,OLD.system_key,OLD.is_control,OLD.is_cash) IS DISTINCT FROM
     (NEW.facility_id,NEW.code,NEW.type,NEW.system_key,NEW.is_control,NEW.is_cash)
     AND (OLD.system_key IS NOT NULL OR EXISTS (SELECT 1 FROM finance_journal_line WHERE account_id=OLD.id)) THEN
    RAISE EXCEPTION 'Used or system account classification cannot change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finance_account_guard BEFORE UPDATE ON finance_account FOR EACH ROW EXECUTE FUNCTION finance_guard_account();

CREATE OR REPLACE FUNCTION finance_guard_statement_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s finance_statement; l finance_journal_line; j finance_journal;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT * INTO s FROM finance_statement WHERE id=OLD.statement_id FOR UPDATE;
    IF s.reconciled_at IS NOT NULL THEN RAISE EXCEPTION 'Finalized reconciliation lines are immutable'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  SELECT * INTO s FROM finance_statement WHERE id=NEW.statement_id FOR UPDATE;
  IF s.reconciled_at IS NOT NULL THEN RAISE EXCEPTION 'Finalized reconciliation lines are immutable'; END IF;
  IF NEW.date<s.starts_on OR NEW.date>s.ends_on THEN RAISE EXCEPTION 'Statement movement is outside its date range'; END IF;
  IF NEW.journal_line_id IS NOT NULL THEN
    SELECT * INTO l FROM finance_journal_line WHERE id=NEW.journal_line_id;
    SELECT * INTO j FROM finance_journal WHERE id=l.journal_id;
    IF l.account_id<>s.account_id OR l.facility_id<>s.facility_id OR l.debit-l.credit<>NEW.amount OR j.status<>'posted' OR j.date>s.ends_on THEN
      RAISE EXCEPTION 'Statement match must use the same account and amount on a posted entry';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION finance_guard_statement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE movement numeric; matched numeric;
BEGIN
  IF OLD.reconciled_at IS NOT NULL THEN RAISE EXCEPTION 'Finalized reconciliations are immutable'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NEW.reconciled_at IS NOT NULL THEN
    PERFORM id FROM finance_account WHERE id=NEW.account_id FOR UPDATE;
    IF NEW.reconciled_by IS NULL OR EXISTS (SELECT 1 FROM finance_statement_line WHERE statement_id=NEW.id AND journal_line_id IS NULL) THEN
      RAISE EXCEPTION 'Finalizing a statement requires all movements matched and an actor';
    END IF;
    SELECT COALESCE(SUM(amount),0) INTO movement FROM finance_statement_line WHERE statement_id=NEW.id;
    IF NEW.opening_balance+movement<>NEW.closing_balance THEN RAISE EXCEPTION 'Statement balances do not agree'; END IF;
    SELECT COALESCE(SUM(l.debit-l.credit),0) INTO matched FROM finance_journal_line l
      JOIN finance_journal j ON j.id=l.journal_id
      JOIN finance_statement_line sl ON sl.journal_line_id=l.id
      JOIN finance_statement s ON s.id=sl.statement_id
      WHERE l.account_id=NEW.account_id AND j.status='posted' AND j.date<=NEW.ends_on
        AND (s.id=NEW.id OR s.reconciled_at IS NOT NULL);
    IF matched<>NEW.closing_balance THEN RAISE EXCEPTION 'Statement balance does not reconcile to the ledger'; END IF;
  END IF;
  RETURN NEW;
END $$;
