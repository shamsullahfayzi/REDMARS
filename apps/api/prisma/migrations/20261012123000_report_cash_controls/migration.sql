CREATE OR REPLACE FUNCTION finance_classification_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j finance_journal; cash numeric; allocated numeric;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Change classifications through the audited version workflow'; END IF;
 SELECT * INTO j FROM finance_journal WHERE id=NEW.journal_id AND facility_id=NEW.facility_id;
 IF j.status<>'posted' OR EXISTS(SELECT 1 FROM finance_period WHERE id=j.period_id AND closed_at IS NOT NULL) THEN RAISE EXCEPTION 'Classify posted cash journals in open periods only'; END IF;
 IF TG_OP='UPDATE' AND (NEW.journal_id<>OLD.journal_id OR NEW.facility_id<>OLD.facility_id OR NEW.version<>OLD.version+1) THEN RAISE EXCEPTION 'Invalid classification version'; END IF;
 SELECT COALESCE(sum(l.base_debit-l.base_credit),0) INTO cash FROM finance_journal_line l JOIN finance_account a ON a.id=l.account_id WHERE l.journal_id=j.id AND a.is_cash;
 SELECT sum((r->>'amount')::numeric) INTO allocated FROM jsonb_array_elements(NEW.rows) r;
 IF NOT EXISTS(SELECT 1 FROM finance_journal_line l JOIN finance_account a ON a.id=l.account_id WHERE l.journal_id=j.id AND a.is_cash) OR NOT EXISTS(SELECT 1 FROM finance_journal_line l JOIN finance_account a ON a.id=l.account_id WHERE l.journal_id=j.id AND NOT a.is_cash) OR allocated IS DISTINCT FROM cash OR jsonb_array_length(NEW.rows)=0 THEN RAISE EXCEPTION 'Classifications must reconcile to external cash'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.rows) r WHERE r->>'category' NOT IN ('operating','investing','financing','opening','unclassified') OR ((r->>'accountId') IS NOT NULL AND (r->>'category'<>'operating' OR NOT EXISTS(SELECT 1 FROM finance_account WHERE id=r->>'accountId' AND facility_id=NEW.facility_id AND type IN ('revenue','expense'))))) THEN RAISE EXCEPTION 'Invalid classification account or category'; END IF;
 RETURN NEW;
END $$;