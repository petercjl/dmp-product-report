import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {collect} from '../src/workflow.mjs';
test('collection keeps buyer product metadata separate from merchant DMP endpoint, and records buyer stops before DMP calls',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dmp-role-')),entry=path.join(tmp,'provider.mjs'),log=path.join(tmp,'calls.jsonl');
 const oldEntry=process.env.DMP_REPORT_TBCLI_ENTRY,oldLog=process.env.ROLE_TEST_LOG;
 fs.writeFileSync(entry,`import fs from 'node:fs';
 const args=process.argv.slice(2),cmd=args.slice(0,2).join(' '),get=k=>args[args.indexOf(k)+1];
 if(cmd==='dmp catalog'){console.log(JSON.stringify({snapshot:{version:2,subjectMode:'target-only'}}));}
 else if(args[0]==='capabilities'){console.log(JSON.stringify({itemSummary:{version:1}}));}
 else {
 fs.appendFileSync(process.env.ROLE_TEST_LOG,JSON.stringify(args)+'\\n');
 const itemId=get('--item-id'),out=get('--out');let raw;
 if(cmd==='item summary'){
  if(get('--browser-role')!=='buyer'||get('--cdp-url')!=='http://127.0.0.1:9224')throw Error('wrong buyer');
  raw={schemaVersion:1,summaryVersion:1,command:'item summary',browserRole:'buyer',itemId,status:itemId==='999'?'stopped':'partial',product:{itemId,title:'Fixture',mainImages:[],shop:{}},source:{}};
 } else if(cmd==='dmp snapshot'){
  if(get('--browser-role')!=='merchant'||get('--cdp-url')!=='http://127.0.0.1:9223')throw Error('wrong merchant');
  raw={snapshotVersion:2,itemId,subject:{mode:'target-only',itemId},period:{startDate:get('--start-date'),endDate:get('--end-date')},modules:{}};
 }else throw Error('unknown command');
 fs.writeFileSync(out,JSON.stringify(raw),{flag:'wx'});console.log('{}');if(raw.status==='stopped')process.exitCode=1;
 }
 `,{flag:'wx'});
 process.env.DMP_REPORT_TBCLI_ENTRY=entry;process.env.ROLE_TEST_LOG=log;
 try{
  const out=path.join(tmp,'run');await collect({itemId:'123',asOf:'2026-10-26',outDir:out,cdpUrl:'http://127.0.0.1:9223',buyerCdpUrl:'http://127.0.0.1:9224'});
  const calls=fs.readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);assert.equal(calls.length,13);assert.deepEqual(calls[0].slice(0,2),['item','summary']);assert.ok(calls[0].includes('buyer'));assert.equal(calls[0].includes('--anchor-id'),false);assert.ok(calls.slice(1).every(a=>a.includes('merchant')));assert.ok(calls.every(a=>!a.includes('--anchor-id')));assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(path.join(out,'plan.json'))),'anchorId'),false);assert.equal(JSON.parse(fs.readFileSync(path.join(out,'product.json'))).source.capability,'tbcli item summary');
  const stopped=path.join(tmp,'stopped');await assert.rejects(collect({itemId:'999',asOf:'2026-10-26',outDir:stopped,cdpUrl:'http://127.0.0.1:9223',buyerCdpUrl:'http://127.0.0.1:9224'}),/PRODUCT_COLLECTION_STOPPED/);assert.equal(JSON.parse(fs.readFileSync(path.join(stopped,'stopped.json'))).browserRole,'buyer');
 }finally{
  if(oldEntry===undefined)delete process.env.DMP_REPORT_TBCLI_ENTRY;else process.env.DMP_REPORT_TBCLI_ENTRY=oldEntry;
  if(oldLog===undefined)delete process.env.ROLE_TEST_LOG;else process.env.ROLE_TEST_LOG=oldLog;
  fs.rmSync(tmp,{recursive:true,force:true});
 }
});
