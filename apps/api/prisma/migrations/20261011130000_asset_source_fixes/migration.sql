BEGIN;
CREATE OR REPLACE FUNCTION finance_asset_expected_lines(eid text) RETURNS TABLE(account_id text,debit numeric,credit numeric,cost_centre_id text) LANGUAGE sql STABLE AS $$
 WITH data AS (SELECT e.*,a.cost,a.cost_centre_id,a.bill_line_id FROM finance_asset_entry e JOIN finance_asset a ON a.id=e.asset_id WHERE e.id=eid),
 expected AS (
 SELECT 'asset_cost' key,CASE WHEN kind='acquisition' THEN cost ELSE 0 END debit,CASE WHEN kind='disposal' THEN cost ELSE 0 END credit FROM data WHERE kind IN ('acquisition','disposal')
 UNION ALL SELECT 'asset_accum',CASE WHEN kind='disposal' THEN amount ELSE 0 END,CASE WHEN kind='depreciation' THEN amount ELSE 0 END FROM data WHERE kind IN ('depreciation','disposal')
 UNION ALL SELECT 'asset_expense',amount,0 FROM data WHERE kind='depreciation'
 UNION ALL SELECT 'asset_gain',0,proceeds-cost+amount FROM data WHERE kind='disposal' AND proceeds>cost-amount
 UNION ALL SELECT 'asset_loss',cost-amount-proceeds,0 FROM data WHERE kind='disposal' AND proceeds<cost-amount
 )
 SELECT ac.id,x.debit,x.credit,d.cost_centre_id FROM expected x CROSS JOIN data d JOIN finance_account ac ON ac.facility_id=d.facility_id AND ac.system_key=x.key WHERE x.debit>0 OR x.credit>0
 UNION ALL SELECT offset_account_id,CASE WHEN kind='disposal' THEN proceeds ELSE 0 END,CASE WHEN kind='acquisition' THEN cost ELSE 0 END,CASE WHEN kind='acquisition' AND bill_line_id IS NOT NULL THEN (SELECT l.cost_centre_id FROM finance_journal_line l WHERE l.id=data.bill_line_id) ELSE cost_centre_id END FROM data WHERE kind='acquisition' OR (kind='disposal' AND proceeds>0)
