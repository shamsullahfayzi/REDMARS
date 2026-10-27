-- Keep the PL/pgSQL bill record distinct from the supplier-count table alias.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('finance_payable_post_guard()'::regprocedure) INTO definition;
 definition := replace(definition,
  'SELECT count(DISTINCT b.supplier_id) FROM finance_settlement s JOIN finance_bill b ON b.id=s.bill_id',
  'SELECT count(DISTINCT counted_bill.supplier_id) FROM finance_settlement s JOIN finance_bill counted_bill ON counted_bill.id=s.bill_id');
 EXECUTE definition;
END $$;
