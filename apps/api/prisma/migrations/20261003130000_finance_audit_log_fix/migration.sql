CREATE OR REPLACE FUNCTION finance_log_rejected_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE jid text; is_posted boolean;
BEGIN
 jid:=CASE WHEN TG_TABLE_NAME='finance_journal' THEN to_jsonb(OLD)->>'id' ELSE to_jsonb(OLD)->>'journal_id' END;
 SELECT status='posted' INTO is_posted FROM finance_journal WHERE id=jid;
 IF is_posted THEN RAISE LOG 'Blocked posted finance mutation: journal %, action %, database actor %, application actor %',jid,TG_OP,session_user,current_setting('redmars.finance_actor',true); END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
