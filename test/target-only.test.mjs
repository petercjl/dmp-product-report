import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {buildReport} from '../src/report-data.mjs';import {finalize} from '../src/finalize.mjs';import {fixture} from './report-data.test.mjs';
import {inspectProvider} from '../src/provider.mjs';import {spawnSync} from 'node:child_process';
function evidence(){const f=fixture();for(const s of f.snapshots){s.snapshotVersion=2;s.subject={mode:'target-only',itemId:s.itemId};delete s.anchorId;for(const m of ['scenes','keywords','crowdRanges'])s.modules[m]={status:'unavailable',reason:'capability-unverified',error:{code:'DMP_INDEPENDENT_ROUTE_UNVERIFIED'},request:null,response:null};}return f;}
test('v2 keeps all report modules and horizons, exposes capability gaps, preserves verified values',()=>{
 const {plan,snapshots}=evidence(),r=buildReport(plan,snapshots);assert.equal(r.capabilityGaps.length,36);assert.deepEqual(Object.keys(r.modules),['metrics','promotion','crowd']);assert.equal(r.modules.metrics.metrics[0].values.near7,5*11.111);assert.equal(r.modules.promotion.periods.length,12);assert.equal(r.modules.crowd.periods.length,12);assert.ok(!JSON.stringify(r).includes('anchorId'));assert.ok(r.warnings.some(x=>x.includes('独立取数')));
 snapshots[0].subject.itemId='999';assert.throws(()=>buildReport(plan,snapshots),/MISMATCH/);
});
test('missing v2 module is a schema failure, never a complete report',()=>{const {plan,snapshots}=evidence();delete snapshots[0].modules.keywords;assert.throws(()=>buildReport(plan,snapshots),/MODULES_INCOMPLETE/);});
test('real final HTML advertises blocked complete analysis, retains all charts and numbered evidence',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dmp-target-only-'));try{
 const {plan,snapshots}=evidence(),r=buildReport(plan,snapshots),a={label:'经营解读',conclusion:'完整分析存在能力缺口。',evidence:['目标商品独立推广查询尚未核实。']},briefs=ms=>Object.fromEntries(ms.map(m=>[m.id,a]));
 const analysis={metricAnalyses:briefs(r.modules.metrics.metrics),crowdAnalyses:briefs(r.modules.crowd.metrics),promotionAnalyses:Object.fromEntries(r.modules.promotion.scenes.map(s=>[s.id,briefs(r.modules.promotion.metrics)])),businessInterpretations:{metrics:a,promotion:a,crowd:a},businessOverview:a};
 const vm=path.join(tmp,'vm.json'),ap=path.join(tmp,'a.json');fs.writeFileSync(vm,JSON.stringify(r));fs.writeFileSync(ap,JSON.stringify(analysis));const output=path.join(tmp,'report.html'),result=finalize({viewmodel:vm,analysis:ap,out:output});assert.equal(result.readyForDelivery,false);assert.equal(result.completion,'blocked-capability');const html=fs.readFileSync(output,'utf8');assert.ok(html.includes('完整竞品分析尚未完成'));assert.equal((html.match(/<iframe\b/g)??[]).length,3);assert.ok(html.includes('目标关键词'));
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('old provider is rejected before collection; parser refuses removed CLI argument',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'provider-contract-'));try{const entry=path.join(tmp,'provider.mjs');fs.writeFileSync(entry,`console.log(JSON.stringify(process.argv[2]==='dmp'?{snapshot:{version:1}}:{itemSummary:{version:1}}));`);assert.equal(inspectProvider({exe:process.execPath,prefix:[entry]}).ok,false);}finally{fs.rmSync(tmp,{recursive:true,force:true});}

 const result=spawnSync(process.execPath,['bin/dmp-product-report.mjs','run','--item-id','123','--anchor-id','456','--out-dir','unused'],{cwd:new URL('../',import.meta.url),encoding:'utf8'});assert.equal(result.status,1);assert.ok(result.stderr.includes('INVALID_ARGUMENT'));
});
