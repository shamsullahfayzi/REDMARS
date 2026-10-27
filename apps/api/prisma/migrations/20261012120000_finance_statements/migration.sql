BEGIN;
-- AlterTable
ALTER TABLE "finance_period" ADD COLUMN     "locked_at" TIMESTAMPTZ(3),
ADD COLUMN     "locked_by" TEXT;

-- CreateTable
CREATE TABLE "finance_report_grant" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "viewer_id" TEXT NOT NULL,
    "viewer_facility_id" TEXT NOT NULL,
    "granted_by" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "finance_report_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_report_template" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "definition" JSONB NOT NULL,

    CONSTRAINT "finance_report_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_cash_classification" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "journal_id" TEXT NOT NULL,
    "rows" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "finance_cash_classification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_period_event" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_period_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_year_closing" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "year_id" TEXT NOT NULL,
    "journal_id" TEXT,
    "prepared_by" TEXT NOT NULL,
    "finalized_by" TEXT,
    "finalized_at" TIMESTAMPTZ(3),
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "finance_year_closing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_report_grant_facility_id_viewer_id_key" ON "finance_report_grant"("facility_id", "viewer_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_report_template_id_facility_id_key" ON "finance_report_template"("id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_report_template_facility_id_name_key" ON "finance_report_template"("facility_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "finance_cash_classification_journal_id_key" ON "finance_cash_classification"("journal_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_cash_classification_journal_id_facility_id_key" ON "finance_cash_classification"("journal_id", "facility_id");

-- CreateIndex
CREATE INDEX "finance_period_event_facility_id_period_id_idx" ON "finance_period_event"("facility_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_year_closing_year_id_key" ON "finance_year_closing"("year_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_year_closing_journal_id_key" ON "finance_year_closing"("journal_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_year_closing_journal_id_facility_id_key" ON "finance_year_closing"("journal_id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_year_closing_year_id_facility_id_key" ON "finance_year_closing"("year_id", "facility_id");

-- AddForeignKey
ALTER TABLE "finance_report_grant" ADD CONSTRAINT "finance_report_grant_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_report_grant" ADD CONSTRAINT "finance_report_grant_viewer_id_viewer_facility_id_fkey" FOREIGN KEY ("viewer_id", "viewer_facility_id") REFERENCES "app_user"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_report_template" ADD CONSTRAINT "finance_report_template_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_cash_classification" ADD CONSTRAINT "finance_cash_classification_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_cash_classification" ADD CONSTRAINT "finance_cash_classification_journal_id_facility_id_fkey" FOREIGN KEY ("journal_id", "facility_id") REFERENCES "finance_journal"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_period_event" ADD CONSTRAINT "finance_period_event_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_period_event" ADD CONSTRAINT "finance_period_event_period_id_facility_id_fkey" FOREIGN KEY ("period_id", "facility_id") REFERENCES "finance_period"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_year_closing" ADD CONSTRAINT "finance_year_closing_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_year_closing" ADD CONSTRAINT "finance_year_closing_year_id_facility_id_fkey" FOREIGN KEY ("year_id", "facility_id") REFERENCES "fiscal_year"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_year_closing" ADD CONSTRAINT "finance_year_closing_journal_id_facility_id_fkey" FOREIGN KEY ("journal_id", "facility_id") REFERENCES "finance_journal"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION finance_guard_period() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE y fiscal_year; expected_start timestamptz; expected_end timestamptz;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Fiscal months cannot be deleted'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.closed_at IS NOT NULL OR NEW.locked_at IS NOT NULL THEN
 IF NOT (COALESCE(current_setting('app.finance_period_action',true),'') IN (NEW.id||':reopen',NEW.id||':lock') AND EXISTS(SELECT 1 FROM finance_period_event e WHERE e.period_id=NEW.id AND e.action=split_part(current_setting('app.finance_period_action',true),':',2) AND e.created_at>=transaction_timestamp())) THEN RAISE EXCEPTION 'Closed periods require a logged lock or reopen command'; END IF;
 IF EXISTS(SELECT 1 FROM finance_year_closing WHERE year_id=NEW.year_id AND finalized_at IS NOT NULL) THEN RAISE EXCEPTION 'Finalized years cannot be reopened'; END IF;
 END IF;
 IF NEW.locked_at IS NOT NULL AND NEW.closed_at IS NULL THEN RAISE EXCEPTION 'Only closed periods can be locked'; END IF;
 IF (NEW.closed_at IS NULL)<>(NEW.closed_by IS NULL) OR (NEW.locked_at IS NULL)<>(NEW.locked_by IS NULL) THEN RAISE EXCEPTION 'Period action requires its actor'; END IF;
  IF (NEW.id,NEW.facility_id,NEW.year_id,NEW.month,NEW.label,NEW.name,NEW.starts_on,NEW.ends_on) IS DISTINCT FROM
     (OLD.id,OLD.facility_id,OLD.year_id,OLD.month,OLD.label,OLD.name,OLD.starts_on,OLD.ends_on) THEN RAISE EXCEPTION 'Fiscal month boundaries are immutable'; END IF;
 END IF;
 SELECT * INTO y FROM fiscal_year WHERE id=NEW.year_id AND facility_id=NEW.facility_id;
 IF NOT FOUND OR NEW.month NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Invalid fiscal year or month'; END IF;
 expected_start := y.starts_on + (CASE WHEN NEW.month<=6 THEN (NEW.month-1)*31 ELSE 186+(NEW.month-7)*30 END)*interval '24 hours';
 expected_end := CASE WHEN NEW.month=12 THEN y.ends_on ELSE expected_start+(CASE WHEN NEW.month<=6 THEN 31 ELSE 30 END)*interval '24 hours' END;
 IF NEW.label<>y.label||'-'||lpad(NEW.month::text,2,'0') OR NEW.starts_on<>expected_start OR NEW.ends_on<>expected_end THEN RAISE EXCEPTION 'Fiscal month must use its canonical Shamsi boundaries'; END IF;
 IF NEW.closed_at IS NOT NULL THEN
  IF EXISTS (SELECT 1 FROM finance_journal WHERE period_id=NEW.id AND status='draft') THEN RAISE EXCEPTION 'Post or remove draft journals before closing'; END IF;
  IF EXISTS (SELECT 1 FROM integration_event e JOIN finance_settings s ON s.facility_id=e.facility_id
    WHERE e.facility_id=NEW.facility_id AND e.occurred_at>=GREATEST(NEW.starts_on,s.cutover_date) AND e.occurred_at<NEW.ends_on
    AND e.type IN ('hmis.Invoice.create.v1','hmis.Invoice.update.v1','hmis.Invoice.delete.v1','hmis.Payment.create.v1')
    AND NOT EXISTS (SELECT 1 FROM integration_receipt r WHERE r.event_id=e.id AND r.consumer='finance.ledger.v1'))
   THEN RAISE EXCEPTION 'Process outstanding hospital billing events before closing'; END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER TABLE finance_report_grant ADD CONSTRAINT report_grant_actor FOREIGN KEY(granted_by,facility_id) REFERENCES app_user(id,facility_id);
ALTER TABLE finance_period_event ADD CONSTRAINT period_event_actor FOREIGN KEY(actor_id,facility_id) REFERENCES app_user(id,facility_id);
ALTER TABLE finance_period ADD CONSTRAINT period_lock_actor FOREIGN KEY(locked_by,facility_id) REFERENCES app_user(id,facility_id);
ALTER TABLE finance_year_closing ADD CONSTRAINT year_prepared_actor FOREIGN KEY(prepared_by,facility_id) REFERENCES app_user(id,facility_id);
ALTER TABLE finance_year_closing ADD CONSTRAINT year_finalized_actor FOREIGN KEY(finalized_by,facility_id) REFERENCES app_user(id,facility_id);
ALTER TABLE finance_period_event ADD CONSTRAINT period_event_reason CHECK(length(trim(reason))>0);
ALTER TABLE finance_report_grant ADD CONSTRAINT report_grant_distinct_facilities CHECK(facility_id<>viewer_facility_id);
CREATE TRIGGER period_event_immutable BEFORE UPDATE OR DELETE ON finance_period_event FOR EACH ROW EXECUTE FUNCTION finance_immutable_source();

CREATE FUNCTION finance_missing_depreciation(pid text) RETURNS TABLE(code text) LANGUAGE plpgsql AS $$
DECLARE p finance_period; assetrow record; idx integer; expected numeric;
BEGIN
 SELECT * INTO p FROM finance_period WHERE id=pid;
 FOR assetrow IN SELECT a.*,sp.label first_label FROM finance_asset a JOIN finance_period sp ON sp.id=a.start_period_id
 WHERE a.facility_id=p.facility_id AND sp.starts_on<=p.starts_on
 AND EXISTS(SELECT 1 FROM finance_asset_entry e JOIN finance_journal j ON j.id=e.journal_id LEFT JOIN finance_journal r ON r.reversal_of_id=j.id AND r.status='posted' WHERE e.asset_id=a.id AND e.kind='acquisition' AND r.id IS NULL)
 AND NOT EXISTS(SELECT 1 FROM finance_asset_entry e JOIN finance_journal j ON j.id=e.journal_id LEFT JOIN finance_journal r ON r.reversal_of_id=j.id AND r.status='posted' WHERE e.asset_id=a.id AND e.kind='disposal' AND j.date<p.ends_on AND r.id IS NULL)
 LOOP
  idx:=(substring(p.label,1,4)::int-substring(assetrow.first_label,1,4)::int)*12+substring(p.label,6,2)::int-substring(assetrow.first_label,6,2)::int;
  IF idx>=assetrow.life_months THEN CONTINUE; END IF;
  expected:=GREATEST(0,LEAST(round((assetrow.cost-assetrow.residual)/assetrow.life_months,2),assetrow.cost-assetrow.residual-round((assetrow.cost-assetrow.residual)/assetrow.life_months,2)*idx));
  IF idx=assetrow.life_months-1 THEN expected:=GREATEST(0,assetrow.cost-assetrow.residual-round((assetrow.cost-assetrow.residual)/assetrow.life_months,2)*idx); END IF;
  IF expected>0 AND NOT EXISTS(SELECT 1 FROM finance_asset_entry e JOIN finance_journal j ON j.id=e.journal_id LEFT JOIN finance_journal r ON r.reversal_of_id=j.id AND r.status='posted' WHERE e.asset_id=assetrow.id AND e.kind='depreciation' AND e.period_id=p.id AND j.status='posted' AND r.id IS NULL) THEN code:=assetrow.code; RETURN NEXT; END IF;
 END LOOP;
END $$;

-- Preparing year-end freezes its ledger, including direct SQL changes, until cancellation or finalization.
CREATE FUNCTION finance_year_journal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rec finance_year_closing; yr text;
BEGIN
 IF TG_TABLE_NAME='finance_journal_line' THEN
  SELECT p.year_id INTO yr FROM finance_journal j JOIN finance_period p ON p.id=j.period_id WHERE j.id=COALESCE(to_jsonb(NEW)->>'journal_id',to_jsonb(OLD)->>'journal_id');
  IF EXISTS(SELECT 1 FROM finance_year_closing WHERE year_id=yr) THEN RAISE EXCEPTION 'Prepared year-end freezes journal lines; cancel the preparation before changing them'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 END IF;
 SELECT year_id INTO yr FROM finance_period WHERE id=COALESCE(to_jsonb(NEW)->>'period_id',to_jsonb(OLD)->>'period_id');
 SELECT * INTO rec FROM finance_year_closing WHERE year_id=yr;
 IF rec.id IS NOT NULL THEN
  IF TG_OP<>'UPDATE' OR NEW.id IS DISTINCT FROM rec.journal_id OR OLD.status<>'draft' OR NEW.status<>'posted' OR
    (to_jsonb(NEW)-ARRAY['status','posted_by','posted_at','number','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','posted_by','posted_at','number','version'])
   THEN RAISE EXCEPTION 'Prepared year-end freezes accounting entries'; END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
  IF NEW.reversal_of_id IS NOT NULL AND EXISTS(SELECT 1 FROM finance_journal WHERE id=NEW.reversal_of_id AND source_type='year_close') THEN RAISE EXCEPTION 'Year-end journals cannot be reversed'; END IF;
  IF NEW.source_type='year_close' AND NEW.status='posted' AND (rec.journal_id IS DISTINCT FROM NEW.id OR rec.prepared_by=NEW.posted_by) THEN RAISE EXCEPTION 'Year closing requires an independently reviewed preparation'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER year_journal_guard BEFORE INSERT OR UPDATE OR DELETE ON finance_journal FOR EACH ROW EXECUTE FUNCTION finance_year_journal_guard();
CREATE TRIGGER year_line_guard BEFORE INSERT OR UPDATE OR DELETE ON finance_journal_line FOR EACH ROW EXECUTE FUNCTION finance_year_journal_guard();

CREATE FUNCTION finance_year_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j finance_journal;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.finalized_at IS NOT NULL OR EXISTS(SELECT 1 FROM finance_journal WHERE id=OLD.journal_id AND status='posted') THEN RAISE EXCEPTION 'Posted year-end closing is immutable'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.finalized_at IS NOT NULL OR (to_jsonb(NEW)-ARRAY['finalized_at','finalized_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['finalized_at','finalized_by']) THEN RAISE EXCEPTION 'Year preparation is immutable'; END IF;
  IF NEW.finalized_at IS NULL OR NEW.finalized_by IS NULL OR NEW.finalized_by=NEW.prepared_by OR EXISTS(SELECT 1 FROM finance_period WHERE year_id=NEW.year_id AND locked_at IS NULL) THEN RAISE EXCEPTION 'Finalize only after independent review and all twelve months are locked'; END IF;
 END IF;
 IF NEW.journal_id IS NOT NULL THEN
  SELECT * INTO j FROM finance_journal WHERE id=NEW.journal_id;
  IF j.source_type<>'year_close' OR j.source_id<>NEW.id OR j.created_by<>NEW.prepared_by OR NOT EXISTS(SELECT 1 FROM finance_period WHERE id=j.period_id AND year_id=NEW.year_id AND month=12) THEN RAISE EXCEPTION 'Invalid year-end source journal'; END IF;
  IF NEW.finalized_at IS NOT NULL AND j.status<>'posted' THEN RAISE EXCEPTION 'Post the closing journal before finalizing'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER year_source_guard BEFORE INSERT OR UPDATE OR DELETE ON finance_year_closing FOR EACH ROW EXECUTE FUNCTION finance_year_source_guard();

CREATE FUNCTION finance_classification_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j finance_journal; cash numeric; allocated numeric;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Change classifications through the audited version workflow'; END IF;
 SELECT * INTO j FROM finance_journal WHERE id=NEW.journal_id AND facility_id=NEW.facility_id;
 IF j.status<>'posted' OR EXISTS(SELECT 1 FROM finance_period WHERE id=j.period_id AND closed_at IS NOT NULL) THEN RAISE EXCEPTION 'Classify posted cash journals in open periods only'; END IF;
 IF TG_OP='UPDATE' AND (NEW.journal_id<>OLD.journal_id OR NEW.facility_id<>OLD.facility_id OR NEW.version<>OLD.version+1) THEN RAISE EXCEPTION 'Invalid classification version'; END IF;
 SELECT COALESCE(sum(l.base_debit-l.base_credit),0) INTO cash FROM finance_journal_line l JOIN finance_account a ON a.id=l.account_id WHERE l.journal_id=j.id AND a.is_cash;
 SELECT sum((r->>'amount')::numeric) INTO allocated FROM jsonb_array_elements(NEW.rows) r;
 IF cash=0 OR allocated IS DISTINCT FROM cash OR jsonb_array_length(NEW.rows)=0 THEN RAISE EXCEPTION 'Classifications must reconcile to external cash'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.rows) r WHERE r->>'category' NOT IN ('operating','investing','financing','opening','unclassified') OR ((r->>'accountId') IS NOT NULL AND (r->>'category'<>'operating' OR NOT EXISTS(SELECT 1 FROM finance_account WHERE id=r->>'accountId' AND facility_id=NEW.facility_id AND type IN ('revenue','expense'))))) THEN RAISE EXCEPTION 'Invalid classification account or category'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER classification_guard BEFORE INSERT OR UPDATE OR DELETE ON finance_cash_classification FOR EACH ROW EXECUTE FUNCTION finance_classification_guard();

DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['finance_report_grant','finance_report_template','finance_cash_classification','finance_period_event','finance_year_closing'] LOOP
 EXECUTE format('CREATE TRIGGER finance_capture AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION finance_capture_audit()',tbl);
 END LOOP;
END $$;
INSERT INTO role(id,code,name,description) VALUES(gen_random_uuid()::text,'auditor','Auditor','Read-only financial reports and exports') ON CONFLICT(code) DO NOTHING;
INSERT INTO permission(id,code,resource,action) VALUES(gen_random_uuid()::text,'finance.export','finance','export'),(gen_random_uuid()::text,'finance.consolidation.manage','finance','consolidation.manage') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permission(role_id,permission_id) SELECT r.id,p.id FROM role r CROSS JOIN permission p WHERE
 (r.code='auditor' AND p.code IN ('auth.login','auth.me','finance.read','finance.export')) OR
 (r.code IN ('admin','accountant','finance_manager','management') AND p.code='finance.export') OR
 (r.code='admin' AND p.code='finance.consolidation.manage') ON CONFLICT DO NOTHING;
COMMIT;
