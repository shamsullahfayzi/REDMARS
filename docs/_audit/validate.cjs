const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const d=JSON.parse(fs.readFileSync('docs/_audit/enriched.json','utf8'));
const primary=['00-README.md','01-system-overview.md','02-initial-setup-runbook.md','03-dependency-matrix.md','04-workflows.md','05-production-operations.md','06-gap-and-issue-report.md','07-permission-matrix.md','_inventory.md'].map(p=>'docs/'+p);
const roles=d.roles.map(r=>'docs/roles/'+r.code.replaceAll('_','-')+'.md');
const audit=fs.readdirSync('docs/_audit').filter(n=>n.endsWith('.md')&&n!=='validation-report.md').map(n=>'docs/_audit/'+n);
const files=[...primary,...roles,...audit],errors=[],checks=[];
const ok=(name,pass,detail)=>{checks.push({name,status:pass?'PASS':'FAIL',detail});if(!pass)errors.push(name);};
ok('Required documents',primary.every(p=>fs.existsSync(p))&&roles.every(p=>fs.existsSync(p)),primary.length+' main/inventory files and '+roles.length+' role files');
let citations=0,links=0,diagrams=[];
for(const file of files){if(!fs.existsSync(file))continue;const text=fs.readFileSync(file,'utf8');
 for(const m of text.matchAll(/((?:apps|packages|output|scripts|docs)\/[A-Za-z0-9_./-]+\.(?:tsx?|prisma|md|sh|yml|json|cjs|ts|example)):(\d+)/g)){citations++;const p=m[1],n=+m[2];if(!fs.existsSync(p)||n<1||n>fs.readFileSync(p,'utf8').split('\n').length)errors.push('Invalid citation '+file+' -> '+m[0]);}
 for(const m of text.matchAll(/\]\(([^)]+)\)/g)){const target=m[1];if(/^(https?:|#)/.test(target))continue;links++;const p=path.resolve(path.dirname(file),target.split('#')[0]);if(!fs.existsSync(p))errors.push('Broken link '+file+' -> '+target);}
 for(const m of text.matchAll(/```mermaid\s*\n([\s\S]*?)```/g))diagrams.push({file,code:m[1].trim()});
 if(roles.includes(file)){for(let i=1;i<=12;i++)if(!new RegExp('^## '+i+'\\. ','m').test(text))errors.push('Missing role section '+i+' in '+file);}
 const fences=(text.match(/^```/gm)||[]).length;if(fences%2)errors.push('Unpaired code fence '+file);
}
ok('Citations and internal file links',!errors.some(e=>/Invalid citation|Broken link/.test(e)),citations+' source citations; '+links+' local links; heading fragments require reader review');
ok('Twelve-section role template',!errors.some(e=>e.startsWith('Missing role section')),'All role files checked');
const allRoleText=roles.map(p=>fs.readFileSync(p,'utf8')).join('\n');
ok('Every inventoried interactive location in a role action table',d.actions.every(a=>allRoleText.includes('| '+a.id+' ')),d.actions.length+' action IDs; '+d.actions.filter(a=>a.isButton).length+' button sites; repeated runtime rows not counted individually');
ok('Every permission in generated matrix',Object.keys(d.permissions).every(p=>fs.readFileSync('docs/07-permission-matrix.md','utf8').includes('| '+p+' |')),Object.keys(d.permissions).length+' permission rows; '+d.roles.length+' role columns');
ok('HTTP metadata coverage',d.endpoints.every(e=>e.public||e.permission),d.endpoints.length+' HTTP handlers public or permission-decorated; semantic authorization not tested');
const roleCodes=new Set(d.roles.map(r=>r.code)),navCodes=new Set(d.nav.flatMap(n=>n.roles));
ok('Navigation role names exist', [...navCodes].every(c=>roleCodes.has(c)),'Unknown nav roles: '+[...navCodes].filter(c=>!roleCodes.has(c)).join(', '));
ok('Inspected application sources unchanged',d.files.every(f=>crypto.createHash('sha256').update(fs.readFileSync(f.path,'utf8')).digest('hex')===f.sha256),'SHA-256 compared for all '+d.files.length+' inspected source files');
ok('Code fence balance',!errors.some(e=>e.startsWith('Unpaired code')),'All generated Markdown fences checked');
fs.writeFileSync('docs/_audit/diagrams.json',JSON.stringify(diagrams,null,2)+'\n');
const qaFile='docs/_audit/diagram-results.json';
let diagramResult=fs.existsSync(qaFile)?JSON.parse(fs.readFileSync(qaFile,'utf8')):null;
if(diagramResult&&diagramResult.sourceHash!==crypto.createHash('sha256').update(JSON.stringify(diagrams)).digest('hex'))diagramResult=null;
if(diagramResult)ok('Mermaid parser',diagramResult.failures.length===0,diagramResult.count+' diagrams parsed with Mermaid '+diagramResult.version+'; visual layout not verified');
else checks.push({name:'Mermaid parser',status:'UNVERIFIED',detail:diagrams.length+' fenced diagrams extracted; no matching parser result yet'});
const esc=s=>String(s).replaceAll('|','&#124;').replace(/[\r\n]/g,' ');
let md='# Documentation self-check\n\nDate: 2026-10-31. This report validates documentation structure and source references, not application or hospital behavior.\n\n| Check | Result | Evidence / limitation |\n| --- | --- | --- |\n'+checks.map(c=>'| '+[c.name,c.status,c.detail].map(esc).join(' | ')+' |').join('\n')+'\n';
md+='\n## Coverage and unresolved review\n\n- '+d.files.length+' source files parsed; '+d.models.length+' Prisma models, '+d.endpoints.length+' HTTP handlers, '+d.files.filter(f=>/pages\/.+tsx$/.test(f.path)).length+' pages, '+d.roles.length+' system roles, '+Object.keys(d.permissions).length+' permissions.\n- '+d.actions.length+' interactive JSX locations and '+d.actions.filter(a=>a.isButton).length+' button source locations appear in role tables. This is source-location coverage, not runtime screen-instance coverage.\n- '+d.actions.filter(a=>a.endpoints.length).length+' interactive locations have static endpoint candidates; '+d.actions.filter(a=>a.isButton&&a.endpoints.length).length+' are buttons. Candidate matches require branch/role review; they are not successful request evidence.\n- '+d.actions.filter(a=>a.isButton&&!a.endpoints.length).length+' button locations have no automatically resolved endpoint. Some are local tabs, dialog toggles, navigation, print or delegated form actions; they are not all broken. Their complete semantic trace, role visibility, destructive confirmations and reversal behavior remain **UNVERIFIED** where marked.\n- '+d.validations.length+' exception sites are available as exact source expressions. The main dependency table classifies common setup blockers; the remaining sites need workflow-specific interpretation.\n- Role list in the supplied request was blank. All executable ROLES are covered; no invented HR officer/cashier/lab supervisor security role was added.\n\n## Checks not performed\n\n- No application tests, CI, browser walkthroughs, live database queries, migrations, deployment, account changes, backup activation or new restore/reboot drills were run in this documentation task.\n- No staff UAT, two-week HR pilot, localization sign-off, accountant approval or actual device/printer test occurred.\n- Day-0 sequence was checked against forms/schema/service logic, not executed against an empty database.\n- Architecture and state diagrams simplify the code. Parser success does not establish all business transitions or rendered layout quality.\n- Existing unrelated deleted files and temporary guide sources in Git status were left untouched.\n\n## Failures\n\n'+(errors.length?errors.map(e=>'- '+e).join('\n'):'No documentation structural/reference failures detected.')+'\n\n**Documentation status:** source-based draft with explicit unresolved semantic/action verification. **Production readiness: NOT READY.**\n';
fs.writeFileSync('docs/_audit/validation-report.md',md);
fs.writeFileSync('docs/_audit/validation-results.json',JSON.stringify({date:'2026-10-31',checks,errors,diagrams:diagrams.length},null,2)+'\n');
console.log(JSON.stringify({checks:checks.length,errors:errors.length,citations,links,diagrams:diagrams.length}));
if(errors.length){console.log(errors.slice(0,25).join('\n'));process.exitCode=1;}
