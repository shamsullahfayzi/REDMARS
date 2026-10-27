-- A manually entered receipt has a Kabul business date at midnight. Include the
-- invoice events later on that same business day when checking available debt.
DO $$ BEGIN
 EXECUTE replace(pg_get_functiondef('finance_review_source_balance()'::regprocedure),
  'j.date<=NEW.date',
  'j.date<(date_trunc(''day'',NEW.date AT TIME ZONE ''Asia/Kabul'')+interval ''1 day'') AT TIME ZONE ''Asia/Kabul''');
END $$;
