import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {collect} from '../src/workflow.mjs';
test('collection keeps buyer product metadata separate from merchant DMP endpoint, and records buyer stops before DMP calls',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dmp-role-')),entry=path.join(tmp,'provider.mjs'),log=path.join(tmp,'calls.jsonl');
 const oldEntry=process.env.DMP_REPORT_TBCLI_ENTRY,oldLog=process.env.ROLE_TEST_LOG;
 fs.writeFileSync(entry,`import fs from 'node:fs';
 const args=process.argv.slice(2),cmd=args.slice(0,2).join(' '),get=k=>args[args.indexOf(k)+1];
 if(cmd==='dmp catalog'){console.log(JSON.stringify({commands:['dmp report','dmp audience'],audience:{version:1,days:[7,15,30,90],types:{purchase:{},browse:{},favorite:{},cart:{},search:{}},dimensions:['gender','age','consumption','city','segments'].map(id=>({id}))},endpoints:{costs:{unit:'CNY',fields:{keyword:'关键词',wholeSite:'全站',audience:'人群',content:'内容',leads:'线索'}}},snapshot:{version:2,subjectMode:'target-only'}}));}
 else if(args[0]==='version'){console.log(JSON.stringify({version:'0.13.0-dev.0'}));}
 else if(args[0]==='capabilities'){console.log(JSON.stringify({itemSummary:{version:1}}));}
 else {
 fs.appendFileSync(process.env.ROLE_TEST_LOG,JSON.stringify(args)+'\\n');
 const itemId=get('--item-id'),out=get('--out');let raw;
 if(cmd==='item summary'){
  if(get('--browser-role')!=='buyer'||get('--cdp-url')!=='http://127.0.0.1:9224')throw Error('wrong buyer');
  raw={schemaVersion:1,summaryVersion:1,command:'item summary',browserRole:'buyer',itemId,status:itemId==='999'?'stopped':'partial',product:{itemId,title:'Fixture',mainImages:[],shop:{}},source:{}};
 } else if(cmd==='dmp snapshot'){
  if(get('--browser-role')!=='merchant'||get('--cdp-url')!=='http://127.0.0.1:9223')throw Error('wrong merchant');
  raw={status:'complete',executionContext:{status:'selected',itemId:'456'},snapshotVersion:2,itemId,subject:{mode:'target-only',itemId},period:{startDate:get('--start-date'),endDate:get('--end-date')},modules:{}};
 }else if(cmd==='dmp audience'){if(get('--browser-role')!=='merchant'||get('--days')!=='30'||args.includes('--anchor-id'))throw Error('portrait mismatch');raw={audienceVersion:1,itemId,audienceType:get('--audience-type'),period:{type:'rolling',days:30},status:'complete',dimensions:[]};}else if(cmd==='dmp report'){if(get('--anchor-id')!=='456'||get('--browser-role')!=='merchant')throw Error('context mismatch');raw={status:'partial',period:{startDate:get('--start-date'),endDate:get('--end-date')},items:[{itemId,costs:{unit:'CNY',status:'unavailable',daily:[]}}]};}else throw Error('unknown command');
 fs.writeFileSync(out,JSON.stringify(raw),{flag:'wx'});console.log('{}');if(raw.status==='stopped')process.exitCode=1;
 }
 `,{flag:'wx'});
 process.env.DMP_REPORT_TBCLI_ENTRY=entry;process.env.ROLE_TEST_LOG=log;
 try{
  const out=path.join(tmp,'run');await collect({itemId:'123',asOf:'2026-10-26',outDir:out,cdpUrl:'http://127.0.0.1:9223',buyerCdpUrl:'http://127.0.0.1:9224'});
  const calls=fs.readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);assert.equal(calls.length,30);assert.deepEqual(calls[0].slice(0,2),['item','summary']);assert.ok(calls[0].includes('buyer'));assert.equal(calls[0].includes('--anchor-id'),false);assert.ok(calls.slice(1).every(a=>a.includes('merchant')));assert.ok(calls.filter(a=>a[1]==='snapshot').every(a=>!a.includes('--anchor-id')));assert.equal(calls.filter(a=>a[1]==='report'&&a.includes('--anchor-id')).length,12);assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(path.join(out,'plan.json'))),'anchorId'),false);assert.equal(JSON.parse(fs.readFileSync(path.join(out,'product.json'))).source.capability,'tbcli item summary');
  const stopped=path.join(tmp,'stopped');await assert.rejects(collect({itemId:'999',asOf:'2026-10-26',outDir:stopped,cdpUrl:'http://127.0.0.1:9223',buyerCdpUrl:'http://127.0.0.1:9224'}),/PRODUCT_COLLECTION_STOPPED/);assert.equal(JSON.parse(fs.readFileSync(path.join(stopped,'stopped.json'))).browserRole,'buyer');
 }finally{
  if(oldEntry===undefined)delete process.env.DMP_REPORT_TBCLI_ENTRY;else process.env.DMP_REPORT_TBCLI_ENTRY=oldEntry;
  if(oldLog===undefined)delete process.env.ROLE_TEST_LOG;else process.env.ROLE_TEST_LOG=oldLog;
  fs.rmSync(tmp,{recursive:true,force:true});
 }
});