$$;
CREATE OR REPLACE FUNCTION finance_asset_post_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e finance_asset_entry; a finance_asset; orig finance_journal; p finance_period; firstp finance_period; idx integer; expected numeric; accum numeric;
BEGIN
 IF NEW.source_type NOT LIKE 'asset_%' AND NEW.reversal_of_id IS NULL AND NEW.status<>'posted' THEN RETURN NEW; END IF;
 PERFORM id FROM facility WHERE id=NEW.facility_id FOR UPDATE;
 IF NEW.reversal_of_id IS NOT NULL THEN
  SELECT * INTO orig FROM finance_journal WHERE id=NEW.reversal_of_id;
  SELECT * INTO e FROM finance_asset_entry WHERE journal_id=orig.id;
  IF e.id IS NOT NULL AND EXISTS(SELECT 1 FROM finance_asset_entry later JOIN finance_journal lj ON lj.id=later.journal_id LEFT JOIN finance_journal rev ON rev.reversal_of_id=lj.id AND rev.status='posted' WHERE later.asset_id=e.asset_id AND later.id<>e.id AND rev.id IS NULL AND (lj.date>orig.date OR (lj.date=orig.date AND (e.kind='acquisition' OR later.kind='disposal')))) THEN RAISE EXCEPTION 'Reverse later asset events before this event'; END IF;
  IF EXISTS(SELECT 1 FROM finance_asset allocated JOIN finance_journal_line l ON l.id=allocated.bill_line_id JOIN finance_asset_entry ae ON ae.asset_id=allocated.id AND ae.kind='acquisition' JOIN finance_journal aj ON aj.id=ae.journal_id LEFT JOIN finance_journal rev ON rev.reversal_of_id=aj.id AND rev.status='posted' WHERE l.journal_id=orig.id AND rev.id IS NULL) THEN RAISE EXCEPTION 'Reverse capitalized assets before their supplier bill'; END IF;
 END IF;
 IF NEW.status<>'posted' THEN RETURN NEW; END IF;
 IF NEW.source_type NOT LIKE 'asset_%' THEN
  IF NEW.source_type<>'reversal' AND EXISTS(SELECT 1 FROM finance_journal_line l JOIN finance_account ac ON ac.id=l.account_id WHERE l.journal_id=NEW.id AND ac.system_key IN ('asset_cost','asset_accum')) THEN RAISE EXCEPTION 'Registered asset control accounts require asset sources'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO e FROM finance_asset_entry WHERE journal_id=NEW.id AND facility_id=NEW.facility_id;
 IF e.id IS NULL OR e.id<>NEW.source_id OR NEW.source_type<>'asset_'||e.kind OR e.period_id<>NEW.period_id THEN RAISE EXCEPTION 'Missing asset journal source'; END IF;
 SELECT * INTO a FROM finance_asset WHERE id=e.asset_id;
 SELECT * INTO p FROM finance_period WHERE id=e.period_id;
 SELECT * INTO firstp FROM finance_period WHERE id=a.start_period_id;
 IF EXISTS(SELECT 1 FROM finance_asset_expected_lines(e.id) x FULL JOIN (SELECT account_id,debit,credit,cost_centre_id FROM finance_journal_line WHERE journal_id=NEW.id) l ON l.account_id=x.account_id AND l.cost_centre_id IS NOT DISTINCT FROM x.cost_centre_id AND l.debit=x.debit AND l.credit=x.credit WHERE x.account_id IS NULL OR l.account_id IS NULL) OR (SELECT count(*) FROM finance_asset_expected_lines(e.id))<>(SELECT count(*) FROM finance_journal_line WHERE journal_id=NEW.id) THEN RAISE EXCEPTION 'Asset journal does not match source amounts/accounts/department'; END IF;
 IF e.kind='acquisition' THEN
  IF e.amount<>a.cost OR NEW.date<>a.acquired_on THEN RAISE EXCEPTION 'Acquisition amount/date mismatch'; END IF;
  IF a.bill_line_id IS NULL AND NOT EXISTS(SELECT 1 FROM finance_account WHERE id=e.offset_account_id AND is_cash AND is_active AND NOT is_control) THEN RAISE EXCEPTION 'Cash acquisition requires cash/bank account'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM finance_asset_entry ae JOIN finance_journal j ON j.id=ae.journal_id WHERE ae.asset_id=a.id AND ae.kind='acquisition' AND j.status='posted' AND NOT EXISTS(SELECT 1 FROM finance_journal WHERE reversal_of_id=j.id)) THEN RAISE EXCEPTION 'Post active asset acquisition first'; END IF;
  IF EXISTS(SELECT 1 FROM finance_asset_entry ae JOIN finance_journal j ON j.id=ae.journal_id JOIN finance_journal rev ON rev.reversal_of_id=j.id WHERE ae.asset_id=a.id AND rev.status='draft') THEN RAISE EXCEPTION 'Finish pending asset reversals first'; END IF;
  IF e.kind='depreciation' THEN
   idx:=(substring(p.label,1,4)::int-substring(firstp.label,1,4)::int)*12+substring(p.label,6,2)::int-substring(firstp.label,6,2)::int;
   expected:=GREATEST(0,LEAST(round((a.cost-a.residual)/a.life_months,2),a.cost-a.residual-round((a.cost-a.residual)/a.life_months,2)*idx));
   IF idx=a.life_months-1 THEN expected:=GREATEST(0,a.cost-a.residual-round((a.cost-a.residual)/a.life_months,2)*idx); END IF;
   IF idx<0 OR idx>=a.life_months OR e.amount<>expected OR NEW.date<>p.ends_on-interval '1 day' OR p.ends_on>now() THEN RAISE EXCEPTION 'Depreciation schedule mismatch or unfinished month'; END IF;
   IF EXISTS(SELECT 1 FROM finance_asset_entry ae JOIN finance_journal j ON j.id=ae.journal_id LEFT JOIN finance_journal rev ON rev.reversal_of_id=j.id AND rev.status='posted' WHERE ae.asset_id=a.id AND ae.kind='disposal' AND rev.id IS NULL) THEN RAISE EXCEPTION 'Asset is disposed or reserved for disposal'; END IF;
  ELSE
   SELECT COALESCE(sum(ae.amount),0) INTO accum FROM finance_asset_entry ae JOIN finance_journal j ON j.id=ae.journal_id LEFT JOIN finance_journal rev ON rev.reversal_of_id=j.id AND rev.status='posted' WHERE ae.asset_id=a.id AND ae.kind='depreciation' AND j.status='posted' AND rev.id IS NULL;
   IF e.amount<>accum OR accum>a.cost-a.residual OR EXISTS(SELECT 1 FROM finance_asset_entry ae JOIN finance_journal j ON j.id=ae.journal_id LEFT JOIN finance_journal rev ON rev.reversal_of_id=j.id AND rev.status='posted' WHERE ae.asset_id=a.id AND ae.id<>e.id AND rev.id IS NULL AND (j.status='draft' OR j.date>NEW.date)) THEN RAISE EXCEPTION 'Disposal requires all earlier entries posted and matching book value'; END IF;
   IF e.proceeds>0 AND NOT EXISTS(SELECT 1 FROM finance_account WHERE id=e.offset_account_id AND is_cash AND is_active AND NOT is_control) THEN RAISE EXCEPTION 'Disposal requires cash/bank proceeds'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION finance_asset_close_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a record; idx integer; expected numeric;
