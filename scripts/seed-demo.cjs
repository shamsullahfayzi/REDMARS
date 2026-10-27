/* Local, synthetic demo only. Resume-safe: never updates existing hospital records.
 * Run from repository root after building shared/API and deploying migrations.
 * Credentials and the count manifest are written to ignored .test-runtime/.
 */
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
process.loadEnvFile('apps/api/.env');
const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/redmars' || process.env.NODE_ENV === 'production') throw Error('Local redmars database only');
// Disable background workers in this maintenance process; commands below are facility scoped.
process.env.NODE_ENV = 'test';
const { PrismaClient } = require('../apps/api/node_modules/@prisma/client');
const { hash } = require('../apps/api/node_modules/@node-rs/argon2');
const { NestFactory } = require('../apps/api/node_modules/@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { requestContext } = require('../apps/api/dist/audit/request-context');
const c = require('../apps/api/node_modules/@redmars/shared');
const db = new PrismaClient();
const CODE = 'AXON_DEMO_10';
const credentialsPath = '.test-runtime/demo-credentials.json';
const key = (s) => { const h = createHash('sha256').update(CODE + s).digest('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`; };
const atDay = (offset) => { const d = new Date(); d.setUTCHours(0,0,0,0); d.setUTCDate(d.getUTCDate()+offset); return d; };
let app;
async function seedHrDemo({facilityId,admin,doctor,opd,er,passwordHash,credentials}) {
  await db.facilityModule.upsert({where:{facilityId_module:{facilityId,module:'hr'}},update:{enabled:true,enabledAt:new Date()},create:{facilityId,module:'hr',enabled:true,enabledAt:new Date()}});
  const positionRows=[
    ['doctor','DEMO Psychiatrist','روانپزشک آزمایشی','ازمایښتي رواني ډاکټر','clinical',true],
    ['nurse','DEMO Nurse','پرستار آزمایشی','ازمایښتي نرس','clinical',true],
    ['reception','DEMO Receptionist','پذیرش آزمایشی','ازمایښتي ریسپشن','administration',false],
    ['finance','DEMO Finance Officer','مسئول مالی آزمایشی','ازمایښتي مالي مسئول','administration',false],
    ['support','DEMO Support Worker','کارمند خدمات آزمایشی','ازمایښتي خدماتي کارکوونکی','support',false],
  ];
  const positions={};
  for(const [code,titleEn,titlePrs,titlePs,category,isClinical] of positionRows) positions[code]=await db.position.upsert({where:{id:key('hr-position-'+code)},update:{titleEn,titlePrs,titlePs,category,isClinical,isActive:true,updatedBy:admin.id},create:{id:key('hr-position-'+code),facilityId,titleEn,titlePrs,titlePs,category,isClinical,isActive:true,createdBy:admin.id,updatedBy:admin.id}});
  const employeeRows=[
    ['01','DEMO Ahmad','Rahimi','male','doctor',opd.id,doctor.id],
    ['02','DEMO Laila','Mohammadi','female','doctor',opd.id,null],
    ['03','DEMO Maryam','Safi','female','nurse',opd.id,null],
    ['04','DEMO Farid','Ahmadi','male','nurse',opd.id,null],
    ['05','DEMO Zohra','Karimi','female','nurse',er.id,null],
    ['06','DEMO Hamid','Noori','male','nurse',er.id,null],
    ['07','DEMO Shakila','Azizi','female','reception',opd.id,null],
    ['08','DEMO Omar','Hussaini','male','finance',opd.id,null],
    ['09','DEMO Nasrin','Akbari','female','support',er.id,null],
    ['10','DEMO Bashir','Wardak','male','support',er.id,null],
  ];
  const employees=[];
  for(const [no,firstName,lastName,sex,positionCode,departmentId,userId] of employeeRows) employees.push(await db.employee.upsert({where:{facilityId_employeeNo:{facilityId,employeeNo:'DEMO-HR-'+no}},update:{departmentId,positionId:positions[positionCode].id,userId,updatedBy:admin.id},create:{facilityId,employeeNo:'DEMO-HR-'+no,userId,firstName,lastName,sex,phone:'07000000'+no,addressProvince:'Kabul',emergencyName:'DEMO Emergency '+no,emergencyRelation:'Family',emergencyPhone:'07900000'+no,departmentId,positionId:positions[positionCode].id,employmentType:no==='10'?'temporary':'permanent',joinedOn:atDay(-180-Number(no)),status:no==='06'?'on_leave':'active',baseSalaryMinor:(18000+Number(no)*1500)*100,salaryCurrency:'AFN',notes:'Synthetic HR training record only',createdBy:admin.id,updatedBy:admin.id}}));
  const accountRows=[
    [1,'demo_psychiatrist','doctor'],[2,'demo_nurse_1','nurse'],[3,'demo_nurse_2','nurse'],
    [4,'demo_nurse_3','nurse'],[5,'demo_nurse_4','nurse'],[6,'demo_reception_hr','receptionist'],
    [7,'demo_finance_hr','accountant'],[8,'demo_support_1','call_center'],[9,'demo_support_2','call_center'],
  ];
  for(const [employeeIndex,username,roleCode] of accountRows){
    const employee=employees[employeeIndex], role=await db.role.findUniqueOrThrow({where:{code:roleCode}});
    const user=await db.appUser.upsert({where:{facilityId_username:{facilityId,username}},update:{isActive:true,deletedAt:null,passwordHash},create:{facilityId,username,fullName:employee.firstName+' '+employee.lastName,passwordHash}});
    await db.userRole.upsert({where:{userId_roleId:{userId:user.id,roleId:role.id}},update:{},create:{userId:user.id,roleId:role.id}});
    await db.employee.update({where:{id:employee.id},data:{userId:user.id,updatedBy:admin.id}});
    if(roleCode==='doctor') await db.practitioner.upsert({where:{facilityId_code:{facilityId,code:employee.employeeNo}},update:{userId:user.id,isActive:true},create:{facilityId,code:employee.employeeNo,firstName:employee.firstName,lastName:employee.lastName,userId:user.id,departments:{create:{departmentId:employee.departmentId}}}});
  }
  credentials.hrUsers=['demo_doctor',...accountRows.map(([,username])=>username)];
  fs.writeFileSync(credentialsPath,JSON.stringify(credentials,null,2));
  const leaveRows=[
    ['annual','DEMO Annual leave','رخصتی سالانه آزمایشی','ازمایښتي کلنۍ رخصتي',20,false,true],
    ['sick','DEMO Sick leave','رخصتی مریضی آزمایشی','ازمایښتي ناروغۍ رخصتي',10,true,true],
    ['unpaid','DEMO Unpaid leave','رخصتی بدون معاش آزمایشی','ازمایښتي بې معاش رخصتي',null,false,false],
    ['compassionate','DEMO Compassionate leave','رخصتی ضروری آزمایشی','ازمایښتي ضروري رخصتي',5,false,true],
  ];
  const leaveTypes={};
  for(const [code,nameEn,namePrs,namePs,annualEntitlement,requiresAttachment,isPaid] of leaveRows) leaveTypes[code]=await db.leaveType.upsert({where:{facilityId_code:{facilityId,code:'DEMO-'+code.toUpperCase()}},update:{nameEn,namePrs,namePs,annualEntitlement,requiresAttachment,isPaid,isActive:true,updatedBy:admin.id},create:{facilityId,code:'DEMO-'+code.toUpperCase(),nameEn,namePrs,namePs,annualEntitlement,requiresAttachment,isPaid,isActive:true,createdBy:admin.id,updatedBy:admin.id}});
  const shiftRows=[
    ['MORNING','DEMO Morning','صبح آزمایشی','ازمایښتي سهار','08:00','16:00','#2563eb'],
    ['EVENING','DEMO Evening','عصر آزمایشی','ازمایښتي ماښام','16:00','00:00','#f59e0b'],
    ['NIGHT','DEMO Night','شب آزمایشی','ازمایښتي شپه','00:00','08:00','#7c3aed'],
  ];
  const shifts={};
  for(const [code,nameEn,namePrs,namePs,start,end,color] of shiftRows) shifts[code]=await db.shiftType.upsert({where:{facilityId_code:{facilityId,code:'DEMO-'+code}},update:{nameEn,namePrs,namePs,startsAt:new Date('1970-01-01T'+start+':00Z'),endsAt:new Date('1970-01-01T'+end+':00Z'),crossesMidnight:end<=start,color,isActive:true,updatedBy:admin.id},create:{facilityId,code:'DEMO-'+code,nameEn,namePrs,namePs,startsAt:new Date('1970-01-01T'+start+':00Z'),endsAt:new Date('1970-01-01T'+end+':00Z'),crossesMidnight:end<=start,color,isActive:true,createdBy:admin.id,updatedBy:admin.id}});
  const hrConfig={weeklyRestDays:[5],leavePastEntryDays:30,maxConsecutiveNightShifts:3,credentialReminderDays:[90,60,30,0],staffingRequirements:[{departmentId:opd.id,shiftTypeId:shifts.MORNING.id,minimumStaff:3,roleOnShift:null},{departmentId:er.id,shiftTypeId:shifts.NIGHT.id,minimumStaff:2,roleOnShift:null}]};
  await db.setting.upsert({where:{facilityId_key:{facilityId,key:'hr.config'}},update:{value:hrConfig},create:{facilityId,key:'hr.config',value:hrConfig}});
  for(let i=0;i<employees.length;i++) {
    const employee=employees[i], n=String(i+1).padStart(2,'0');
    const documentId=key('hr-document-'+n);
    await db.employeeDocument.upsert({where:{id:documentId},update:{},create:{id:documentId,facilityId,employeeId:employee.id,type:i<6?'license':'contract',title:'DEMO personnel document '+n,fileName:'demo-document-'+n+'.txt',mimeType:'text/plain',sizeBytes:34,content:Buffer.from('Synthetic HR document; no real data.'),issuedOn:atDay(-365),expiresOn:atDay([15,30,60,90,180,365][i%6]),note:'Synthetic attachment',createdBy:admin.id,updatedBy:admin.id}});
    const credentialId=key('hr-credential-'+n);
    await db.credential.upsert({where:{id:credentialId},update:{expiresOn:atDay([-10,0,15,30,60,90,180,365,null,null][i]??365),updatedBy:admin.id},create:{id:credentialId,facilityId,employeeId:employee.id,type:i<6?'professional_license':'training',name:i<6?'DEMO Professional licence':'DEMO Safety training',issuingAuthority:'DEMO Training Authority',referenceNo:'DEMO-CRED-'+n,issuedOn:atDay(-365),expiresOn:atDay([-10,0,15,30,60,90,180,365,null,null][i]??365),blocksClinicalWork:i<6,documentId,note:'Synthetic credential',createdBy:admin.id,updatedBy:admin.id}});
    if(i<2) await db.credentialReminder.upsert({where:{credentialId_threshold:{credentialId,threshold:i===0?-1:0}},update:{recipients:[admin.id]},create:{facilityId,credentialId,threshold:i===0?-1:0,recipients:[admin.id]}});
    await db.hrNotification.upsert({where:{id:key('hr-notification-'+n)},update:{},create:{id:key('hr-notification-'+n),facilityId,employeeId:employee.id,recipientUserId:i===0?doctor.id:admin.id,type:i<2?'credential_expiry':'roster_published',title:i<2?'DEMO Credential alert':'DEMO Duty roster published',message:'Synthetic HR notification for training.',payload:{synthetic:true}}});
  }
  const leaveRequests=[
    [employees[5],leaveTypes.annual,atDay(0),atDay(1),2,'approved'],
    [employees[2],leaveTypes.sick,atDay(3),atDay(3),1,'submitted'],
    [employees[8],leaveTypes.compassionate,atDay(-7),atDay(-6),2,'rejected'],
  ];
  for(let i=0;i<leaveRequests.length;i++){const [employee,type,startsOn,endsOn,daysRequested,status]=leaveRequests[i];await db.leaveRequest.upsert({where:{id:key('hr-leave-'+i)},update:{startsOn,endsOn,status,updatedBy:admin.id},create:{id:key('hr-leave-'+i),facilityId,employeeId:employee.id,leaveTypeId:type.id,startsOn,endsOn,daysRequested,reason:'DEMO leave request',status,decidedBy:status==='submitted'?null:admin.id,decidedAt:status==='submitted'?null:new Date(),decisionNote:status==='rejected'?'Synthetic rejected example':'Synthetic approved example',createdBy:admin.id,updatedBy:admin.id}});}
  for(let offset=-6;offset<=0;offset++) for(let i=0;i<employees.length;i++){const employee=employees[i],isLeave=i===5&&offset===0,status=isLeave?'on_leave':(i===3&&offset===-1?'late':(i===8&&offset===-2?'absent':'present'));await db.attendanceDay.upsert({where:{id:key('hr-attendance-'+offset+'-'+i)},update:{workDate:atDay(offset),status,minutesLate:status==='late'?25:0,updatedBy:admin.id},create:{id:key('hr-attendance-'+offset+'-'+i),facilityId,employeeId:employee.id,workDate:atDay(offset),shiftTypeId:null,status,minutesLate:status==='late'?25:0,note:'Synthetic attendance',leaveRequestId:isLeave?key('hr-leave-0'):null,markedByUserId:admin.id,createdBy:admin.id,updatedBy:admin.id}});}
  for(let offset=0;offset<7;offset++) for(let i=0;i<employees.length;i++){const employee=employees[i],shift=[shifts.MORNING,shifts.EVENING,shifts.NIGHT][i%3];await db.rosterEntry.upsert({where:{id:key('hr-roster-'+offset+'-'+i)},update:{dutyDate:atDay(offset),shiftTypeId:shift.id,departmentId:employee.departmentId,status:'confirmed',updatedBy:admin.id},create:{id:key('hr-roster-'+offset+'-'+i),facilityId,employeeId:employee.id,departmentId:employee.departmentId,shiftTypeId:shift.id,dutyDate:atDay(offset),roleOnShift:i%5===0?'Shift in-charge':null,status:'confirmed',publishedAt:new Date(),publishedBy:admin.id,notes:'Synthetic duty roster',createdBy:admin.id,updatedBy:admin.id}});}
  for(const [offset,label] of [[2,'DEMO Public holiday'],[30,'DEMO Future holiday']]) await db.hrHoliday.upsert({where:{facilityId_holidayDate:{facilityId,holidayDate:atDay(offset)}},update:{nameEn:label,updatedBy:admin.id},create:{facilityId,holidayDate:atDay(offset),nameEn:label,namePrs:'تعطیلی آزمایشی',namePs:'ازمایښتي رخصتي',isActive:true,createdBy:admin.id,updatedBy:admin.id}});
}
async function main() {
  fs.mkdirSync('.test-runtime', { recursive: true });
  let facility = await db.facility.findUnique({ where: { code: CODE } });
  if (facility && facility.name !== 'AXON DEMO — Synthetic testing only') throw Error('Demo code belongs to an unexpected facility');
  let credentials;
  if (fs.existsSync(credentialsPath)) credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  else {
    if (facility) throw Error('Existing demo has no credential file; refusing to reset passwords');
    credentials = { password: 'Demo-' + randomBytes(9).toString('base64url'), users: ['demo_admin', 'demo_reception', 'demo_doctor', 'demo_agent', 'demo_reviewer'] };
    fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), { flag: 'wx' });
  }
  const passwordHash = await hash(credentials.password);
  if (!facility) {
    for (const username of credentials.users) if (await db.appUser.count({where:{username}})) throw Error('Demo username already exists');
    facility = await db.$transaction(async tx => {
      const f = await tx.facility.create({data:{code:CODE,name:'AXON DEMO — Synthetic testing only'}});
      for (const module of ['lab','pharmacy','billing','reports','finance','crm','emergency']) await tx.facilityModule.create({data:{facilityId:f.id,module,enabled:true,enabledAt:new Date()}});
      for (const [username,role] of [['demo_admin','admin'],['demo_reception','receptionist'],['demo_doctor','doctor'],['demo_agent','call_center'],['demo_reviewer','admin']]) {
        const r = await tx.role.findUniqueOrThrow({where:{code:role}});
        await tx.appUser.create({data:{facilityId:f.id,username,fullName:'DEMO '+role,passwordHash,userRoles:{create:{roleId:r.id}}}});
      }
      return f;
    });
  }
  const facilityId = facility.id, where = {facilityId};
  const users = await db.appUser.findMany({where});
  const admin = users.find(u=>u.username==='demo_admin'), doctor = users.find(u=>u.username==='demo_doctor');
  const perms = await db.rolePermission.findMany({where:{role:{code:'admin'}},include:{permission:true}});
  const auth = {facilityId,userId:admin.id,username:admin.username,roles:['admin'],permissions:new Map(perms.map(p=>[p.permission.code,p.condition]))};
  app = await NestFactory.createApplicationContext(AppModule,{logger:['error']});
  const service = (file, name) => app.get(require('../apps/api/dist/modules/'+file)[name]);
  const ledger = service('finance/finance-ledger.service','FinanceLedgerService');
  const ops = service('finance/finance-operations.service','FinanceOperationsService');
  const payables = service('finance/finance-payables.service','FinancePayablesService');
  const payroll = service('finance/finance-payroll.service','FinancePayrollService');
  const assets = service('finance/finance-assets.service','FinanceAssetsService');
  const contacts = service('crm/crm-contacts.service','CrmContactsService');
  const leads = service('crm/crm-leads.service','CrmLeadsService');
  const calls = service('crm/crm-calls.service','CrmCallsService');
  const tasks = service('crm/crm-tasks.service','CrmTasksService');
  const payments = service('invoice/payment.service','PaymentService');
  const run = fn => requestContext.run(auth,fn);
  const command = (schema,s,input) => c[schema].parse({...input,idempotencyKey:key(s)});
  const now = facility.createdAt, date = now.toLocaleDateString('en-CA',{timeZone:'Asia/Kabul'});
  if (!await db.financeSettings.findUnique({where:{facilityId}})) await run(()=>ledger.setup(auth,command('financeSetupSchema','setup',{cutoverDate:date})));
  const accounts = await db.financeAccount.findMany({where});
  const account = s => accounts.find(a=>a.systemKey===s).id;
  const period = await db.fiscalPeriod.findFirstOrThrow({where:{...where,startsOn:{lte:now},endsOn:{gt:now}}});
  await run(()=>payroll.configure(auth,command('payrollConfigInputSchema','tax',{taxName:'DEMO Afghan monthly withholding',taxBands:c.AFGHAN_MONTHLY_TAX})));
  const depart = async (code,type) => db.department.upsert({where:{facilityId_code:{facilityId,code}},update:{},create:{facilityId,code,name:'DEMO '+type,type}});
  const opd=await depart('DEMO-OPD','opd'), er=await depart('DEMO-ER','emergency');
  const practitioner = await db.practitioner.upsert({where:{facilityId_code:{facilityId,code:'DEMO-DOC'}},update:{},create:{facilityId,code:'DEMO-DOC',firstName:'DEMO',lastName:'Doctor',userId:doctor.id,departments:{create:[{departmentId:opd.id},{departmentId:er.id}]}}});
  await seedHrDemo({facilityId,admin,doctor,opd,er,passwordHash,credentials});
  for (let i=1;i<=10;i++) {
    const n=String(i).padStart(2,'0'), prefix='DEMO-'+n;
    // Each clinical bundle is atomic, with a stable MRN as its resume marker.
    if (!await db.patient.findUnique({where:{facilityId_mrn:{facilityId,mrn:prefix}}})) await db.$transaction(async tx=>{
      const patient=await tx.patient.create({data:{facilityId,mrn:prefix,firstName:'DEMO Patient',lastName:n,gender:'male',estimatedAgeYears:25+i,ageRecordedAt:now,createdBy:admin.id}});
      const drug=await tx.drug.create({data:{facilityId,code:prefix,genericName:'DEMO Training item '+n,sellPrice:'10',form:'tablet'}});
      const test=await tx.labTest.create({data:{facilityId,code:prefix,name:'DEMO Lab test '+n,price:'100',specimen:'Synthetic sample',unit:'demo units'}});
      const svc=await tx.service.create({data:{facilityId,departmentId:opd.id,code:prefix,name:'DEMO Consultation '+n,fee:'500'}});
      const panel=await tx.panel.create({data:{facilityId,code:prefix,name:'DEMO Panel '+n}});
      await tx.appointment.create({data:{facilityId,patientId:patient.id,departmentId:opd.id,practitionerId:practitioner.id,scheduledAt:new Date(now.getTime()+i*3600000),reason:'DEMO booking only',createdBy:admin.id}});
      const visit=await tx.visit.create({data:{facilityId,patientId:patient.id,departmentId:opd.id,practitionerId:practitioner.id,visitNo:prefix+'-OPD',type:'opd_consult',status:i<=5?'arrived':'in_progress',chiefComplaint:'DEMO training visit; no real clinical complaint',createdBy:admin.id}});
      await tx.visitStatusHistory.create({data:{visitId:visit.id,status:visit.status,changedBy:admin.id,note:'Synthetic fixture'}});
      await tx.visit.create({data:{facilityId,patientId:patient.id,departmentId:er.id,visitNo:prefix+'-ER',type:'emergency',chiefComplaint:'DEMO emergency queue training',createdBy:admin.id,status:'arrived'}});
      await tx.vitals.create({data:{visitId:visit.id,systolicBp:120,diastolicBp:80,pulse:72,recordedBy:doctor.id}});
      await tx.clinicalNote.create({data:{visitId:visit.id,practitionerId:practitioner.id,noteType:'soap',content:{subjective:'DEMO only',objective:'Synthetic training record',assessment:'No real diagnosis',plan:'Do not use for patient care'}}});
      await tx.prescription.create({data:{visitId:visit.id,practitionerId:practitioner.id,advice:'DEMO ONLY — do not dispense to real patients',followUpDate:new Date(now.getTime()+86400000),items:{create:{drugId:drug.id,drugNameAtTime:drug.genericName,frequency:'OD',duration:'1 day',route:'oral',quantity:1,instructions:'Synthetic training only'}}}});
      await tx.labOrder.create({data:{facilityId,visitId:visit.id,practitionerId:practitioner.id,orderNo:prefix,clinicalNote:'Synthetic test order',items:{create:{testId:test.id,testNameAtTime:test.name,status:'ordered'}}}});
      await tx.invoice.create({data:{facilityId,patientId:patient.id,visitId:visit.id,panelId:i%2===0?panel.id:null,invoiceNo:prefix,status:'issued',subtotal:'500',total:'500',createdBy:admin.id,items:{create:{refType:'service',refId:svc.id,description:svc.name,unitPrice:'500',total:'500'}}}});
      await tx.auditLog.create({data:{facilityId,userId:admin.id,action:'create',entity:'SyntheticDemoBundle',entityId:patient.id,after:{seed:CODE,index:i,synthetic:true}}});
    },{timeout:30000});
    let centre=await db.financeCostCentre.findFirst({where:{...where,code:prefix}});
    if(!centre) centre=await run(()=>payables.centre(auth,{code:prefix,name:'DEMO Cost centre '+n,idempotencyKey:key('centre'+n)}));
    let supplier=await db.financeSupplier.findFirst({where:{...where,reference:prefix}});
    if(!supplier) supplier=await run(()=>ops.createSupplier(auth,command('financeSupplierInputSchema','supplier'+n,{name:'DEMO Supplier '+n,reference:prefix,termsDays:30})));
    await run(()=>ops.bill(auth,command('financeBillInputSchema','bill'+n,{date,dueOn:date,supplierId:supplier.id,reference:prefix,memo:'DEMO Supplier bill '+n,expenseAccountId:account('expense'),amount:String(1000+i*100),costCentreId:centre.id})));
    await run(()=>ops.expense(auth,command('financeExpenseInputSchema','expense'+n,{date,memo:'DEMO Expense '+n,expenseAccountId:account('expense'),cashAccountId:account('cash'),amount:'100',costCentreId:centre.id})));
    await run(()=>ledger.createJournal(auth,command('financeJournalInputSchema','journal'+n,{date,memo:'DEMO Manual journal '+n,lines:[{accountId:account('expense'),debit:'50',costCentreId:centre.id},{accountId:account('cash'),credit:'50'}]})));
    await run(()=>payroll.saveEmployee(auth,null,command('payrollEmployeeInputSchema','employee'+n,{code:prefix,name:'DEMO Employee '+n,basic:String(10000+i*1000),costCentreId:centre.id,startsOn:date})));
    await run(()=>assets.create(auth,command('assetInputSchema','asset'+n,{code:prefix,name:'DEMO Equipment '+n,category:'Training equipment',location:'DEMO room '+n,date,cost:'12000',lifeMonths:60,startPeriodId:period.id,cashAccountId:account('cash'),costCentreId:centre.id})));
    await run(()=>assets.budget(auth,command('budgetInputSchema','budget'+n,{periodId:period.id,accountId:account('expense'),costCentreId:centre.id,amount:'20000',expectedVersion:0})));
    let contact=await db.crmContact.findFirst({where:{...where,name:'DEMO Contact '+n}});
    if(!contact) { await run(()=>contacts.create(auth,c.createCrmContactSchema.parse({name:'DEMO Contact '+n,phone:'',altPhone:'',email:'demo'+n+'@example.invalid',language:'en',preferredChannel:'call',safeInstructions:'Synthetic contact — do not contact',doNotContact:true,archived:false,duplicateReviewed:true}))); contact=await db.crmContact.findFirstOrThrow({where:{...where,name:'DEMO Contact '+n}}); }
    await run(()=>leads.create(auth,command('createCrmLeadSchema','lead'+n,{title:'DEMO Service enquiry '+n,contactId:contact.id,ownerId:admin.id,serviceInterest:'Service information',needsConfirmed:false,serviceMatched:false,qualificationNotes:'Synthetic enquiry',source:c.CRM_LEAD_SOURCES[(i-1)%c.CRM_LEAD_SOURCES.length],sourceDetail:'Test fixture',duplicateReviewed:true})));
    const lead=await db.crmLead.findFirstOrThrow({where:{...where,title:'DEMO Service enquiry '+n}});
    // Read existing calls before generating date-dependent command inputs on a rerun.
    let interaction=await db.crmInteraction.findFirst({where:{...where,leadId:lead.id,kind:'call'}});
    if(!interaction) {
      await run(()=>calls.create(auth,command('createCrmCallSchema','call'+n,{leadId:lead.id,contactId:contact.id,linkId:null,purpose:'enquiry',direction:'inbound',state:'answered',occurredAt:new Date(now.getTime()-600000).toISOString(),endedAt:new Date(now.getTime()-300000).toISOString(),callerPhone:'',summary:'DEMO Information request '+n,outcome:'information_given',nextAction:'none',actionNote:'',relatedCallId:null})));
      interaction=await db.crmInteraction.findFirstOrThrow({where:{...where,leadId:lead.id,kind:'call'}});
    }
    if(!await db.crmTask.findFirst({where:{...where,interactionId:interaction.id}})) await run(()=>tasks.create(auth,command('createCrmTaskSchema','task'+n,{interactionId:interaction.id,prescriptionId:null,ownerId:admin.id,title:'DEMO Review enquiry '+n,notes:'Internal training task; do not contact',dueAt:new Date(now.getTime()+(i-4)*86400000).toISOString(),reminderAt:new Date(now.getTime()+(i-4)*86400000-3600000).toISOString(),priority:['low','normal','high','urgent'][i%4]})));
    console.log('Prepared demo bundle '+n);
  }
  await run(()=>payroll.calculate(auth,command('payrollCalculateSchema','payroll-run',{periodId:period.id,date,adjustments:[]})));
  // Domain payment service also emits invoice snapshots for revenue recognition.
  for (const invoice of await db.invoice.findMany({where,orderBy:{invoiceNo:'asc'}})) {
    await run(()=>payments.pay(facilityId,admin.id,invoice.id,command('recordPaymentRequestSchema','payment'+invoice.invoiceNo,{amount:'200',method:'cash',reference:'DEMO payment'})));
  }
  const sync=await run(()=>ops.sync(auth));
  if(sync.failures?.length) throw Error('Demo revenue synchronization failed: '+JSON.stringify(sync.failures));
  // Keep operational drafts to test review; post only revenue/payment and manual
  // samples through a distinct reviewer so reports have actual balances.
  const reviewer={...auth,userId:users.find(u=>u.username==='demo_reviewer').id,username:'demo_reviewer'};
  const samples=await db.financeJournal.findMany({where:{...where,status:'draft',OR:[{sourceType:'hospital'},{sourceType:'manual'}]}});
  for(const j of samples) await requestContext.run(reviewer,()=>ledger.postJournal(reviewer,j.id,{expectedVersion:j.version,idempotencyKey:key('post'+j.id)}));
  const models=['patient','appointment','visit','prescription','labOrder','invoice','panel','financeSupplier','financeBill','financeJournal','payrollEmployee','payrollItem','financeAsset','financeBudget','crmContact','crmLead','crmInteraction','crmCall','crmTask'];
  const counts={};
  for(const model of models) counts[model]=await db[model].count({where:['prescription'].includes(model)?{visit:{facilityId}}:where});
  counts.payment=await db.payment.count({where:{invoice:{facilityId}}});
  for(const model of models.filter(m=>!['visit','financeJournal'].includes(m))) if(counts[model]!==10) throw Error('Unexpected demo count: '+model+'='+counts[model]);
  for(const model of ['position','employee','employeeDocument','credential','credentialReminder','attendanceDay','leaveType','leaveRequest','hrHoliday','shiftType','rosterEntry','hrNotification']) counts[model]=await db[model].count({where});
  const report={facility:facility.name,facilityCode:CODE,createdAt:now.toISOString(),counts,notes:['All records are synthetic.','Manual and billing journals are posted by a separate demo reviewer; other finance entries remain drafts.','HR fixtures include staffing coverage, attendance, leave, credentials, documents, roster and notifications.','IPD admissions and radiology workflows are not implemented; no fabricated records for them.','Reports read the linked clinical, HR and finance records.']};
  fs.writeFileSync('.test-runtime/demo-manifest.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(async()=>{await app?.close();await db.$disconnect()});
