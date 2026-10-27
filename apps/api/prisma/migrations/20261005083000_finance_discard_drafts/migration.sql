-- Discarding unposted sources is an explicit, audited transaction. Posted sources stay immutable.
CREATE OR REPLACE FUNCTION finance_immutable_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb; source_journal text;
BEGIN
 row_data:=to_jsonb(OLD);
 source_journal:=row_data->>'journal_id';
 IF TG_OP='DELETE' AND TG_TABLE_NAME IN ('finance_bill','finance_settlement')
   AND current_setting('redmars.finance_discard',true)=source_journal
   AND EXISTS(SELECT 1 FROM finance_journal WHERE id=source_journal AND status='draft') THEN RETURN OLD; END IF;
 IF TG_OP='DELETE' AND TG_TABLE_NAME='finance_procurement_receipt'
   AND current_setting('redmars.finance_discard',true)=row_data->>'id'
   AND NOT EXISTS(SELECT 1 FROM finance_bill WHERE receipt_id=row_data->>'id') THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Finalized finance source records are immutable; correct their journal with a reversal';
END $$;