BEGIN
 IF NEW.closed_at IS NULL OR OLD.closed_at IS NOT NULL THEN RETURN NEW; END IF;
 PERFORM id FROM facility WHERE id=NEW.facility_id FOR UPDATE;
 FOR a IN SELECT registered.*,p.label first_label FROM finance_asset registered JOIN finance_period p ON p.id=registered.start_period_id
 WHERE registered.facility_id=NEW.facility_id AND p.starts_on<=NEW.starts_on
 AND EXISTS(SELECT 1 FROM finance_asset_entry e JOIN finance_journal j ON j.id=e.journal_id LEFT JOIN finance_journal r ON r.reversal_of_id=j.id AND r.status='posted' WHERE e.asset_id=registered.id AND e.kind='acquisition' AND r.id IS NULL)
 AND NOT EXISTS(SELECT 1 FROM finance_asset_entry e JOIN finance_journal j ON j.id=e.journal_id LEFT JOIN finance_journal r ON r.reversal_of_id=j.id AND r.status='posted' WHERE e.asset_id=registered.id AND e.kind='disposal' AND j.date<NEW.ends_on AND r.id IS NULL)
 LOOP
  idx:=(substring(NEW.label,1,4)::int-substring(a.first_label,1,4)::int)*12+substring(NEW.label,6,2)::int-substring(a.first_label,6,2)::int;
  IF idx>=a.life_months THEN CONTINUE; END IF;
  expected:=GREATEST(0,LEAST(round((a.cost-a.residual)/a.life_months,2),a.cost-a.residual-round((a.cost-a.residual)/a.life_months,2)*idx));
  IF idx=a.life_months-1 THEN expected:=GREATEST(0,a.cost-a.residual-round((a.cost-a.residual)/a.life_months,2)*idx); END IF;
  IF expected>0 AND NOT EXISTS(SELECT 1 FROM finance_asset_entry e JOIN finance_journal j ON j.id=e.journal_id LEFT JOIN finance_journal r ON r.reversal_of_id=j.id AND r.status='posted' WHERE e.asset_id=a.id AND e.kind='depreciation' AND e.period_id=NEW.id AND j.status='posted' AND r.id IS NULL) THEN RAISE EXCEPTION 'Generate and post depreciation for asset % before closing %',a.code,NEW.label; END IF;
 END LOOP;
 RETURN NEW;
END $$;

COMMIT;
