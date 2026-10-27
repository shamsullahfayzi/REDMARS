import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FinanceLedgerService, FinanceActor, date } from '../src/modules/finance/finance-ledger.service';
import { FinanceRevenueService } from '../src/modules/finance/finance-revenue.service';
import { FinanceOperationsService } from '../src/modules/finance/finance-operations.service';
import { requestContext } from '../src/audit/request-context';
import { financeWorkspaceSchema, financeRevenueWorkspaceSchema, financeArSchema, financeSourceSchema } from '@redmars/shared';

describe('Finance revenue and posting review',()=>{
  jest.setTimeout(60000);
  const raw=new PrismaClient();
  let app:INestApplication,prisma:PrismaService,ledger:FinanceLedgerService,revenue:FinanceRevenueService,operations:FinanceOperationsService;
  let actor:FinanceActor,reviewer:FinanceActor,outsider:FinanceActor,patientId:string,cash:string,bank:string,equity:string,expense:string;
  const on='2026-09-25',key=()=>({idempotencyKey:randomUUID()});
  const run=<T>(fn:()=>Promise<T>)=>requestContext.run(actor,fn);
  const post=async(id:string)=>requestContext.run(reviewer,async()=>{
    const j=await ledger.getJournal(actor.facilityId,id);
    return ledger.postJournal(reviewer,id,{expectedVersion:j.version,...key()});
  });
  const postDrafts=async()=>{
    const drafts=await raw.financeJournal.findMany({where:{facilityId:actor.facilityId,status:'draft'},orderBy:{createdAt:'asc'}});
    for(const j of drafts) await post(j.id);
  };
  const invoice=async(total='100',refType='service',panelId?:string)=>run(()=>prisma.db.invoice.create({data:{facilityId:actor.facilityId,patientId,invoiceNo:randomUUID(),createdAt:date(on),status:'issued',subtotal:total,total,panelId,items:{create:[{refType,description:'Test charge',unitPrice:total,total,quantity:1}]}}}));
  const fixedEvents=async()=>raw.integrationEvent.updateMany({where:{facilityId:actor.facilityId,receipts:{none:{consumer:'finance.ledger.v1'}}},data:{occurredAt:new Date(on+'T12:00:00Z')}});
  beforeAll(async()=>{
    app=(await Test.createTestingModule({imports:[AppModule]}).compile()).createNestApplication();await app.init();
    prisma=app.get(PrismaService);ledger=app.get(FinanceLedgerService);revenue=app.get(FinanceRevenueService);operations=app.get(FinanceOperationsService);
    const facility=await raw.facility.create({data:{code:randomUUID(),name:'Revenue isolated test'}});
    const user=async(fid:string)=>raw.appUser.create({data:{facilityId:fid,username:randomUUID(),fullName:'Test accountant',passwordHash:'no-login'}});
    actor={facilityId:facility.id,userId:(await user(facility.id)).id};reviewer={...actor,userId:(await user(facility.id)).id};
    const foreign=await raw.facility.create({data:{code:randomUUID(),name:'Foreign test'}});outsider={facilityId:foreign.id,userId:(await user(foreign.id)).id};
    await run(()=>ledger.setup(actor,{cutoverDate:'2026-09-01',...key()}));
    patientId=(await raw.patient.create({data:{facilityId:facility.id,mrn:randomUUID(),firstName:'Revenue fixture',gender:'unknown'}})).id;
    const accounts=await raw.financeAccount.findMany({where:{facilityId:facility.id}});
    const system=(s:string)=>accounts.find(a=>a.systemKey===s)!.id;
    cash=system('cash');bank=system('bank');equity=system('opening');expense=system('expense');
  });
  afterAll(async()=>{await app?.close();await raw.$disconnect()});

  it('exposes the extended chart and enforces group, type, cycle and facility boundaries',async()=>{
    expect(financeWorkspaceSchema.safeParse(await operations.workspace(actor.facilityId)).success).toBe(true);
    expect(financeRevenueWorkspaceSchema.safeParse(await revenue.workspace(actor.facilityId)).success).toBe(true);
    const root=await raw.financeAccount.findFirstOrThrow({where:{facilityId:actor.facilityId,systemKey:'_group_asset'}});
    expect(root.normalBalance).toBe('debit');
    await expect(raw.financeAccount.update({where:{id:root.id},data:{parentId:root.id}})).rejects.toThrow();
    await expect(run(()=>ledger.createAccount(actor,{code:'BAD',name:'Wrong parent',type:'liability',parentId:root.id,isPosting:true,isCash:false,...key()}))).rejects.toThrow();
    const groupDraft={date:on,memo:'Invalid group',...key(),lines:[{accountId:root.id,debit:'1',credit:'0',description:''},{accountId:equity,debit:'0',credit:'1',description:''}]};
    await expect(run(()=>ledger.createJournal(actor,groupDraft))).rejects.toThrow('active accounts');
    await expect(revenue.source(outsider.facilityId,randomUUID())).rejects.toThrow('not found');
  });

  it('keeps drafts editable, requires another reviewer and preserves immutable audit history',async()=>{
    const draft=await run(()=>ledger.createJournal(actor,{date:on,memo:'Opening cash',...key(),lines:[{accountId:cash,debit:'1000',credit:'0',description:''},{accountId:equity,debit:'0',credit:'1000',description:''}]}));
    expect(draft.lines[0].exchangeRate).toBe('1.0000000000');
    await expect(run(()=>ledger.postJournal(actor,draft.id,{expectedVersion:1,...key()}))).rejects.toThrow('different accountant');
    const posted=await post(draft.id);expect(posted.status).toBe('posted');
    await expect(run(()=>ledger.deleteDraft(actor,draft.id,{expectedVersion:posted.version,...key()}))).rejects.toThrow();
    const audit=await ledger.audit(actor.facilityId,draft.id,1);expect(audit.rows.some(a=>a.action==='rejected')).toBe(true);
    await expect(raw.financeAudit.delete({where:{id:audit.rows[0].id}})).rejects.toThrow('append-only');
    await expect(raw.financeJournalLine.update({where:{id:posted.lines[0].id},data:{debit:'2'}})).rejects.toThrow();
    const reversal=await run(()=>ledger.reverse(actor,draft.id,{date:on,reason:'Test reversal',...key()}));
    expect(reversal.status).toBe('draft');
    expect((await ledger.report(actor.facilityId,on,on)).assets).toBe('1000.00');
    await post(reversal.id);expect((await ledger.report(actor.facilityId,on,on)).assets).toBe('0.00');
  });

  it('maps mixed clinical lines, discounts and payments into idempotent drafts with exact AR',async()=>{
    const bill=await run(()=>prisma.db.invoice.create({data:{facilityId:actor.facilityId,patientId,invoiceNo:randomUUID(),createdAt:date(on),status:'issued',subtotal:'150',discount:'10',total:'140',items:{create:[{refType:'service',description:'Consultation',unitPrice:'100',total:'100'},{refType:'lab_order_item',description:'Laboratory',unitPrice:'50',total:'50'}]}}}));
    await run(()=>prisma.db.payment.create({data:{invoiceId:bill.id,amount:'40',method:'cash',receivedBy:actor.userId,receivedAt:new Date(on+'T10:00:00Z')}}));
    await fixedEvents();const sync=await run(()=>revenue.sync(actor));expect(sync.failures).toEqual([]);expect(sync.drafted).toBe(2);
    expect((await revenue.sync(actor)).drafted).toBe(0);
    expect((await revenue.ar(actor.facilityId,on,'patient')).total).toBe('0.00');
    const entry=await raw.financeJournal.findFirstOrThrow({where:{invoiceId:bill.id,paymentId:null},include:{lines:{include:{account:true}}}});
    expect(entry.lines.find(l=>l.account.code==='4010')?.credit.toFixed(2)).toBe('100.00');
    expect(entry.lines.find(l=>l.account.code==='4020')?.credit.toFixed(2)).toBe('50.00');
    expect(entry.lines.find(l=>l.account.systemKey==='discount')?.debit.toFixed(2)).toBe('10.00');
    await postDrafts();const ar=await revenue.ar(actor.facilityId,on,'patient');expect(ar.total).toBe('100.00');expect(ar.difference).toBe('0.00');expect(financeArSchema.safeParse(ar).success).toBe(true);
    const source=await revenue.source(actor.facilityId,entry.id);expect(source.invoice?.invoiceNo).toBe(bill.invoiceNo);expect(financeSourceSchema.safeParse(source).success).toBe(true);
  });

  it('uses saved source snapshots and books charge reductions to contra revenue',async()=>{
    const bill=await invoice('80','prescription_item');
    await run(()=>prisma.db.invoice.update({where:{id:bill.id},data:{subtotal:'60',total:'60',items:{updateMany:{where:{invoiceId:bill.id},data:{unitPrice:'60',total:'60'}}}}}));
    await fixedEvents();const sync=await revenue.sync(actor);expect(sync.failures).toEqual([]);expect(sync.drafted).toBe(2);
    const entries=await raw.financeJournal.findMany({where:{invoiceId:bill.id},include:{lines:{include:{account:true}}},orderBy:{createdAt:'asc'}});
    expect(entries[0].lines.find(l=>l.account.code==='4030')?.credit.toFixed(2)).toBe('80.00');
    expect(entries[1].lines.find(l=>l.account.systemKey==='refund')?.debit.toFixed(2)).toBe('20.00');
    await postDrafts();expect((await revenue.ar(actor.facilityId,on,'patient')).rows.find(r=>r.invoiceId===bill.id)?.balance).toBe('60.00');
  });

  it('reverses cash refunds through AR without reducing revenue twice',async()=>{
    const bill=await invoice('30');
    await run(()=>prisma.db.payment.create({data:{invoiceId:bill.id,amount:'30',method:'cash',receivedBy:actor.userId}}));
    await run(()=>prisma.db.payment.create({data:{invoiceId:bill.id,amount:'-30',method:'cash',receivedBy:actor.userId}}));
    await fixedEvents();expect((await revenue.sync(actor)).failures).toEqual([]);await postDrafts();
    const ar=await revenue.ar(actor.facilityId,on,'patient');expect(ar.rows.find(r=>r.invoiceId===bill.id)?.balance).toBe('30.00');
    const journal=await raw.financeJournal.findFirstOrThrow({where:{invoiceId:bill.id,paymentId:{not:null}},include:{lines:true}});expect(journal.lines).toHaveLength(2);
  });

  it('transfers panel debts, reserves remittances and produces complete panel statements',async()=>{
    const panel=await run(()=>revenue.panel(actor,{code:'NGO',name:'Test employer',contactPerson:'',phone:'',...key()}));
    const bill=await invoice('200','service',panel.id);
    await run(()=>prisma.db.payment.create({data:{invoiceId:bill.id,amount:'200',method:'panel',receivedBy:actor.userId}}));
    await fixedEvents();expect((await revenue.sync(actor)).failures).toEqual([]);await postDrafts();
    expect((await revenue.ar(actor.facilityId,on,'panel',panel.id)).total).toBe('200.00');
    const input={invoiceId:bill.id,panelId:panel.id,cashAccountId:bank,amount:'150',date:on,reference:'REM-1',...key()};
    const receipt=await run(()=>revenue.panelReceipt(actor,input));
    await expect(run(()=>revenue.panelReceipt(actor,{...input,amount:'60',reference:'REM-2',...key()}))).rejects.toThrow('reserved');
    expect((await revenue.ar(actor.facilityId,on,'panel',panel.id)).total).toBe('200.00');
    await post(receipt.journalId);expect((await revenue.ar(actor.facilityId,on,'panel',panel.id)).total).toBe('50.00');
    const statement=await revenue.panelStatement(actor.facilityId,panel.id,'2026-09-01',on);expect(statement.closing).toBe('50.00');expect(statement.lines).toHaveLength(2);
    await expect(revenue.panelStatement(outsider.facilityId,panel.id,on,on)).rejects.toThrow('not found');
  });

  it('ages unpaid balances across 30, 60 and 90 Kabul days and honors as-of cutoffs',async()=>{
    expect((await revenue.ar(actor.facilityId,'2026-09-24','patient')).total).toBe('0.00');
    const age=await revenue.ar(actor.facilityId,'2026-11-25','patient');
    expect(age.rows.every(r=>r.days===61 && r.days61to90===r.balance)).toBe(true);
    expect((await revenue.ar(actor.facilityId,'2026-12-25','patient')).rows.every(r=>r.over90===r.balance)).toBe(true);
  });

  it('freezes till counts, prevents overlapping shifts, approves independently and reserves deposits',async()=>{
    const input={userId:actor.userId,origin:'lab' as const,label:'Morning',startsAt:on+'T00:00:00.000Z',endsAt:on+'T18:00:00.000Z',opening:'10',counted:'55',note:'Five AFN over',...key()};
    const preview=await revenue.tillPreview(actor.facilityId,input);expect(preview.expected).toBe('50.00');expect(preview.difference).toBe('5.00');
    const close=await run(()=>revenue.closeTill(actor,input));
    await expect(run(()=>revenue.closeTill(actor,{...input,...key()}))).rejects.toThrow();
    await expect(run(()=>revenue.approveTill(actor,close.id,key()))).rejects.toThrow('different');
    await requestContext.run(reviewer,()=>revenue.approveTill(reviewer,close.id,key()));
    await expect(raw.payment.create({data:{invoiceId:(await raw.invoice.findFirstOrThrow({where:{facilityId:actor.facilityId,items:{some:{refType:'lab_order_item'}}}})).id,amount:'1',method:'cash',receivedBy:actor.userId,receivedAt:new Date(on+'T10:00:00Z')}})).rejects.toThrow('closed till');
    const deposit=await run(()=>revenue.deposit(actor,{date:on,fromAccountId:cash,toAccountId:bank,tillCloseId:close.id,amount:'50',reference:'DEP-1',...key()}));
    await expect(run(()=>revenue.deposit(actor,{date:on,fromAccountId:cash,toAccountId:bank,tillCloseId:close.id,amount:'10',reference:'DEP-2',...key()}))).rejects.toThrow('counted cash');
    await post(deposit.journalId);expect((await raw.financeJournal.findUniqueOrThrow({where:{id:deposit.journalId}})).status).toBe('posted');
  });

  it('keeps supplier drafts separate from posted and reserved balances',async()=>{
    const supplier=await run(()=>operations.createSupplier(actor,{name:randomUUID(),...key()}));
    const bill=await run(()=>operations.bill(actor,{date:on,dueOn:on,supplierId:supplier.id,reference:'AP-1',memo:'Supplies',expenseAccountId:expense,amount:'100',...key()}));
    const payment={date:on,memo:'Pay supplier',cashAccountId:cash,amount:'60',...key()};
    await expect(run(()=>operations.settle(actor,bill.id,payment))).rejects.toThrow('Post the bill');await post(bill.journalId);
    const settlement=await run(()=>operations.settle(actor,bill.id,payment));
    const balance=(await operations.workspace(actor.facilityId)).bills.find(b=>b.id===bill.id)!;expect(balance.paid).toBe('0.00');expect(balance.reserved).toBe('60.00');expect(balance.available).toBe('40.00');
    await expect(run(()=>operations.settle(actor,bill.id,{...payment,...key()}))).rejects.toThrow('exceeds');await post(settlement.journalId);
  });

  it('returns complete ledger totals and preserves running balances across more than 2000 lines',async()=>{
    const period=await raw.fiscalPeriod.findFirstOrThrow({where:{facilityId:actor.facilityId,label:'1405-07'}});
    // Only this isolated test database gets the synthetic volume fixture.
    await raw.$transaction(async tx=>{
      const journals=Array.from({length:2005},()=>({id:randomUUID(),facilityId:actor.facilityId,periodId:period.id,date:date(on),memo:'Volume fixture',createdBy:actor.userId}));
      await tx.financeJournal.createMany({data:journals});
      await tx.financeJournalLine.createMany({data:journals.flatMap(j=>[{facilityId:actor.facilityId,journalId:j.id,accountId:cash,debit:'0.01',credit:'0'},{facilityId:actor.facilityId,journalId:j.id,accountId:equity,debit:'0',credit:'0.01'}])});
      await tx.$executeRaw`UPDATE finance_journal SET status='posted',number='VOL-'||id,posted_by=${reviewer.userId},posted_at=now() WHERE facility_id=${actor.facilityId} AND memo='Volume fixture'`;
    },{timeout:60000});
    const first=await ledger.ledger(actor.facilityId,cash,on,on,1);
    const last=await ledger.ledger(actor.facilityId,cash,on,on,Math.ceil(first.total/200));
    expect(first.total).toBeGreaterThan(2000);expect(last.closing).toBe(first.closing);expect(last.lines.at(-1)?.balance).toBe(first.closing);
    const report=await ledger.report(actor.facilityId,on,on);expect(report.balanced).toBe(true);expect(report.closingDebit).toBe(report.closingCredit);
  });
  it('validates Excel CSV openings, retains provenance and refuses duplicate active imports',async()=>{
    const input={filename:'accountant.csv',csv:'accountCode,debit,credit,description\r\n1000,200,0,"Opening, cash"\r\n3000,0,200,Equity\r\n',...key()};
    expect((await ledger.previewOpening(actor.facilityId,input)).debit).toBe('200.00');
    await expect(ledger.previewOpening(actor.facilityId,{...input,csv:input.csv.replace('0,200,Equity','0,199,Equity')})).rejects.toThrow('balance');
    await expect(ledger.previewOpening(actor.facilityId,{...input,csv:input.csv.replace('1000','UNKNOWN')})).rejects.toThrow('Unknown');
    await expect(ledger.previewOpening(actor.facilityId,{...input,csv:input.csv+'"broken'})).rejects.toThrow('Unclosed');
    const draft=await run(()=>ledger.importOpening(actor,input));expect(draft.status).toBe('draft');expect(draft.memo).toContain('SHA256');
    expect((await run(()=>ledger.importOpening(actor,input))).id).toBe(draft.id);
    await expect(run(()=>ledger.importOpening(actor,{...input,...key()}))).rejects.toThrow('already exists');
    await post(draft.id);
  });
});
