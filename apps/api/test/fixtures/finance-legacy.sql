-- Synthetic upgrade fixture. Apply after finance_controls, before finance_foundations.
INSERT INTO facility(id,code,name,updated_at) VALUES('upgrade-facility','upgrade-test','Synthetic upgrade',now());
INSERT INTO app_user(id,facility_id,username,password_hash,full_name,updated_at)
VALUES('upgrade-user','upgrade-facility','upgrade-test','not-a-login','Synthetic actor',now());
INSERT INTO finance_settings(facility_id,cutover_date) VALUES('upgrade-facility','2025-03-21');
-- Match the original setup's complete system chart. Later revenue migrations
-- legitimately require the revenue/control accounts that setup always created.
INSERT INTO finance_account(id,facility_id,code,name,type,system_key,is_control,is_cash) VALUES
 ('upgrade-cash','upgrade-facility','1000','Cash','asset','cash',false,true),
 ('upgrade-equity','upgrade-facility','3000','Equity','equity','opening',false,false),
 ('upgrade-bank','upgrade-facility','1010','Bank','asset','bank',false,true),
 ('upgrade-card','upgrade-facility','1020','Card','asset','card',false,true),
 ('upgrade-mobile','upgrade-facility','1030','Mobile','asset','mobile_money',false,true),
 ('upgrade-ar','upgrade-facility','1100','Patient receivables','asset','receivable',true,false),
 ('upgrade-panel','upgrade-facility','1110','Panel receivables','asset','panel',true,false),
 ('upgrade-ap','upgrade-facility','2000','Payables','liability','payable',true,false),
 ('upgrade-retained','upgrade-facility','3100','Retained earnings','equity','retained',false,false),
 ('upgrade-revenue','upgrade-facility','4000','Revenue','revenue','revenue',true,false),
 ('upgrade-expense','upgrade-facility','5000','Expenses','expense','expense',false,false),
 ('upgrade-waiver','upgrade-facility','5100','Waivers','expense','waiver',true,false);
INSERT INTO finance_period(id,facility_id,name,starts_on,ends_on) VALUES('upgrade-period','upgrade-facility','September legacy','2025-09-01','2025-09-30');
INSERT INTO finance_journal(id,facility_id,period_id,date,memo,created_by,created_at)
VALUES('upgrade-journal','upgrade-facility','upgrade-period','2025-09-27','Preserve me','upgrade-user','2025-09-27 08:00:00.123');
INSERT INTO finance_journal_line(id,facility_id,journal_id,account_id,debit,credit) VALUES
 ('upgrade-debit','upgrade-facility','upgrade-journal','upgrade-cash',123.45,0),
 ('upgrade-credit','upgrade-facility','upgrade-journal','upgrade-equity',0,123.45);
UPDATE finance_journal SET status='posted',number='JRN-2025-000001',posted_by='upgrade-user',posted_at='2025-09-27 08:01:00.456' WHERE id='upgrade-journal';
UPDATE finance_period SET closed_at='2025-10-01 12:00:00',closed_by='upgrade-user' WHERE id='upgrade-period';
INSERT INTO finance_statement(id,facility_id,account_id,reference,starts_on,ends_on,opening_balance,closing_balance)
VALUES('upgrade-statement','upgrade-facility','upgrade-cash','September bank','2025-09-01','2025-09-30',0,123.45);
INSERT INTO finance_statement_line(id,facility_id,statement_id,date,description,amount,journal_line_id)
VALUES('upgrade-movement','upgrade-facility','upgrade-statement','2025-09-27','Preserve match',123.45,'upgrade-debit');
UPDATE finance_statement SET reconciled_at='2025-10-01 12:01:00',reconciled_by='upgrade-user' WHERE id='upgrade-statement';
