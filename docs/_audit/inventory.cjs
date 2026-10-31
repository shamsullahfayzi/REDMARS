/* Documentation-only static inventory. Run from repository root with node. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const ts = require('../../apps/api/node_modules/typescript');
const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const walk = p => fs.readdirSync(p, {withFileTypes:true}).flatMap(d => d.isDirectory() ? walk(path.join(p,d.name)) : [path.join(p,d.name)]);
const files = [...walk('apps/web/src'), ...walk('apps/api/src'), ...walk('apps/api/prisma'), ...walk('packages/shared/src')].map(p=>p.replaceAll('\\','/')).filter(p=>/\.(tsx?|prisma)$/.test(p));
const esc = s => String(s ?? '').replaceAll('|','&#124;').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim();
const table = (heads, rows) => '| '+heads.join(' | ')+' |\n| '+heads.map(()=>'---').join(' | ')+' |\n'+rows.map(r=>'| '+r.map(esc).join(' | ')+' |').join('\n')+'\n';
const compiled = p => ts.transpileModule(read(p), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function exportsOf(p,req) {const e={};vm.runInNewContext(compiled(p),{exports:e,require:req});return e;}
const perms=exportsOf('apps/api/src/auth/permissions.ts');
const nav=exportsOf('apps/web/src/auth/nav.ts',()=>({}));
const en=JSON.parse(read('apps/web/src/i18n/locales/en.json'));
const prs=JSON.parse(read('apps/web/src/i18n/locales/prs.json'));
const tr=(key,obj=en)=>key.split('.').reduce((a,k)=>a?.[k],obj);
const data={date:'2026-10-31',files:[],roles:perms.ROLES,permissions:perms.PERMISSION_MATRIX,nav:nav.NAV_ITEMS,endpoints:[],actions:[],apiCalls:[],validations:[],functions:[],imports:{},models:[],enums:[],routes:[],env:[]};
function decorators(n){return ts.canHaveDecorators(n)?(ts.getDecorators(n)||[]):[];}
function dec(n,name){return decorators(n).find(d=>ts.isCallExpression(d.expression)&&d.expression.expression.getText()===name)?.expression;}
for(const p of files){
 const source=read(p);data.files.push({path:p,lines:source.split('\n').length,sha256:crypto.createHash('sha256').update(source).digest('hex')});
 if(p.endsWith('.prisma')){for(const m of source.matchAll(/^(model|enum)\s+(\w+)\s*\{([\s\S]*?)^\}/gm)){const row={name:m[2],line:source.slice(0,m.index).split('\n').length,file:p,body:m[3]};data[m[1]==='model'?'models':'enums'].push(row);}continue;}
 const sf=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true,p.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const line=n=>sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1;
 const loc=n=>`${p}:${line(n)}`;
 data.imports[p]=[];
 function fnName(n){if(n.name)return n.name.getText(sf);if(ts.isVariableDeclaration(n.parent))return n.parent.name.getText(sf);return '(inline)';}
 function owner(n){let q=n.parent;while(q){if(ts.isFunctionDeclaration(q)||ts.isMethodDeclaration(q)||ts.isArrowFunction(q)||ts.isFunctionExpression(q)){if(fnName(q)!=='(inline)')return q;}q=q.parent;}return null;}
 function scan(n){
  if(ts.isImportDeclaration(n))data.imports[p].push({module:n.moduleSpecifier.text,text:n.importClause?.getText(sf)||'',source:loc(n)});
  if((ts.isFunctionDeclaration(n)||ts.isMethodDeclaration(n)||ts.isArrowFunction(n))&&fnName(n)!=='(inline)')data.functions.push({file:p,name:fnName(n),source:loc(n),text:n.getText(sf)});
  if(ts.isClassDeclaration(n)&&dec(n,'Controller')){
   const prefix=dec(n,'Controller').arguments[0]?.text||'';
   for(const m of n.members){if(!ts.isMethodDeclaration(m))continue;for(const verb of ['Get','Post','Put','Patch','Delete','Head','Options']){const d=dec(m,verb);if(!d)continue;
    const permission=dec(m,'RequirePermission')||dec(n,'RequirePermission');
    const module=dec(m,'RequiresModule')||dec(n,'RequiresModule');
    data.endpoints.push({method:verb.toUpperCase(),path:('/'+prefix+'/'+(d.arguments[0]?.text||'')).replace(/\/$/,'' )||'/',controller:n.name.text,handler:m.name.getText(sf),permission:permission?.arguments[0]?.text||null,module:module?.arguments[0]?.text||null,public:!!(dec(m,'Public')||dec(n,'Public')),auditRead:dec(m,'AuditRead')?.getText(sf)||'',source:loc(m),body:m.body?.getText(sf)||''});
   }}
  }
  if(ts.isCallExpression(n)){
   const callee=n.expression.getText(sf);
   if(/^api(Get|Post|Put|Patch|Delete|Download|Upload)$/.test(callee)||/^api\.(get|post|put|patch|delete)$/.test(callee))data.apiCalls.push({file:p,source:loc(n),callee,path:n.arguments[0]?.getText(sf),owner:owner(n)?fnName(owner(n)):'(module)',text:n.getText(sf)});
  }
  if(ts.isNewExpression(n)&&/Exception$/.test(n.expression.getText(sf)))data.validations.push({file:p,source:loc(n),type:n.expression.getText(sf),owner:owner(n)?fnName(owner(n)):'',message:n.arguments?.map(a=>a.getText(sf)).join(', ')||''});
  if(ts.isPropertyAssignment(n)&&n.name.getText(sf)==='path'&&p.endsWith('router.tsx'))data.routes.push({path:n.initializer.text,source:loc(n),declaration:n.parent.getText(sf)});
  if(ts.isPropertyAccessExpression(n)&&n.expression.getText(sf)==='process.env')data.env.push({name:n.name.text,source:loc(n)});
  if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){
   const tag=n.tagName.getText(sf);const attrs={};for(const a of n.attributes.properties)if(ts.isJsxAttribute(a))attrs[a.name.getText(sf)]=a.initializer?.getText(sf)||'true';
   const events=Object.keys(attrs).filter(k=>/^on[A-Z]/.test(k));
   const clickTag=/^(Button|button|Link|NavLink|a|form|Switch|input|Input|Select|select|textarea|Textarea|CodePicker)$/.test(tag);
   if(events.length||clickTag){
    const parent=ts.isJsxElement(n.parent)?n.parent:null;
    const child=parent?parent.children.map(c=>c.getText(sf)).join(' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim():'';
    const raw=attrs['aria-label']||attrs.title||child||attrs.placeholder||attrs.id||tag;
    const keys=[...raw.matchAll(/\bt\(['"]([^'"]+)['"]/g)].map(m=>m[1]);
    const label=keys.length?keys.map(k=>tr(k)||`⚠️ ${k}`).join(' / '):raw;
    const o=owner(n);let context=n.parent;const guards=[];for(let depth=0;context&&depth<12;depth++,context=context.parent){if(ts.isConditionalExpression(context)||ts.isBinaryExpression(context)&&context.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken)guards.push(context.getText(sf).slice(0,240));}
    let form=n.parent,formSubmit='';while(form){if(ts.isJsxElement(form)&&form.openingElement.tagName.getText(sf)==='form'){const a=form.openingElement.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(sf)==='onSubmit');formSubmit=a?.initializer?.getText(sf)||'';break;}form=form.parent;}
    data.actions.push({id:'A'+String(data.actions.length+1).padStart(4,'0'),file:p,source:loc(n),tag,label,raw,keys,dari:keys.map(k=>tr(k,prs)||'⚠️').join(' / '),owner:o?fnName(o):'(module)',events:Object.fromEntries(events.map(k=>[k,attrs[k]])),formSubmit,disabled:attrs.disabled||'No explicit disabled attribute',target:attrs.to||attrs.href||'',type:attrs.type||'',guards});
   }
  }
  ts.forEachChild(n,scan);
 }
 scan(sf);
}
const pfile='apps/api/src/auth/permissions.ts',ptext=read(pfile);
data.permissionSources=Object.fromEntries(Object.keys(data.permissions).map(k=>[k,`${pfile}:${ptext.slice(0,ptext.indexOf("'"+k+"':")).split('\n').length}`]));
fs.mkdirSync('docs/_audit',{recursive:true});
const safeData={...data,functions:data.functions.map(({text,...f})=>f),endpoints:data.endpoints.map(({body,...e})=>e)};
fs.writeFileSync('docs/_audit/inventory.json',JSON.stringify(safeData,null,2)+'\n');
let md='# Static source inventory\n\nSnapshot: 2026-10-31. Generated by `docs/_audit/inventory.cjs`; source hashes are in `_audit/inventory.json`. This is source inspection, not a running-system or hospital acceptance test. Controls rendered by loops count once per source location, not once per patient/row. Inputs and form submissions are included separately from buttons.\n\n';
md+='## Counts\n\n'+table(['Category','Count'],[['System roles',data.roles.length],['Matrix permissions',Object.keys(data.permissions).length],['Prisma models',data.models.length],['Prisma enums',data.enums.length],['Controller files',new Set(data.endpoints.map(e=>e.source.split(':')[0])).size],['HTTP handlers',data.endpoints.length],['Frontend route declarations',data.routes.length],['Page files',data.files.filter(f=>/pages\/.+tsx$/.test(f.path)).length],['JSX interactive source sites',data.actions.length],['API call sites',data.apiCalls.length],['Exception sites',data.validations.length]]);
md+='\n## Roles\n\n'+table(['Code','Name','Description'],data.roles.map(r=>[r.code,r.name,r.description]));
md+='\n## Frontend routes\n\n'+table(['Path declaration (nested routes inherit parent)','Element / redirect','Source'],data.routes.map(r=>[r.path,r.declaration,r.source]));
md+='\n## Navigation\n\n'+table(['Menu key','URL','Roles','Module'],data.nav.map(r=>[r.key,r.to,r.roles.join(', '),r.module||'Core']));
md+='\n## HTTP endpoints\n\nGlobal JWT / permission / module guards apply unless public. Conditional grants require service-layer enforcement. HTTP paths have no inferred API prefix; check `main.ts`.\n\n'+table(['Method','Path','Handler','Permission','Module','Explicit read audit','Source'],data.endpoints.map(e=>[e.method,e.path,`${e.controller}.${e.handler}`,e.public?'PUBLIC':e.permission||'⚠️ Missing metadata',e.module||'Core',e.auditRead||'No method decorator; service may audit',e.source]));
md+='\n## Prisma models and required fields / relations\n\n'+table(['Model','Required scalar fields without defaults','Relations (source syntax)','Source'],data.models.map(m=>[m.name,m.body.split('\n').filter(l=>/^\s+\w+\s+\w+\s/.test(l)&&!/[?\[\]]/.test(l.split('@')[0])&&!/@default|@relation|^\s*\/\//.test(l)).map(l=>l.trim()).join('; '),m.body.split('\n').filter(l=>l.includes('@relation')).map(l=>l.trim()).join('; '),`${m.file}:${m.line}`]));
md+='\n## Enums and declared states\n\n'+table(['Enum','Values','Source'],data.enums.map(e=>[e.name,e.body.replace(/\/\/[^\n]*/g,'').trim(),`${e.file}:${e.line}`]));
md+='\n## Source files inspected by parser\n\n'+table(['Path','Lines','SHA-256'],data.files.map(f=>[f.path,f.lines,f.sha256]));
fs.writeFileSync('docs/_inventory.md',md);
fs.writeFileSync('docs/_audit/api-calls.md','# Frontend API call inventory\n\nLiteral/template call expressions from all frontend files; dynamic path-to-controller matching requires semantic review.\n\n'+table(['Owner','Call','Source'],data.apiCalls.map(a=>[a.owner,a.text,a.source])));
fs.writeFileSync('docs/_audit/validation-messages.md','# Service and controller exception inventory\n\nExact source expressions, including interpolated messages. A thrown exception is not proof that its branch was exercised. Use this to resolve prerequisite errors; never bypass a validation with direct database edits.\n\n'+table(['Owner','Type','Message expression','Source'],data.validations.map(a=>[a.owner,a.type,a.message,a.source])));
const rules={R2:'Restricted clinical read; admin cannot write psychiatric notes',R4:'Preserve original; amendment / no hard deletion',R5:'State, ownership and time-window restrictions',R6:'Pharmacist clinical subset',R7:'Nurse clinical subset',R8:'Task-scoped / operational subset',R9:'Proposal only; nurse sample grant unresolved',R10:'Configured discount ceiling',R11:'Export justification',R12:'Pharmacy origin; excludes lab bills'};
let matrix='# Master permission matrix\n\nExecutable source: `apps/api/src/auth/permissions.ts`. Database grants are seeded copies; inspect deployment drift separately. ✅ = unconditional matrix grant, ❌ = no grant, qualified cells name the rule and are not blanket authority. System roles accumulate; menu visibility is not authorization. Permissions not implemented as endpoints remain policy declarations.\n\n';
matrix+=table(['Permission',...data.roles.map(r=>r.code),'Source'],Object.entries(data.permissions).map(([k,g])=>[k,...data.roles.map(r=>!(r.code in g)?'❌':g[r.code]===null?'✅':`${g[r.code]}: ${rules[g[r.code]]||'⚠️ UNVERIFIED rule'}`),data.permissionSources[k]]));
matrix+='\n## Conditional enforcement\n\n`PermissionsGuard.canActivate` checks presence only; services must enforce the condition. See `_audit/validation-messages.md` and the gap report. Do not interpret R5 as universally “own records only”: cancellation/refund paths have different checks. Role-dependent report and self-service scoping can narrow even an unconditional grant.\n';
fs.writeFileSync('docs/07-permission-matrix.md',matrix);
console.log(JSON.stringify({files:data.files.length,roles:data.roles.length,permissions:Object.keys(data.permissions).length,models:data.models.length,endpoints:data.endpoints.length,pages:data.files.filter(f=>/pages\/.+tsx$/.test(f.path)).length,actions:data.actions.length,apiCalls:data.apiCalls.length,validations:data.validations.length}));
module.exports=data;
