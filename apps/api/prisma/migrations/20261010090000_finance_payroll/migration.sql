BEGIN;
-- CreateTable
CREATE TABLE "payroll_config" (
    "facility_id" TEXT NOT NULL,
    "tax_name" TEXT NOT NULL,
    "tax_bands" JSONB NOT NULL,

    CONSTRAINT "payroll_config_pkey" PRIMARY KEY ("facility_id")
);

-- CreateTable
CREATE TABLE "payroll_employee" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_dari" TEXT NOT NULL DEFAULT '',
    "basic" DECIMAL(18,2) NOT NULL,
    "allowance" DECIMAL(18,2) NOT NULL,
    "overtime_rate" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AFN',
    "cost_centre_id" TEXT NOT NULL,
    "starts_on" TIMESTAMPTZ(3) NOT NULL,
    "ends_on" TIMESTAMPTZ(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "payroll_employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_run" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "date" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'calculated',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" TEXT NOT NULL,
    "reviewed_by" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMPTZ(3),
    "tax_name" TEXT NOT NULL,
    "tax_bands" JSONB NOT NULL,
    "journal_id" TEXT,

    CONSTRAINT "payroll_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_item" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "cost_centre_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "gross" DECIMAL(18,2) NOT NULL,
    "tax" DECIMAL(18,2) NOT NULL,
    "loan_deduction" DECIMAL(18,2) NOT NULL,
    "other_deduction" DECIMAL(18,2) NOT NULL,
    "net" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "payroll_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_loan" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "installment" DECIMAL(18,2) NOT NULL,
    "first_period_id" TEXT NOT NULL,
    "journal_id" TEXT NOT NULL,

    CONSTRAINT "payroll_loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_repayment" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "payroll_repayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_payment" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "journal_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reference" TEXT NOT NULL,

    CONSTRAINT "payroll_payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_employee_id_facility_id_key" ON "payroll_employee"("id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_employee_facility_id_code_key" ON "payroll_employee"("facility_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_run_journal_id_key" ON "payroll_run"("journal_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_run_id_facility_id_key" ON "payroll_run"("id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_run_facility_id_period_id_key" ON "payroll_run"("facility_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_run_journal_id_facility_id_key" ON "payroll_run"("journal_id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_item_id_facility_id_key" ON "payroll_item"("id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_item_run_id_employee_id_key" ON "payroll_item"("run_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_loan_journal_id_key" ON "payroll_loan"("journal_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_loan_id_facility_id_key" ON "payroll_loan"("id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_loan_facility_id_reference_key" ON "payroll_loan"("facility_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_loan_journal_id_facility_id_key" ON "payroll_loan"("journal_id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_repayment_loan_id_item_id_key" ON "payroll_repayment"("loan_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_payment_journal_id_key" ON "payroll_payment"("journal_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_payment_facility_id_reference_key" ON "payroll_payment"("facility_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_payment_journal_id_facility_id_key" ON "payroll_payment"("journal_id", "facility_id");

-- AddForeignKey
ALTER TABLE "payroll_config" ADD CONSTRAINT "payroll_config_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_employee" ADD CONSTRAINT "payroll_employee_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_employee" ADD CONSTRAINT "payroll_employee_cost_centre_id_facility_id_fkey" FOREIGN KEY ("cost_centre_id", "facility_id") REFERENCES "finance_cost_centre"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_period_id_facility_id_fkey" FOREIGN KEY ("period_id", "facility_id") REFERENCES "finance_period"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_journal_id_facility_id_fkey" FOREIGN KEY ("journal_id", "facility_id") REFERENCES "finance_journal"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_run_id_facility_id_fkey" FOREIGN KEY ("run_id", "facility_id") REFERENCES "payroll_run"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_employee_id_facility_id_fkey" FOREIGN KEY ("employee_id", "facility_id") REFERENCES "payroll_employee"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_cost_centre_id_facility_id_fkey" FOREIGN KEY ("cost_centre_id", "facility_id") REFERENCES "finance_cost_centre"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_loan" ADD CONSTRAINT "payroll_loan_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_loan" ADD CONSTRAINT "payroll_loan_employee_id_facility_id_fkey" FOREIGN KEY ("employee_id", "facility_id") REFERENCES "payroll_employee"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_loan" ADD CONSTRAINT "payroll_loan_first_period_id_facility_id_fkey" FOREIGN KEY ("first_period_id", "facility_id") REFERENCES "finance_period"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_loan" ADD CONSTRAINT "payroll_loan_journal_id_facility_id_fkey" FOREIGN KEY ("journal_id", "facility_id") REFERENCES "finance_journal"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_repayment" ADD CONSTRAINT "payroll_repayment_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_repayment" ADD CONSTRAINT "payroll_repayment_loan_id_facility_id_fkey" FOREIGN KEY ("loan_id", "facility_id") REFERENCES "payroll_loan"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_repayment" ADD CONSTRAINT "payroll_repayment_item_id_facility_id_fkey" FOREIGN KEY ("item_id", "facility_id") REFERENCES "payroll_item"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payment" ADD CONSTRAINT "payroll_payment_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payment" ADD CONSTRAINT "payroll_payment_item_id_facility_id_fkey" FOREIGN KEY ("item_id", "facility_id") REFERENCES "payroll_item"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payment" ADD CONSTRAINT "payroll_payment_journal_id_facility_id_fkey" FOREIGN KEY ("journal_id", "facility_id") REFERENCES "finance_journal"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Payroll integrity supplements the existing immutable double-entry ledger.
ALTER TABLE payroll_employee ADD CHECK (basic>0 AND allowance>=0 AND overtime_rate>=0 AND currency='AFN' AND (ends_on IS NULL OR ends_on>=starts_on));
ALTER TABLE payroll_item ADD CHECK (gross>=0 AND tax>=0 AND loan_deduction>=0 AND other_deduction>=0 AND net>=0 AND gross=tax+loan_deduction+other_deduction+net);
ALTER TABLE payroll_loan ADD CHECK (amount>0 AND installment>0 AND installment<=amount AND kind IN ('loan','advance'));
ALTER TABLE payroll_repayment ADD CHECK (amount>0);
ALTER TABLE payroll_payment ADD CHECK (amount>0);
ALTER TABLE payroll_run ADD CHECK (status IN ('calculated','reviewed','approved'));
ALTER TABLE payroll_run ADD CHECK (status<>'approved' OR (approved_by IS NOT NULL AND approved_by<>created_by AND approved_at IS NOT NULL AND journal_id IS NOT NULL));
ALTER TABLE payroll_run ADD FOREIGN KEY(created_by,facility_id) REFERENCES app_user(id,facility_id);
ALTER TABLE payroll_run ADD FOREIGN KEY(reviewed_by,facility_id) REFERENCES app_user(id,facility_id);
ALTER TABLE payroll_run ADD FOREIGN KEY(approved_by,facility_id) REFERENCES app_user(id,facility_id);

CREATE FUNCTION payroll_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF TG_TABLE_NAME='payroll_repayment' AND NOT EXISTS(SELECT 1 FROM payroll_item i JOIN payroll_loan l ON l.employee_id=i.employee_id AND l.facility_id=i.facility_id WHERE i.id=NEW.item_id AND l.id=NEW.loan_id) AND TG_OP<>'DELETE' THEN RAISE EXCEPTION 'Loan deduction must belong to employee'; END IF;
 ELSIF TG_TABLE_NAME IN ('payroll_loan','payroll_payment') THEN
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
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['payroll_config','payroll_employee','payroll_run','payroll_item','payroll_loan','payroll_repayment','payroll_payment'] LOOP
  EXECUTE format('CREATE TRIGGER payroll_source_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION payroll_source_guard()',tbl);
  EXECUTE format('CREATE TRIGGER finance_capture AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION finance_capture_audit()',tbl);
 END LOOP;
END $$;

CREATE FUNCTION payroll_post_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE run payroll_run; pay payroll_payment; loan payroll_loan; original finance_journal; rec record; expected numeric; actual numeric;
BEGIN
 IF NEW.source_type NOT LIKE 'payroll_%' AND NEW.reversal_of_id IS NULL THEN RETURN NEW; END IF;
 PERFORM id FROM facility WHERE id=NEW.facility_id FOR UPDATE;
 IF NEW.reversal_of_id IS NOT NULL THEN
  SELECT * INTO original FROM finance_journal WHERE id=NEW.reversal_of_id;
  IF original.source_type='payroll_accrual' THEN RAISE EXCEPTION 'Approved payroll accrual is immutable; payroll correction workflow required'; END IF;
  IF original.source_type='payroll_loan' AND EXISTS(SELECT 1 FROM payroll_repayment r JOIN payroll_loan l ON l.id=r.loan_id WHERE l.journal_id=original.id) THEN RAISE EXCEPTION 'Loan is allocated to payroll and cannot be reversed'; END IF;
 END IF;
 IF NEW.status<>'posted' THEN RETURN NEW; END IF;
 IF NEW.source_type='payroll_accrual' THEN
  SELECT * INTO run FROM payroll_run WHERE journal_id=NEW.id AND facility_id=NEW.facility_id;
  IF run.id IS NULL OR run.id<>NEW.source_id OR run.status<>'approved' OR run.date<>NEW.date OR run.period_id<>NEW.period_id THEN RAISE EXCEPTION 'Accrual requires matching approved payroll'; END IF;
  FOR rec IN SELECT * FROM (VALUES ('salary_expense'),('salary_payable'),('payroll_tax'),('payroll_other'),('staff_loans')) v(key) LOOP
   SELECT COALESCE(sum(CASE rec.key WHEN 'salary_expense' THEN gross WHEN 'salary_payable' THEN -net WHEN 'payroll_tax' THEN -tax WHEN 'payroll_other' THEN -other_deduction ELSE -loan_deduction END),0) INTO expected FROM payroll_item WHERE run_id=run.id;
   SELECT COALESCE(sum(l.debit-l.credit),0) INTO actual FROM finance_journal_line l JOIN finance_account a ON a.id=l.account_id WHERE l.journal_id=NEW.id AND a.system_key=rec.key;
   IF actual<>expected THEN RAISE EXCEPTION 'Payroll journal does not match approved amounts'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM finance_journal_line l JOIN finance_account a ON a.id=l.account_id WHERE l.journal_id=NEW.id AND COALESCE(a.system_key,'') NOT IN ('salary_expense','salary_payable','payroll_tax','payroll_other','staff_loans')) THEN RAISE EXCEPTION 'Unexpected payroll account'; END IF;
  IF EXISTS(SELECT cost_centre_id,sum(gross) FROM payroll_item WHERE run_id=run.id GROUP BY cost_centre_id HAVING sum(gross)>0 EXCEPT SELECT l.cost_centre_id,sum(l.debit-l.credit) FROM finance_journal_line l JOIN finance_account a ON a.id=l.account_id WHERE l.journal_id=NEW.id AND a.system_key='salary_expense' GROUP BY l.cost_centre_id) THEN RAISE EXCEPTION 'Payroll department allocation mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM payroll_item i WHERE i.run_id=run.id AND i.loan_deduction<>(SELECT COALESCE(sum(r.amount),0) FROM payroll_repayment r WHERE r.item_id=i.id)) THEN RAISE EXCEPTION 'Payroll loan deductions mismatch'; END IF;
  FOR loan IN SELECT l.* FROM payroll_loan l JOIN payroll_repayment r ON r.loan_id=l.id JOIN payroll_item i ON i.id=r.item_id WHERE i.run_id=run.id LOOP
   IF NOT EXISTS(SELECT 1 FROM finance_journal j WHERE j.id=loan.journal_id AND j.status='posted' AND j.date<=NEW.date AND NOT EXISTS(SELECT 1 FROM finance_journal rev WHERE rev.reversal_of_id=j.id)) THEN RAISE EXCEPTION 'Deduction requires posted loan'; END IF;
   IF loan.amount<(SELECT COALESCE(sum(r.amount),0) FROM payroll_repayment r JOIN payroll_item i ON i.id=r.item_id JOIN payroll_run pr ON pr.id=i.run_id WHERE r.loan_id=loan.id AND pr.status='approved') THEN RAISE EXCEPTION 'Loan deductions exceed principal'; END IF;
  END LOOP;
 ELSIF NEW.source_type IN ('payroll_payment','payroll_loan') THEN
  IF NEW.source_type='payroll_payment' THEN
   SELECT * INTO pay FROM payroll_payment WHERE journal_id=NEW.id AND facility_id=NEW.facility_id;
   SELECT pr.* INTO run FROM payroll_run pr JOIN payroll_item i ON i.run_id=pr.id WHERE i.id=pay.item_id;
   IF pay.id IS NULL OR pay.id<>NEW.source_id OR run.status<>'approved' OR NEW.date<run.date OR NOT EXISTS(SELECT 1 FROM finance_journal WHERE id=run.journal_id AND status='posted') THEN RAISE EXCEPTION 'Salary payment requires approved posted accrual'; END IF;
   expected:=pay.amount;
   SELECT COALESCE(sum(l.debit-l.credit),0) INTO actual FROM finance_journal_line l JOIN finance_account a ON a.id=l.account_id WHERE l.journal_id=NEW.id AND a.system_key='salary_payable';
  ELSE
   SELECT * INTO loan FROM payroll_loan WHERE journal_id=NEW.id AND facility_id=NEW.facility_id;
   IF loan.id IS NULL OR loan.id<>NEW.source_id THEN RAISE EXCEPTION 'Loan issue source missing'; END IF;
   expected:=loan.amount;
   SELECT COALESCE(sum(l.debit-l.credit),0) INTO actual FROM finance_journal_line l JOIN finance_account a ON a.id=l.account_id WHERE l.journal_id=NEW.id AND a.system_key='staff_loans';
  END IF;
  IF actual<>expected OR expected<>(SELECT COALESCE(sum(l.credit-l.debit),0) FROM finance_journal_line l JOIN finance_account a ON a.id=l.account_id WHERE l.journal_id=NEW.id AND a.is_cash) OR (SELECT count(*) FROM finance_journal_line WHERE journal_id=NEW.id)<>2 THEN RAISE EXCEPTION 'Payroll payment journal mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payroll_post_guard BEFORE INSERT OR UPDATE ON finance_journal FOR EACH ROW EXECUTE FUNCTION payroll_post_guard();

INSERT INTO role(id,code,name,description) VALUES(gen_random_uuid()::text,'payroll_officer','Payroll officer','Prepare payroll; independent approval required') ON CONFLICT(code) DO NOTHING;
INSERT INTO permission(id,code,resource,action) SELECT gen_random_uuid()::text,'payroll.'||x,'payroll',x FROM unnest(ARRAY['read','write','configure','approve','pay']) x ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permission(role_id,permission_id)
 SELECT r.id,p.id FROM role r CROSS JOIN permission p WHERE
 (p.code='payroll.read' AND r.code IN ('admin','accountant','finance_manager','payroll_officer','management')) OR
 (p.code='payroll.write' AND r.code IN ('admin','accountant','finance_manager','payroll_officer')) OR
 (p.code IN ('payroll.configure','payroll.approve') AND r.code IN ('admin','finance_manager')) OR
 (p.code='payroll.pay' AND r.code IN ('admin','accountant','finance_manager')) OR
 (p.code IN ('auth.login','auth.me','finance.read') AND r.code='payroll_officer')
 ON CONFLICT DO NOTHING;

COMMIT;

