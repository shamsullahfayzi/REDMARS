BEGIN;
-- CreateTable
CREATE TABLE "finance_asset" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "cost" DECIMAL(18,2) NOT NULL,
    "residual" DECIMAL(18,2) NOT NULL,
    "life_months" INTEGER NOT NULL,
    "acquired_on" TIMESTAMPTZ(3) NOT NULL,
    "start_period_id" TEXT NOT NULL,
    "cost_centre_id" TEXT,
    "bill_line_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_asset_entry" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "journal_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "proceeds" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "offset_account_id" TEXT NOT NULL,

    CONSTRAINT "finance_asset_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_budget" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "cost_centre_id" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "finance_budget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_asset_id_facility_id_key" ON "finance_asset"("id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_asset_facility_id_code_key" ON "finance_asset"("facility_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "finance_asset_entry_journal_id_key" ON "finance_asset_entry"("journal_id");

-- CreateIndex
CREATE INDEX "finance_asset_entry_asset_id_period_id_idx" ON "finance_asset_entry"("asset_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_asset_entry_id_facility_id_key" ON "finance_asset_entry"("id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_asset_entry_journal_id_facility_id_key" ON "finance_asset_entry"("journal_id", "facility_id");

-- CreateIndex
CREATE INDEX "finance_budget_facility_id_period_id_idx" ON "finance_budget"("facility_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_budget_id_facility_id_key" ON "finance_budget"("id", "facility_id");

-- AddForeignKey
ALTER TABLE "finance_asset" ADD CONSTRAINT "finance_asset_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_asset" ADD CONSTRAINT "finance_asset_start_period_id_facility_id_fkey" FOREIGN KEY ("start_period_id", "facility_id") REFERENCES "finance_period"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_asset" ADD CONSTRAINT "finance_asset_cost_centre_id_facility_id_fkey" FOREIGN KEY ("cost_centre_id", "facility_id") REFERENCES "finance_cost_centre"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_asset" ADD CONSTRAINT "finance_asset_bill_line_id_facility_id_fkey" FOREIGN KEY ("bill_line_id", "facility_id") REFERENCES "finance_journal_line"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_asset_entry" ADD CONSTRAINT "finance_asset_entry_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_asset_entry" ADD CONSTRAINT "finance_asset_entry_asset_id_facility_id_fkey" FOREIGN KEY ("asset_id", "facility_id") REFERENCES "finance_asset"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_asset_entry" ADD CONSTRAINT "finance_asset_entry_journal_id_facility_id_fkey" FOREIGN KEY ("journal_id", "facility_id") REFERENCES "finance_journal"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_asset_entry" ADD CONSTRAINT "finance_asset_entry_period_id_facility_id_fkey" FOREIGN KEY ("period_id", "facility_id") REFERENCES "finance_period"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_budget" ADD CONSTRAINT "finance_budget_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_budget" ADD CONSTRAINT "finance_budget_period_id_facility_id_fkey" FOREIGN KEY ("period_id", "facility_id") REFERENCES "finance_period"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_budget" ADD CONSTRAINT "finance_budget_account_id_facility_id_fkey" FOREIGN KEY ("account_id", "facility_id") REFERENCES "finance_account"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_budget" ADD CONSTRAINT "finance_budget_cost_centre_id_facility_id_fkey" FOREIGN KEY ("cost_centre_id", "facility_id") REFERENCES "finance_cost_centre"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE finance_asset ADD CHECK(cost>0 AND residual>=0 AND residual<cost AND life_months BETWEEN 1 AND 1200);
ALTER TABLE finance_asset ADD FOREIGN KEY(created_by,facility_id) REFERENCES app_user(id,facility_id);
ALTER TABLE finance_asset_entry ADD CHECK(kind IN ('acquisition','depreciation','disposal') AND amount>=0 AND proceeds>=0 AND (kind='disposal' OR (amount>0 AND proceeds=0)));
ALTER TABLE finance_asset_entry ADD FOREIGN KEY(offset_account_id,facility_id) REFERENCES finance_account(id,facility_id);
ALTER TABLE finance_budget ADD CHECK(amount>=0 AND version>0);
CREATE UNIQUE INDEX finance_budget_scope ON finance_budget(facility_id,period_id,account_id,COALESCE(cost_centre_id,''));

CREATE FUNCTION finance_asset_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb; j finance_journal; a finance_asset; p finance_period; used numeric; available numeric;
BEGIN
 r:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 PERFORM id FROM facility WHERE id=r->>'facility_id' FOR UPDATE;
 IF TG_TABLE_NAME='finance_budget' THEN
  IF TG_OP='UPDATE' AND (OLD.id,OLD.facility_id,OLD.period_id,OLD.account_id,OLD.cost_centre_id,OLD.version+1) IS DISTINCT FROM (NEW.id,NEW.facility_id,NEW.period_id,NEW.account_id,NEW.cost_centre_id,NEW.version) THEN RAISE EXCEPTION 'Budget scope is immutable and version must increment'; END IF;
  IF EXISTS(SELECT 1 FROM finance_period WHERE id=r->>'period_id' AND closed_at IS NOT NULL) THEN RAISE EXCEPTION 'Budget period is closed'; END IF;
  IF TG_OP<>'DELETE' THEN
   IF NOT EXISTS(SELECT 1 FROM finance_account WHERE id=NEW.account_id AND facility_id=NEW.facility_id AND is_active AND is_posting AND type IN ('expense','revenue')) THEN RAISE EXCEPTION 'Invalid budget account'; END IF;
   IF EXISTS(SELECT 1 FROM finance_budget b WHERE b.facility_id=NEW.facility_id AND b.period_id=NEW.period_id AND b.account_id=NEW.account_id AND b.id<>NEW.id AND (b.cost_centre_id IS NULL)<>(NEW.cost_centre_id IS NULL)) THEN RAISE EXCEPTION 'Overlapping facility and department budgets'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='finance_asset' THEN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Asset terms are immutable; reverse acquisition and register corrected asset'; END IF;
  IF TG_OP='DELETE' AND (COALESCE(current_setting('redmars.finance_discard',true),'')='' OR EXISTS(SELECT 1 FROM finance_asset_entry WHERE asset_id=OLD.id)) THEN RAISE EXCEPTION 'Only an unused draft asset can be removed'; END IF;
  IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM finance_period WHERE id=NEW.start_period_id AND facility_id=NEW.facility_id AND ends_on>NEW.acquired_on AND closed_at IS NULL) THEN RAISE EXCEPTION 'Invalid first depreciation period'; END IF;
 ELSE
  SELECT * INTO j FROM finance_journal WHERE id=r->>'journal_id';
  IF TG_OP='DELETE' THEN
   IF j.status<>'draft' OR current_setting('redmars.finance_discard',true) IS DISTINCT FROM j.id THEN RAISE EXCEPTION 'Only discard a matching draft'; END IF;
  ELSIF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Asset entries are immutable';
  ELSE
   SELECT * INTO a FROM finance_asset WHERE id=NEW.asset_id;
   IF j.id IS NULL OR j.status<>'draft' OR j.source_type<>'asset_'||NEW.kind OR j.source_id<>NEW.id OR j.period_id<>NEW.period_id THEN RAISE EXCEPTION 'Asset entry requires matching draft source'; END IF;
   IF EXISTS(SELECT 1 FROM finance_asset_entry e JOIN finance_journal ej ON ej.id=e.journal_id LEFT JOIN finance_journal rev ON rev.reversal_of_id=ej.id AND rev.status='posted' WHERE e.asset_id=a.id AND e.kind=NEW.kind AND (NEW.kind<>'depreciation' OR e.period_id=NEW.period_id) AND rev.id IS NULL) THEN RAISE EXCEPTION 'Duplicate active asset event'; END IF;
   IF NEW.kind='acquisition' AND a.bill_line_id IS NOT NULL THEN
    SELECT l.debit INTO available FROM finance_journal_line l JOIN finance_journal bj ON bj.id=l.journal_id JOIN finance_bill b ON b.journal_id=bj.id JOIN finance_account ac ON ac.id=l.account_id WHERE l.id=a.bill_line_id AND bj.status='posted' AND NOT EXISTS(SELECT 1 FROM finance_journal WHERE reversal_of_id=bj.id) AND bj.date<=j.date AND b.kind<>'opening' AND NOT ac.is_control AND NOT ac.is_cash AND ac.type IN ('asset','expense') AND l.account_id=NEW.offset_account_id;
    SELECT COALESCE(sum(other.cost),0) INTO used FROM finance_asset other JOIN finance_asset_entry e ON e.asset_id=other.id AND e.kind='acquisition' JOIN finance_journal ej ON ej.id=e.journal_id LEFT JOIN finance_journal rev ON rev.reversal_of_id=ej.id AND rev.status='posted' WHERE other.bill_line_id=a.bill_line_id AND rev.id IS NULL;
    IF available IS NULL OR available<used+a.cost THEN RAISE EXCEPTION 'Bill line over-capitalization or invalid source'; END IF;
   END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['finance_asset','finance_asset_entry','finance_budget'] LOOP
 EXECUTE format('CREATE TRIGGER asset_source_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION finance_asset_source_guard()',tbl);
 EXECUTE format('CREATE TRIGGER finance_capture AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION finance_capture_audit()',tbl);
 END LOOP;
END $$;

CREATE FUNCTION finance_asset_expected_lines(eid text) RETURNS TABLE(account_id text,debit numeric,credit numeric,cost_centre_id text) LANGUAGE sql STABLE AS $$
 WITH data AS (SELECT e.*,a.cost,a.cost_centre_id FROM finance_asset_entry e JOIN finance_asset a ON a.id=e.asset_id WHERE e.id=eid),
 expected AS (
 SELECT 'asset_cost' key,CASE WHEN kind='acquisition' THEN cost ELSE 0 END debit,CASE WHEN kind='disposal' THEN cost ELSE 0 END credit FROM data WHERE kind IN ('acquisition','disposal')
 UNION ALL SELECT 'asset_accum',CASE WHEN kind='disposal' THEN amount ELSE 0 END,CASE WHEN kind='depreciation' THEN amount ELSE 0 END FROM data WHERE kind IN ('depreciation','disposal')
 UNION ALL SELECT 'asset_expense',amount,0 FROM data WHERE kind='depreciation'
 UNION ALL SELECT 'asset_gain',0,proceeds-cost+amount FROM data WHERE kind='disposal' AND proceeds>cost-amount
 UNION ALL SELECT 'asset_loss',cost-amount-proceeds,0 FROM data WHERE kind='disposal' AND proceeds<cost-amount
 )
 SELECT ac.id,x.debit,x.credit,d.cost_centre_id FROM expected x CROSS JOIN data d JOIN finance_account ac ON ac.facility_id=d.facility_id AND ac.system_key=x.key WHERE x.debit>0 OR x.credit>0
 UNION ALL SELECT offset_account_id,CASE WHEN kind='disposal' THEN proceeds ELSE 0 END,CASE WHEN kind='acquisition' THEN cost ELSE 0 END,cost_centre_id FROM data WHERE kind='acquisition' OR (kind='disposal' AND proceeds>0)
$$;
CREATE FUNCTION finance_asset_post_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e finance_asset_entry; a finance_asset; orig finance_journal; p finance_period; firstp finance_period; idx integer; expected numeric; accum numeric;
BEGIN
 IF NEW.source_type NOT LIKE 'asset_%' AND NEW.reversal_of_id IS NULL AND NEW.status<>'posted' THEN RETURN NEW; END IF;
 PERFORM id FROM facility WHERE id=NEW.facility_id FOR UPDATE;
 IF NEW.reversal_of_id IS NOT NULL THEN
  SELECT * INTO orig FROM finance_journal WHERE id=NEW.reversal_of_id;
  SELECT * INTO e FROM finance_asset_entry WHERE journal_id=orig.id;
  IF e.id IS NOT NULL AND EXISTS(SELECT 1 FROM finance_asset_entry later JOIN finance_journal lj ON lj.id=later.journal_id LEFT JOIN finance_journal rev ON rev.reversal_of_id=lj.id AND rev.status='posted' WHERE later.asset_id=e.asset_id AND later.id<>e.id AND rev.id IS NULL AND (lj.date>orig.date OR (lj.date=orig.date AND (e.kind='acquisition' OR later.kind='disposal')))) THEN RAISE EXCEPTION 'Reverse later asset events before this event'; END IF;
  IF EXISTS(SELECT 1 FROM finance_asset a JOIN finance_journal_line l ON l.id=a.bill_line_id JOIN finance_asset_entry ae ON ae.asset_id=a.id AND ae.kind='acquisition' JOIN finance_journal aj ON aj.id=ae.journal_id LEFT JOIN finance_journal rev ON rev.reversal_of_id=aj.id AND rev.status='posted' WHERE l.journal_id=orig.id AND rev.id IS NULL) THEN RAISE EXCEPTION 'Reverse capitalized assets before their supplier bill'; END IF;
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
CREATE TRIGGER asset_post_guard BEFORE INSERT OR UPDATE ON finance_journal FOR EACH ROW EXECUTE FUNCTION finance_asset_post_guard();
COMMIT;
