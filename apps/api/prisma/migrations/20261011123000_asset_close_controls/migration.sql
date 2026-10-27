BEGIN;
-- Missing depreciation must be resolved before closing a month, including after downtime.
CREATE FUNCTION finance_asset_close_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a record; idx integer; expected numeric;
BEGIN
 IF NEW.closed_at IS NULL OR OLD.closed_at IS NOT NULL THEN RETURN NEW; END IF;
 PERFORM id FROM facility WHERE id=NEW.facility_id FOR UPDATE;
 FOR a IN SELECT a.*,p.label first_label FROM finance_asset a JOIN finance_period p ON p.id=a.start_period_id
 WHERE a.facility_id=NEW.facility_id AND p.starts_on<=NEW.starts_on
 AND EXISTS(SELECT 1 FROM finance_asset_entry e JOIN finance_journal j ON j.id=e.journal_id LEFT JOIN finance_journal r ON r.reversal_of_id=j.id AND r.status='posted' WHERE e.asset_id=a.id AND e.kind='acquisition' AND r.id IS NULL)
 AND NOT EXISTS(SELECT 1 FROM finance_asset_entry e JOIN finance_journal j ON j.id=e.journal_id LEFT JOIN finance_journal r ON r.reversal_of_id=j.id AND r.status='posted' WHERE e.asset_id=a.id AND e.kind='disposal' AND j.date<NEW.ends_on AND r.id IS NULL)
 LOOP
  idx:=(substring(NEW.label,1,4)::int-substring(a.first_label,1,4)::int)*12+substring(NEW.label,6,2)::int-substring(a.first_label,6,2)::int;
  IF idx>=a.life_months THEN CONTINUE; END IF;
  expected:=GREATEST(0,LEAST(round((a.cost-a.residual)/a.life_months,2),a.cost-a.residual-round((a.cost-a.residual)/a.life_months,2)*idx));
  IF idx=a.life_months-1 THEN expected:=GREATEST(0,a.cost-a.residual-round((a.cost-a.residual)/a.life_months,2)*idx); END IF;
  IF expected>0 AND NOT EXISTS(SELECT 1 FROM finance_asset_entry e JOIN finance_journal j ON j.id=e.journal_id LEFT JOIN finance_journal r ON r.reversal_of_id=j.id AND r.status='posted' WHERE e.asset_id=a.id AND e.kind='depreciation' AND e.period_id=NEW.id AND j.status='posted' AND r.id IS NULL) THEN RAISE EXCEPTION 'Generate and post depreciation for asset % before closing %',a.code,NEW.label; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER asset_close_guard BEFORE UPDATE ON finance_period FOR EACH ROW EXECUTE FUNCTION finance_asset_close_guard();
COMMIT;
