-- Apply after finance_foundations to the disposable database containing finance-legacy.sql.
DO $$
DECLARE j finance_journal; p finance_period; s finance_statement; blocked boolean := false;
BEGIN
 SELECT * INTO j FROM finance_journal WHERE id='upgrade-journal';
 SELECT * INTO p FROM finance_period WHERE id=j.period_id;
 IF j.status<>'posted' OR j.number<>'JRN-2025-000001' OR j.legacy_period_id<>'upgrade-period'
   OR j.date<>'2025-09-26T19:30:00Z'::timestamptz OR p.label<>'1404-07'
   OR j.created_at<>'2025-09-27T08:00:00.123Z'::timestamptz OR j.posted_at<>'2025-09-27T08:01:00.456Z'::timestamptz
   THEN RAISE EXCEPTION 'Journal history or instant changed during migration'; END IF;
 IF (SELECT sum(debit) FROM finance_journal_line WHERE journal_id=j.id)<>123.45
   OR (SELECT sum(credit) FROM finance_journal_line WHERE journal_id=j.id)<>123.45 THEN RAISE EXCEPTION 'Amounts changed'; END IF;
 SELECT * INTO s FROM finance_statement WHERE id='upgrade-statement';
 IF s.ends_on<>'2025-09-30T19:29:59.999Z'::timestamptz OR s.reconciled_at<>'2025-10-01T12:01:00Z'::timestamptz
   OR NOT EXISTS(SELECT 1 FROM finance_statement_line WHERE id='upgrade-movement' AND journal_line_id='upgrade-debit' AND amount=123.45)
   THEN RAISE EXCEPTION 'Finalized reconciliation changed'; END IF;
 BEGIN
   INSERT INTO finance_journal(id,facility_id,period_id,date,memo,created_by)
   VALUES('must-not-post','upgrade-facility',p.id,'2025-09-28T00:00:00Z','Blocked legacy date','upgrade-user');
 EXCEPTION WHEN raise_exception THEN blocked := true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Legacy closed date became writable'; END IF;
 blocked := false;
 BEGIN UPDATE finance_journal SET memo='tamper' WHERE id=j.id;
 EXCEPTION WHEN raise_exception THEN blocked := true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Posted immutability was not restored'; END IF;
 IF (SELECT count(*) FROM finance_period WHERE facility_id='upgrade-facility' AND label LIKE '1404-%')<>12
   THEN RAISE EXCEPTION '1404 incomplete'; END IF;
END $$;
SELECT 'Legacy posted journal, closed dates, finalized statement and amounts preserved' AS result;
