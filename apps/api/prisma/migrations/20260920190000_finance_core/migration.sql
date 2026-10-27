-- CreateEnum
CREATE TYPE "FinanceAccountType" AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');

-- CreateEnum
CREATE TYPE "FinanceJournalStatus" AS ENUM ('draft', 'posted');

-- CreateTable
CREATE TABLE "finance_settings" (
    "facility_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AFN',
    "cutover_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_settings_pkey" PRIMARY KEY ("facility_id")
);

-- CreateTable
CREATE TABLE "finance_account" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinanceAccountType" NOT NULL,
    "system_key" TEXT,
    "is_control" BOOLEAN NOT NULL DEFAULT false,
    "is_cash" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_period" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "closed_at" TIMESTAMP(3),
    "closed_by" TEXT,

    CONSTRAINT "finance_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_journal" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "number" TEXT,
    "date" DATE NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AFN',
    "memo" TEXT NOT NULL,
    "status" "FinanceJournalStatus" NOT NULL DEFAULT 'draft',
    "source_type" TEXT NOT NULL DEFAULT 'manual',
    "source_id" TEXT,
    "reversal_of_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posted_by" TEXT,
    "posted_at" TIMESTAMP(3),

    CONSTRAINT "finance_journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_journal_line" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "journal_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "finance_journal_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_supplier" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reference" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_bill" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "due_on" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "journal_id" TEXT NOT NULL,

    CONSTRAINT "finance_bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_settlement" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "journal_id" TEXT NOT NULL,

    CONSTRAINT "finance_settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_statement" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "opening_balance" DECIMAL(18,2) NOT NULL,
    "closing_balance" DECIMAL(18,2) NOT NULL,
    "reconciled_at" TIMESTAMP(3),
    "reconciled_by" TEXT,

    CONSTRAINT "finance_statement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_statement_line" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "statement_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "journal_line_id" TEXT,

    CONSTRAINT "finance_statement_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_account_facility_id_code_key" ON "finance_account"("facility_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "finance_account_facility_id_system_key_key" ON "finance_account"("facility_id", "system_key");

-- CreateIndex
CREATE UNIQUE INDEX "finance_account_id_facility_id_key" ON "finance_account"("id", "facility_id");

-- CreateIndex
CREATE INDEX "finance_period_facility_id_starts_on_ends_on_idx" ON "finance_period"("facility_id", "starts_on", "ends_on");

-- CreateIndex
CREATE UNIQUE INDEX "finance_period_facility_id_name_key" ON "finance_period"("facility_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "finance_period_id_facility_id_key" ON "finance_period"("id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_journal_reversal_of_id_key" ON "finance_journal"("reversal_of_id");

-- CreateIndex
CREATE INDEX "finance_journal_facility_id_date_status_idx" ON "finance_journal"("facility_id", "date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "finance_journal_facility_id_number_key" ON "finance_journal"("facility_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "finance_journal_facility_id_source_type_source_id_key" ON "finance_journal"("facility_id", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_journal_id_facility_id_key" ON "finance_journal"("id", "facility_id");

-- CreateIndex
CREATE INDEX "finance_journal_line_facility_id_account_id_idx" ON "finance_journal_line"("facility_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_journal_line_id_facility_id_key" ON "finance_journal_line"("id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_supplier_id_facility_id_key" ON "finance_supplier"("id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_supplier_facility_id_name_key" ON "finance_supplier"("facility_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "finance_bill_journal_id_key" ON "finance_bill"("journal_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_bill_journal_id_facility_id_key" ON "finance_bill"("journal_id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_bill_facility_id_supplier_id_reference_key" ON "finance_bill"("facility_id", "supplier_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "finance_bill_id_facility_id_key" ON "finance_bill"("id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_settlement_journal_id_key" ON "finance_settlement"("journal_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_settlement_journal_id_facility_id_key" ON "finance_settlement"("journal_id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_statement_facility_id_account_id_reference_key" ON "finance_statement"("facility_id", "account_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "finance_statement_id_facility_id_key" ON "finance_statement"("id", "facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_statement_line_journal_line_id_key" ON "finance_statement_line"("journal_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_statement_line_journal_line_id_facility_id_key" ON "finance_statement_line"("journal_line_id", "facility_id");

-- AddForeignKey
ALTER TABLE "finance_settings" ADD CONSTRAINT "finance_settings_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_account" ADD CONSTRAINT "finance_account_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_period" ADD CONSTRAINT "finance_period_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_journal" ADD CONSTRAINT "finance_journal_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_journal" ADD CONSTRAINT "finance_journal_period_id_facility_id_fkey" FOREIGN KEY ("period_id", "facility_id") REFERENCES "finance_period"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_journal" ADD CONSTRAINT "finance_journal_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "finance_journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_journal_line" ADD CONSTRAINT "finance_journal_line_journal_id_facility_id_fkey" FOREIGN KEY ("journal_id", "facility_id") REFERENCES "finance_journal"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_journal_line" ADD CONSTRAINT "finance_journal_line_account_id_facility_id_fkey" FOREIGN KEY ("account_id", "facility_id") REFERENCES "finance_account"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_supplier" ADD CONSTRAINT "finance_supplier_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_bill" ADD CONSTRAINT "finance_bill_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_bill" ADD CONSTRAINT "finance_bill_supplier_id_facility_id_fkey" FOREIGN KEY ("supplier_id", "facility_id") REFERENCES "finance_supplier"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_bill" ADD CONSTRAINT "finance_bill_journal_id_facility_id_fkey" FOREIGN KEY ("journal_id", "facility_id") REFERENCES "finance_journal"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_settlement" ADD CONSTRAINT "finance_settlement_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_settlement" ADD CONSTRAINT "finance_settlement_bill_id_facility_id_fkey" FOREIGN KEY ("bill_id", "facility_id") REFERENCES "finance_bill"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_settlement" ADD CONSTRAINT "finance_settlement_journal_id_facility_id_fkey" FOREIGN KEY ("journal_id", "facility_id") REFERENCES "finance_journal"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_statement" ADD CONSTRAINT "finance_statement_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_statement" ADD CONSTRAINT "finance_statement_account_id_facility_id_fkey" FOREIGN KEY ("account_id", "facility_id") REFERENCES "finance_account"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_statement_line" ADD CONSTRAINT "finance_statement_line_statement_id_facility_id_fkey" FOREIGN KEY ("statement_id", "facility_id") REFERENCES "finance_statement"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_statement_line" ADD CONSTRAINT "finance_statement_line_journal_line_id_facility_id_fkey" FOREIGN KEY ("journal_line_id", "facility_id") REFERENCES "finance_journal_line"("id", "facility_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Accounting invariants survive API bugs and direct SQL writes.
ALTER TABLE finance_settings ADD CONSTRAINT finance_currency CHECK (currency = 'AFN');
ALTER TABLE finance_period ADD CONSTRAINT finance_period_dates CHECK (starts_on <= ends_on);
ALTER TABLE finance_journal ADD CONSTRAINT finance_journal_currency CHECK (currency = 'AFN');
ALTER TABLE finance_journal_line ADD CONSTRAINT finance_line_one_side CHECK (
  (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
);
ALTER TABLE finance_bill ADD CONSTRAINT finance_bill_positive CHECK (amount > 0);
ALTER TABLE finance_settlement ADD CONSTRAINT finance_settlement_positive CHECK (amount > 0);
ALTER TABLE finance_statement ADD CONSTRAINT finance_statement_dates CHECK (starts_on <= ends_on);
ALTER TABLE finance_statement_line ADD CONSTRAINT finance_statement_nonzero CHECK (amount <> 0);

CREATE FUNCTION finance_guard_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p finance_period; n integer; d numeric; c numeric;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.status = 'posted' THEN
    RAISE EXCEPTION 'Posted journals are immutable; create a reversal';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.status = 'posted' THEN
    SELECT * INTO p FROM finance_period WHERE id = NEW.period_id FOR UPDATE;
    IF p.closed_at IS NOT NULL OR NEW.date < p.starts_on OR NEW.date > p.ends_on OR p.facility_id <> NEW.facility_id THEN
      RAISE EXCEPTION 'Posting requires the correct open accounting period';
    END IF;
    SELECT COUNT(*), COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO n,d,c FROM finance_journal_line WHERE journal_id = NEW.id;
    IF n < 2 OR d <> c OR d <= 0 OR NEW.number IS NULL OR NEW.posted_at IS NULL OR NEW.posted_by IS NULL THEN
      RAISE EXCEPTION 'A posted journal must have balanced lines and posting metadata';
    END IF;
    IF EXISTS (SELECT 1 FROM finance_journal_line l JOIN finance_account a ON a.id=l.account_id WHERE l.journal_id=NEW.id AND NOT a.is_active) THEN
      RAISE EXCEPTION 'Cannot post to an inactive account';
    END IF;
    IF EXISTS (SELECT 1 FROM finance_journal_line l JOIN finance_statement s ON s.account_id=l.account_id WHERE l.journal_id=NEW.id AND s.reconciled_at IS NOT NULL AND s.ends_on >= NEW.date) THEN
      RAISE EXCEPTION 'Cannot backdate a cash transaction into a finalized reconciliation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finance_journal_guard BEFORE INSERT OR UPDATE OR DELETE ON finance_journal FOR EACH ROW EXECUTE FUNCTION finance_guard_journal();

CREATE FUNCTION finance_guard_line() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND EXISTS (SELECT 1 FROM finance_journal WHERE id=OLD.journal_id AND status='posted') THEN
    RAISE EXCEPTION 'Posted journal lines are immutable';
  END IF;
  IF TG_OP <> 'DELETE' AND EXISTS (SELECT 1 FROM finance_journal WHERE id=NEW.journal_id AND status='posted') THEN
    RAISE EXCEPTION 'Posted journal lines are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finance_line_guard BEFORE INSERT OR UPDATE OR DELETE ON finance_journal_line FOR EACH ROW EXECUTE FUNCTION finance_guard_line();

CREATE FUNCTION finance_guard_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Closed accounting periods are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  PERFORM id FROM facility WHERE id=NEW.facility_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM finance_period WHERE facility_id=NEW.facility_id AND id<>NEW.id AND starts_on<=NEW.ends_on AND ends_on>=NEW.starts_on) THEN
    RAISE EXCEPTION 'Accounting periods must not overlap';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finance_period_guard BEFORE INSERT OR UPDATE OR DELETE ON finance_period FOR EACH ROW EXECUTE FUNCTION finance_guard_period();

CREATE FUNCTION finance_guard_statement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.reconciled_at IS NOT NULL THEN RAISE EXCEPTION 'Finalized reconciliations are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finance_statement_guard BEFORE UPDATE OR DELETE ON finance_statement FOR EACH ROW EXECUTE FUNCTION finance_guard_statement();
CREATE FUNCTION finance_guard_statement_line() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND EXISTS (SELECT 1 FROM finance_statement WHERE id=OLD.statement_id AND reconciled_at IS NOT NULL) THEN RAISE EXCEPTION 'Finalized reconciliation lines are immutable'; END IF;
  IF TG_OP <> 'DELETE' AND EXISTS (SELECT 1 FROM finance_statement WHERE id=NEW.statement_id AND reconciled_at IS NOT NULL) THEN RAISE EXCEPTION 'Finalized reconciliation lines are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finance_statement_line_guard BEFORE INSERT OR UPDATE OR DELETE ON finance_statement_line FOR EACH ROW EXECUTE FUNCTION finance_guard_statement_line();
