import fs from 'node:fs';
import crypto from 'node:crypto';
// Install isolated optional QA dependencies under docs/_audit/diagram-qa first.
const { JSDOM } = await import('./diagram-qa/node_modules/jsdom/lib/api.js');
const dom=new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window=dom.window;
globalThis.document=dom.window.document;
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const {default:mermaid}=await import('./diagram-qa/node_modules/mermaid/dist/mermaid.core.mjs');
mermaid.initialize({startOnLoad:false,securityLevel:'strict'});
const diagrams=JSON.parse(fs.readFileSync('docs/_audit/diagrams.json','utf8'));
const failures=[];
for(const [i,d] of diagrams.entries()){
 try{await mermaid.parse(d.code);}catch(error){failures.push({index:i,file:d.file,error:error.message});}
}
const result={version:'11.12.0',count:diagrams.length,sourceHash:crypto.createHash('sha256').update(JSON.stringify(diagrams)).digest('hex'),failures};
fs.writeFileSync('docs/_audit/diagram-results.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
if(failures.length)process.exitCode=1;
