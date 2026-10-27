const fs=require('node:fs');
process.loadEnvFile('apps/api/.env');
const {PrismaClient}=require('../apps/api/node_modules/@prisma/client');
const db=new PrismaClient();
const credentials=JSON.parse(fs.readFileSync('.test-runtime/demo-credentials.json','utf8'));
async function main(){
 const facility=await db.facility.findUniqueOrThrow({where:{code:'AXON_DEMO_10'}});
 const base='http://127.0.0.1:3000';
 for(const username of [...new Set([...credentials.users,...(credentials.hrUsers??[])])]){
  const response=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:credentials.password})});
  if(!response.ok) throw Error(username+' login: '+response.status);
  const session=await response.json();
  if(session.user.facilityId!==facility.id)throw Error('Wrong login facility');
  if(username==='demo_admin'){
   for(const endpoint of ['/finance','/finance/assets','/finance/payroll','/crm/contacts','/crm/leads','/crm/calls','/crm/tasks?owner=all','/facility-modules']){
    const result=await fetch(base+endpoint,{headers:{Authorization:'Bearer '+session.accessToken}});
    if(!result.ok)throw Error(endpoint+': '+result.status);
    const data=await result.json();
    if(endpoint.startsWith('/crm/') && data.total!==10)throw Error(endpoint+' count '+data.total);
    console.log(endpoint+' verified'+(data.total?' ('+data.total+' records)':''));
   }
   const today=new Date().toISOString().slice(0,10), nextWeek=new Date(Date.now()+6*86400000).toISOString().slice(0,10);
   const hrChecks=[
    ['/employees',10],['/hr/positions',5],['/hr/credentials',10],['/hr/leave-types',4],
    ['/hr/leave-requests',3],['/hr/shift-types',3],
    ['/hr/attendance?date='+today,10],['/hr/roster?from='+today+'&to='+nextWeek,70],
    ['/hr/roster-warnings?from='+today+'&to='+nextWeek,1],['/hr/config',1],
   ];
   for(const [endpoint,minimum] of hrChecks){
    const result=await fetch(base+endpoint,{headers:{Authorization:'Bearer '+session.accessToken}});
    if(!result.ok)throw Error(endpoint+': '+result.status);
    const data=await result.json(), count=Array.isArray(data)?data.length:(data.total??data.items?.length??1);
    if(count<minimum)throw Error(endpoint+' count '+count+'; expected at least '+minimum);
    console.log(endpoint+' verified ('+count+' records)');
   }
  }
  await fetch(base+'/auth/logout',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.accessToken},body:JSON.stringify({refreshToken:session.refreshToken})});
  console.log(username+' login verified');
 }
 const journals=await db.financeJournal.findMany({where:{facilityId:facility.id},include:{lines:true}});
 for(const j of journals){
  const {Decimal}=require('../apps/api/node_modules/@prisma/client').Prisma;
  const balance=j.lines.reduce((s,l)=>s.add(l.baseDebit).sub(l.baseCredit),new Decimal(0));
  if(!balance.isZero())throw Error('Unbalanced demo journal');
 }
 console.log(journals.length+' balanced journals; '+journals.filter(j=>j.status==='posted').length+' posted');
 const web=await fetch('http://127.0.0.1:5173/login');
 if(!web.ok)throw Error('Web app unavailable');
 console.log('Web app ready');
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
