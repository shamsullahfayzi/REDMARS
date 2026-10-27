import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { FinanceJournalInput } from '@redmars/shared';
import { revenueMappingInputSchema, financePanelInputSchema, financePanelReceiptSchema, financeTillInputSchema, financeDepositInputSchema } from '@redmars/shared';
import { AuditedTx } from '../../prisma/prisma.service';
import { IntegrationService } from '../../integration/integration.service';
import { originOf } from '../invoice/invoice.service';
import { FinanceActor, FinanceLedgerService, FINANCE_CONSUMER, FINANCE_EVENTS, date, day, nextDay, decimal } from './finance-ledger.service';

const eventRow = z.record(z.string(), z.unknown());
const envelopeSchema = z.object({before:eventRow.nullable(),after:eventRow.nullable(),actorId:z.string().nullable().optional(),invoice:eventRow.optional()});
const itemsSchema = z.array(z.object({refType:z.string(),refId:z.string().nullable(),quantity:z.number().int(),unitPrice:z.string(),total:z.string()}));
type Vector = Map<string, Prisma.Decimal>;
const add = (v:Vector,id:string,amount:Prisma.Decimal) => v.set(id,(v.get(id)??decimal('0')).add(amount));

@Injectable()
export class FinanceRevenueService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(FinanceRevenueService.name);
  constructor(private readonly ledger:FinanceLedgerService,private readonly integrations:IntegrationService) {}
  onModuleInit() {
    if(process.env.NODE_ENV==='test') return;
    this.timer=setInterval(()=>{ void this.synchronizeFacilities(); },10000);
    this.timer.unref();
  }
  onModuleDestroy() { if(this.timer) clearInterval(this.timer); }
  private async synchronizeFacilities() {
    if(this.running) return;
    this.running=true;
    try {
      const facilities=await this.ledger.prisma.financeSettings.findMany({where:{facility:{isActive:true,modules:{some:{module:'finance',enabled:true}}}}});
      for(const setting of facilities) {
        const user=await this.ledger.prisma.appUser.findFirst({where:{facilityId:setting.facilityId,isActive:true,deletedAt:null,userRoles:{some:{role:{code:{in:['admin','finance_manager','accountant']}}}}},orderBy:{id:'asc'}});
        if(user) await this.sync({facilityId:setting.facilityId,userId:user.id});
      }
    } catch(error) { this.logger.error('Finance draft synchronization failed',error instanceof Error?error.message:String(error)); }
    finally {this.running=false;}
  }

  async workspace(facilityId:string) {
    return this.ledger.prisma.db.$transaction(async tx=>{
      const [mappings,services,panels,users,closes,deposits] = await Promise.all([
        tx.financeRevenueMapping.findMany({where:{facilityId}}),
        tx.service.findMany({where:{facilityId,isActive:true},select:{id:true,code:true,name:true},orderBy:{name:'asc'}}),
        tx.panel.findMany({where:{facilityId,isActive:true},orderBy:{name:'asc'}}),
        tx.appUser.findMany({where:{facilityId,isActive:true},select:{id:true,fullName:true},orderBy:{fullName:'asc'}}),
        tx.financeTillClose.findMany({where:{facilityId},orderBy:{endsAt:'desc'}}),
        tx.financeDeposit.findMany({where:{facilityId},include:{journal:{include:{reversal:true}}},orderBy:{journal:{date:'desc'}}}),
      ]);
      return {mappings,services,panels,users,
        closes:closes.map(c=>({...c,userName:users.find(u=>u.id===c.userId)?.fullName??c.userId,startsAt:c.startsAt.toISOString(),endsAt:c.endsAt.toISOString(),approvedAt:c.approvedAt?.toISOString()??null,opening:c.opening.toFixed(2),expected:c.expected.toFixed(2),counted:c.counted.toFixed(2),difference:c.difference.toFixed(2)})),
        deposits:deposits.map(d=>({...d,amount:d.amount.toFixed(2),date:day(d.journal.date),status:d.journal.status,reversed:d.journal.reversal?.status==='posted'}))};
    });
  }

  mapping(actor:FinanceActor,input:z.infer<typeof revenueMappingInputSchema>) {
    return this.ledger.command(actor,'revenue.mapping',input,async tx=>{
      const account=await tx.financeAccount.findFirst({where:{id:input.accountId,facilityId:actor.facilityId,type:'revenue',isPosting:true,isActive:true}});
      if(!account) throw new BadRequestException('Choose an active revenue account from this facility.');
      if(input.category.startsWith('service:') && !await tx.service.findFirst({where:{id:input.category.slice(8),facilityId:actor.facilityId}})) throw new BadRequestException('Service not found.');
      return tx.financeRevenueMapping.upsert({where:{facilityId_category:{facilityId:actor.facilityId,category:input.category}},create:{facilityId:actor.facilityId,category:input.category,accountId:input.accountId},update:{accountId:input.accountId}});
    });
  }

  panel(actor:FinanceActor,input:z.infer<typeof financePanelInputSchema>) {
    return this.ledger.command(actor,'panel.create',input,tx=>tx.panel.create({data:{facilityId:actor.facilityId,code:input.code,name:input.name,contactPerson:input.contactPerson||null,phone:input.phone||null}}));
  }

  assignPanel(actor:FinanceActor,invoiceId:string,input:{panelId:string;idempotencyKey:string}) {
    return this.ledger.command(actor,'panel.assign:'+invoiceId,input,async tx=>{
      const invoice=await tx.invoice.findFirst({where:{id:invoiceId,facilityId:actor.facilityId},include:{payments:true}});
      const panel=await tx.panel.findFirst({where:{id:input.panelId,facilityId:actor.facilityId,isActive:true}});
      if(!invoice||!panel) throw new NotFoundException('Invoice or panel not found.');
      if(invoice.payments.some(p=>p.method==='panel') || await tx.financeJournal.count({where:{invoiceId,panelId:{not:null}}})) throw new ConflictException('Panel activity already exists; its payer cannot be reassigned.');
      await tx.invoice.update({where:{id:invoiceId},data:{panelId:panel.id}});
      return {assigned:true};
    });
  }

  private async mappingAccounts(tx:AuditedTx,facilityId:string) {
    const mappings=await tx.financeRevenueMapping.findMany({where:{facilityId},include:{account:true}});
    return (category:string) => {
      const row=mappings.find(m=>m.category===category);
      if(!row?.account.isActive || !row.account.isPosting) throw new BadRequestException('Configure an active revenue account for '+category+'.');
      return row.accountId;
    };
  }

  async sync(actor:FinanceActor) {
    await this.ledger.settings(this.ledger.prisma.db,actor.facilityId);
    const events=await this.integrations.pending(actor.facilityId,FINANCE_CONSUMER,FINANCE_EVENTS,100);
    let drafted=0,skipped=0;
    const failures:Array<{eventId:string;type:string;message:string}>=[];
    for(const event of events) {
      let wrote=false;
      try {
        const consumed=await this.integrations.consume(actor.facilityId,FINANCE_CONSUMER,event.id,async(e,tx)=>{
          await tx.$queryRaw`SELECT set_config('redmars.finance_actor',${actor.userId},true)`;
          // One facility lock orders recognition state and receipts even across concurrent syncs.
          await tx.$queryRaw`SELECT id FROM facility WHERE id=${actor.facilityId} FOR UPDATE`;
          const earlier=await tx.integrationEvent.count({where:{facilityId:actor.facilityId,type:{in:FINANCE_EVENTS},sequence:{lt:e.sequence},receipts:{none:{consumer:FINANCE_CONSUMER}}}});
          if(earlier) throw new ConflictException('An earlier event must be processed first.');
          const settings=await this.ledger.settings(tx,actor.facilityId);
          if(e.occurredAt<settings.cutoverDate) return;
          const envelope=envelopeSchema.parse(e.payload);
          const invoiceId=e.aggregateType==='Invoice'?e.aggregateId:z.string().parse(envelope.after?.invoiceId);
          const invoice=await tx.invoice.findFirst({where:{id:invoiceId,facilityId:actor.facilityId},include:{patient:true,panel:true}});
          if(!invoice) throw new BadRequestException('Source invoice is missing; review its audit history.');
          if(invoice.createdAt<settings.cutoverDate) throw new BadRequestException('Source invoice predates cutover; reconcile opening receivables first.');
          if(invoice.currency!=='AFN') throw new BadRequestException('Only AFN billing is supported.');
          const mapping=await this.mappingAccounts(tx,actor.facilityId);
          const receivable=await this.ledger.systemAccount(tx,actor.facilityId,'receivable');
          const vector:Vector=new Map();
          let panelId:string|null=null;
          if(e.aggregateType==='Invoice') {
            const state=await tx.financeInvoiceState.findUnique({where:{invoiceId}});
            const previous:Vector=new Map();
            if(state) for(const [id,value] of Object.entries(z.record(z.string(),z.string()).parse(state.target))) previous.set(id,decimal(value));
            else {
              const old=await tx.financeJournalLine.findMany({where:{facilityId:actor.facilityId,journal:{invoiceId,sourceType:'hospital',paymentId:null},account:{type:'revenue'}}});
              for(const line of old) add(previous,line.accountId,line.credit.sub(line.debit));
            }
            const target:Vector=new Map();
            const after=envelope.after;
            if(after && after.status!=='cancelled' && after.status!=='draft') {
              const total=decimal(z.string().parse(after.total));
              if(after.items) {
                const items=itemsSchema.parse(after.items);
                let gross=decimal('0');
                const mappings=await tx.financeRevenueMapping.findMany({where:{facilityId:actor.facilityId}});
                for(const item of items) {
                  const value=decimal(item.unitPrice).mul(String(item.quantity));
                  if(value.isNegative()) throw new BadRequestException('Negative invoice charges need a source correction.');
                  gross=gross.add(value);
                  const category=item.refType==='prescription_item'?'pharmacy':item.refType==='lab_order_item'?'laboratory':item.refType==='card_registration'?'registration':item.refType==='service'?'consultation':'other';
                  const override=item.refType==='service' && item.refId ? mappings.find(m=>m.category==='service:'+item.refId)?.category : undefined;
                  add(target,mapping(override??category),value);
                }
                if(gross.lt(total)) throw new BadRequestException('Invoice line charges do not explain its total.');
                add(target,mapping('discount'),gross.sub(total).negated());
              } else {
                // Older events did not carry immutable lines: preserve their aggregate economics.
                const delta=total.sub(envelope.before && envelope.before.status!=='draft' && envelope.before.status!=='cancelled' ? decimal(z.string().parse(envelope.before.total)) : decimal('0'));
                for(const [id,value] of previous) target.set(id,value);
                add(target,(await this.ledger.systemAccount(tx,actor.facilityId,'revenue')).id,delta);
              }
            }
            let ar=decimal('0');
            for(const id of new Set([...target.keys(),...previous.keys()])) {
              const change=(target.get(id)??decimal('0')).sub(previous.get(id)??decimal('0'));
              ar=ar.add(change);
              // A reduction of earned charges is presented in the refund/credit contra account.
              const destination=change.isNegative() && id!==mapping('discount') ? mapping('refund') : id;
              add(vector,destination,change.negated());
            }
            add(vector,receivable.id,ar);
            const saved=Object.fromEntries([...target].map(([id,v])=>[id,v.toFixed(2)]));
            await tx.financeInvoiceState.upsert({where:{invoiceId},create:{facilityId:actor.facilityId,invoiceId,target:saved},update:{target:saved}});
          } else {
            const value=decimal(z.string().parse(envelope.after?.amount));
            const method=z.enum(['cash','card','bank_transfer','mobile_money','panel','waiver']).parse(envelope.after?.method);
            let accountId:string;
            if(method==='panel') {
              panelId=typeof envelope.invoice?.panelId==='string'?envelope.invoice.panelId:invoice.panelId;
              if(!panelId || !await tx.panel.findFirst({where:{id:panelId,facilityId:actor.facilityId,isActive:true}})) throw new BadRequestException('Assign an active panel to this invoice before importing its panel payment.');
              accountId=(await this.ledger.systemAccount(tx,actor.facilityId,'panel')).id;
            } else if(method==='waiver') accountId=mapping('discount');
            else accountId=(await this.ledger.systemAccount(tx,actor.facilityId,method==='bank_transfer'?'bank':method)).id;
            add(vector,accountId,value); add(vector,receivable.id,value.negated());
          }
          const lines:FinanceJournalInput['lines']=[...vector].filter(([,v])=>!v.isZero()).map(([accountId,v])=>({accountId,description:e.type,debit:v.gt(0)?v.toFixed(2):'0',credit:v.lt(0)?v.negated().toFixed(2):'0'}));
          if(!lines.length) return;
          if(lines.length>100) throw new BadRequestException('This invoice exceeds 100 accounting lines; consolidate revenue mappings.');
          const sourceActor=envelope.actorId && await tx.appUser.findFirst({where:{id:envelope.actorId,facilityId:actor.facilityId}})?envelope.actorId:actor.userId;
          const journal=await this.ledger.automatic(tx,{...actor,userId:sourceActor},{date:day(e.occurredAt),memo:`Hospital ${e.aggregateType.toLowerCase()} ${invoice.invoiceNo}`,lines,idempotencyKey:randomUUID()},'hospital',e.id,e.occurredAt);
          await tx.financeJournal.update({where:{id:journal.id},data:{invoiceId,paymentId:e.aggregateType==='Payment'?e.aggregateId:null,panelId}});
          wrote=true;
        });
        if(consumed&&wrote) drafted++; else skipped++;
      } catch(error) {
        failures.push({eventId:event.id,type:event.type,message:error instanceof BadRequestException||error instanceof ConflictException?error.message:'Could not generate this entry. No changes were committed; review the source and retry.'});
        break;
      }
    }
    const remaining=await this.ledger.prisma.db.integrationEvent.count({where:{facilityId:actor.facilityId,type:{in:FINANCE_EVENTS},receipts:{none:{consumer:FINANCE_CONSUMER}}}});
    return {drafted,skipped,failures,remaining};
  }

  async ar(facilityId:string,asOf:string,kind:'patient'|'panel',panelId?:string,patientId?:string) {
    return this.ledger.prisma.db.$transaction(async tx=>{
      const account=await this.ledger.systemAccount(tx,facilityId,kind==='panel'?'panel':'receivable');
      const all=await tx.financeJournalLine.findMany({where:{facilityId,accountId:account.id,journal:{status:'posted',date:{lt:nextDay(asOf)}}},include:{journal:{include:{invoice:{include:{patient:true}},panel:true}}}});
      const buckets=new Map<string,{invoice:NonNullable<(typeof all)[number]['journal']['invoice']>;panel:(typeof all)[number]['journal']['panel'];balance:Prisma.Decimal}>();
      let control=decimal('0');
      for(const line of all) {
        const amount=line.baseDebit.sub(line.baseCredit); control=control.add(amount);
        const invoice=line.journal.invoice;
        if(!invoice) continue;
        const bucketKey=invoice.id+':'+(kind==='panel'?line.journal.panelId??'':'');
        const old=buckets.get(bucketKey);
        buckets.set(bucketKey,{invoice,panel:line.journal.panel,balance:(old?.balance??decimal('0')).add(amount)});
      }
      const fullTotal=[...buckets.values()].reduce((n,b)=>n.add(b.balance),decimal('0'));
      const rows=[...buckets.values()].filter(b=>!b.balance.isZero()&&(!panelId||b.panel?.id===panelId)&&(!patientId||b.invoice.patientId===patientId)).map(b=>{
        const age=Math.max(0,Math.floor((date(asOf).getTime()-date(day(b.invoice.createdAt)).getTime())/86400000));
        return {invoiceId:b.invoice.id,invoiceNo:b.invoice.invoiceNo,patientId:b.invoice.patientId,patientName:[b.invoice.patient.firstName,b.invoice.patient.lastName].filter(Boolean).join(' '),patientMrn:b.invoice.patient.mrn,panelId:b.panel?.id??null,panelName:b.panel?.name??null,date:day(b.invoice.createdAt),days:age,balance:b.balance.toFixed(2),current:age<=30?b.balance.toFixed(2):'0.00',days31to60:age>30&&age<=60?b.balance.toFixed(2):'0.00',days61to90:age>60&&age<=90?b.balance.toFixed(2):'0.00',over90:age>90?b.balance.toFixed(2):'0.00'};
      }).sort((a,b)=>a.date.localeCompare(b.date)||a.invoiceNo.localeCompare(b.invoiceNo));
      const pending=await tx.financeJournal.count({where:{facilityId,status:'draft',date:{lt:nextDay(asOf)},lines:{some:{accountId:account.id}}}});
      return {asOf,kind,rows,pending,total:rows.reduce((n,r)=>n.add(r.balance),decimal('0')).toFixed(2),controlBalance:control.toFixed(2),difference:control.sub(fullTotal).toFixed(2)};
    });
  }

  panelReceipt(actor:FinanceActor,input:z.infer<typeof financePanelReceiptSchema>) {
    return this.ledger.command(actor,'panel.receipt',input,async tx=>{
      await tx.$queryRaw`SELECT id FROM invoice WHERE id=${input.invoiceId} AND facility_id=${actor.facilityId} FOR UPDATE`;
      const invoice=await tx.invoice.findFirst({where:{id:input.invoiceId,facilityId:actor.facilityId,panelId:input.panelId}});
      if(!invoice) throw new NotFoundException('Panel invoice not found.');
      const cash=await this.cash(tx,actor.facilityId,input.cashAccountId);
      const panel=await this.ledger.systemAccount(tx,actor.facilityId,'panel');
      const posted=await tx.financeJournalLine.aggregate({where:{facilityId:actor.facilityId,accountId:panel.id,journal:{invoiceId:invoice.id,panelId:input.panelId,status:'posted',date:{lt:nextDay(input.date)}}},_sum:{baseDebit:true,baseCredit:true}});
      const reserved=await tx.financeJournalLine.aggregate({where:{facilityId:actor.facilityId,accountId:panel.id,journal:{invoiceId:invoice.id,panelId:input.panelId,status:'draft'}},_sum:{baseCredit:true}});
      const available=decimal(posted._sum.baseDebit??'0').sub(posted._sum.baseCredit??'0').sub(reserved._sum.baseCredit??'0');
      if(decimal(input.amount).gt(available)) throw new BadRequestException('Receipt exceeds posted panel debt after reserved drafts.');
      const journal=await this.ledger.automatic(tx,actor,{date:input.date,memo:`Panel receipt ${input.reference}`,idempotencyKey:input.idempotencyKey,lines:[{accountId:cash.id,debit:input.amount,credit:'0',description:input.reference},{accountId:panel.id,debit:'0',credit:input.amount,description:invoice.invoiceNo}]},'panel_receipt',input.reference);
      await tx.financeJournal.update({where:{id:journal.id},data:{invoiceId:invoice.id,panelId:input.panelId}});
      return {journalId:journal.id};
    });
  }

  private async cash(tx:AuditedTx,facilityId:string,id:string) {
    const row=await tx.financeAccount.findFirst({where:{id,facilityId,isCash:true,isActive:true,isPosting:true}});
    if(!row) throw new BadRequestException('Choose an active cash or bank account.');
    return row;
  }

  async tillPreview(facilityId:string,input:z.infer<typeof financeTillInputSchema>,tx:AuditedTx=this.ledger.prisma.db) {
    const start=new Date(input.startsAt),end=new Date(input.endsAt);
    if(end>new Date()||end.getTime()-start.getTime()>86400000) throw new BadRequestException('Choose a completed shift of at most 24 hours.');
    if(!await tx.appUser.findFirst({where:{id:input.userId,facilityId}})) throw new NotFoundException('Cashier not found.');
    const payments=await tx.payment.findMany({where:{receivedBy:input.userId,receivedAt:{gte:start,lt:end},invoice:{facilityId}},include:{invoice:{include:{items:true}}}});
    const selected=payments.filter(p=>originOf(p.invoice.items.map(i=>i.refType))===input.origin);
    const cash=selected.filter(p=>p.method==='cash').reduce((n,p)=>n.add(p.amount),decimal('0'));
    const expected=decimal(input.opening).add(cash);
    return {expected:expected.toFixed(2),difference:decimal(input.counted).sub(expected).toFixed(2),paymentIds:selected.map(p=>p.id),paymentCount:selected.length};
  }

  closeTill(actor:FinanceActor,input:z.infer<typeof financeTillInputSchema>) {
    return this.ledger.command(actor,'till.close',input,async tx=>{
      await tx.$queryRaw`SELECT id FROM app_user WHERE id=${input.userId} AND facility_id=${actor.facilityId} FOR UPDATE`;
      const preview=await this.tillPreview(actor.facilityId,input,tx);
      if(!decimal(preview.difference).isZero()&&!input.note.trim()) throw new BadRequestException('Explain the cash difference before closing.');
      return tx.financeTillClose.create({data:{facilityId:actor.facilityId,userId:input.userId,origin:input.origin,label:input.label,startsAt:new Date(input.startsAt),endsAt:new Date(input.endsAt),opening:input.opening,counted:input.counted,expected:preview.expected,difference:preview.difference,paymentIds:preview.paymentIds,note:input.note,createdBy:actor.userId}});
    });
  }

  approveTill(actor:FinanceActor,id:string,input:{idempotencyKey:string}) {
    return this.ledger.command(actor,'till.approve:'+id,input,async tx=>{
      const close=await tx.financeTillClose.findFirst({where:{id,facilityId:actor.facilityId}});
      if(!close) throw new NotFoundException('Till close not found.');
      if(close.createdBy===actor.userId||close.approvedAt) throw new ConflictException('A different accountant must approve this unapproved count.');
      return tx.financeTillClose.update({where:{id},data:{approvedBy:actor.userId,approvedAt:new Date()}});
    });
  }

  deposit(actor:FinanceActor,input:z.infer<typeof financeDepositInputSchema>) {
    return this.ledger.command(actor,'deposit',input,async tx=>{
      const from=await this.cash(tx,actor.facilityId,input.fromAccountId),to=await this.cash(tx,actor.facilityId,input.toAccountId);
      if(from.id===to.id) throw new BadRequestException('Choose different cash and bank accounts.');
      if(input.tillCloseId) {
        await tx.$queryRaw`SELECT id FROM finance_till_close WHERE id=${input.tillCloseId} AND facility_id=${actor.facilityId} FOR UPDATE`;
        const close=await tx.financeTillClose.findFirst({where:{id:input.tillCloseId,facilityId:actor.facilityId},include:{deposits:{include:{journal:{include:{reversal:true}}}}}});
        if(!close?.approvedAt) throw new BadRequestException('Choose an approved till count.');
        if(nextDay(input.date)<=close.endsAt) throw new BadRequestException('Deposit date must be on or after the shift end.');
        const reserved=close.deposits.filter(d=>d.journal.reversal?.status!=='posted').reduce((n,d)=>n.add(d.amount),decimal('0'));
        if(decimal(input.amount).gt(close.counted.sub(reserved))) throw new BadRequestException('Deposit exceeds counted cash after existing deposits and drafts.');
      }
      const id=randomUUID();
      const journal=await this.ledger.automatic(tx,actor,{date:input.date,memo:`Bank deposit ${input.reference}`,idempotencyKey:input.idempotencyKey,lines:[{accountId:to.id,debit:input.amount,credit:'0',description:input.reference},{accountId:from.id,debit:'0',credit:input.amount,description:input.reference}]},'bank_deposit',id);
      await tx.financeDeposit.create({data:{id,facilityId:actor.facilityId,journalId:journal.id,tillCloseId:input.tillCloseId??null,reference:input.reference,amount:input.amount}});
      return {id,journalId:journal.id};
    });
  }

  async source(facilityId:string,journalId:string) {
    const journal=await this.ledger.prisma.financeJournal.findFirst({where:{id:journalId,facilityId},include:{invoice:{include:{patient:true,visit:{select:{id:true,visitNo:true}},panel:true,items:true}}}});
    if(!journal) throw new NotFoundException('Journal not found.');
    const i=journal.invoice;
    const payment=journal.paymentId?await this.ledger.prisma.payment.findFirst({where:{id:journal.paymentId,invoice:{facilityId}}}):null;
    const history=i?await this.ledger.prisma.financeJournal.findMany({where:{facilityId,invoiceId:i.id},orderBy:[{date:'asc'},{createdAt:'asc'}],select:{id:true,date:true,number:true,memo:true,status:true}}):[];
    return {journalId,sourceType:journal.sourceType,sourceId:journal.sourceId,
      invoice:i?{id:i.id,invoiceNo:i.invoiceNo,date:day(i.createdAt),status:i.status,total:i.total.toFixed(2),paidAmount:i.paidAmount.toFixed(2),patientName:[i.patient.firstName,i.patient.lastName].filter(Boolean).join(' '),mrn:i.patient.mrn,visitId:i.visitId,visitNo:i.visit?.visitNo??null,panelName:i.panel?.name??null,items:i.items.map(item=>({description:item.description,total:item.total.toFixed(2)}))}:null,
      payment:payment?{receiptNo:payment.receiptNo,amount:payment.amount.toFixed(2),method:payment.method,receivedAt:payment.receivedAt.toISOString()}:null,
      history:history.map(h=>({...h,date:day(h.date)}))};
  }

  async panelStatement(facilityId:string,panelId:string,from:string,to:string) {
    return this.ledger.prisma.db.$transaction(async tx=>{
      const panel=await tx.panel.findFirst({where:{id:panelId,facilityId}});
      if(!panel) throw new NotFoundException('Panel not found.');
      const account=await this.ledger.systemAccount(tx,facilityId,'panel');
      const rows=await tx.financeJournalLine.findMany({where:{facilityId,accountId:account.id,journal:{panelId,status:'posted',date:{lt:nextDay(to)}}},include:{journal:{include:{invoice:true}}},orderBy:[{journal:{date:'asc'}},{journal:{number:'asc'}},{id:'asc'}]});
      let opening=decimal('0'),balance=decimal('0');
      const lines=[] as Array<{journalId:string;number:string;date:string;invoiceNo:string;memo:string;debit:string;credit:string;balance:string}>;
      for(const row of rows) {
        balance=balance.add(row.baseDebit).sub(row.baseCredit);
        if(row.journal.date<date(from)) opening=balance;
        else lines.push({journalId:row.journalId,number:row.journal.number!,date:day(row.journal.date),invoiceNo:row.journal.invoice?.invoiceNo??'',memo:row.journal.memo,debit:row.baseDebit.toFixed(2),credit:row.baseCredit.toFixed(2),balance:balance.toFixed(2)});
      }
      return {panelName:panel.name,from,to,opening:opening.toFixed(2),closing:balance.toFixed(2),lines};
    });
  }
}
