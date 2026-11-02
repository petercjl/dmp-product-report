import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildReport} from '../src/report-data.mjs';
import {validateReportData} from '../src/delivery-validation.mjs';
import {finalize,validateArtifact} from '../src/finalize.mjs';
import {fixture} from './report-data.test.mjs';
import {costFixture} from './channel-costs.test.mjs';

function complete(){
 const {plan,snapshots}=fixture();
 for(const s of snapshots)s.modules.crowdRanges.status='empty';
 return buildReport(plan,snapshots);
}
function analysis(r){
 const a={label:'经营解读',conclusion:'已返回数据需结合各期对照判断。',evidence:['按各期原值核对，缺失分类保持未知。']};
 const by=ms=>Object.fromEntries(ms.map(m=>[m.id,a]));
 return {metricAnalyses:by(r.modules.metrics.metrics),promotionAnalyses:Object.fromEntries(r.modules.promotion.scenes.map(s=>[s.id,by(r.modules.promotion.metrics)])),crowdAnalyses:by(r.modules.crowd.metrics),businessInterpretations:{metrics:a,promotion:a,crowd:a},businessOverview:a};
}
test('saved target, dates, raw ranges, missing and sales are validated independently of status flags',()=>{
 const r=complete();assert.equal(validateReportData(r).complete,true);
 for(const change of [
  x=>x.plan.itemId='999',
  x=>x.modules.crowd.meta.subject='商品 ID 999',
  x=>x.modules.metrics.periods[0].start='2026-01-01',
  x=>x.modules.metrics.metrics[0].values.near7++,
  x=>x.modules.promotion.periods[0].values.click.unavailable={kind:'range',raw:'1~2',lower:1,upper:20},
  x=>x.modules.crowd.periods[0].values.people.itemOld={kind:'missing',raw:null,value:0},
  x=>x.sourceHash='unverified'
 ]){const bad=structuredClone(r);change(bad);assert.throws(()=>validateReportData(bad),/REPORT_CONTRACT_INVALID/);}
});
test('unknown or failed coverage is partial even when a caller claims complete',()=>{
 for(const change of [r=>delete r.dataStatus,r=>r.coverage[0].modules.scenes='unknown',r=>delete r.coverage[0].modules.metrics7,r=>r.coverage[0].metricsDateVerified=false]){const r=complete();change(r);assert.equal(validateReportData(r).complete,false);}
});
test('channel spend and estimated ROI are recomputed rather than trusted',()=>{
 const {plan,snapshots}=fixture();plan.channelCostsVersion=1;
 for(const s of snapshots)s.modules.crowdRanges.status='empty';
 const r=buildReport(plan,snapshots,plan.periods.map(p=>costFixture(p)));
 assert.equal(validateReportData(r).complete,true);
 for(const change of [
  x=>x.modules.promotion.channelCosts[0].totals.wholeSite++,
  x=>x.modules.promotion.channelCosts[0].daily[0].values.wholeSite++,
  x=>x.modules.promotion.periods[0].values.charge['channel-wholeSite'].value++,
  x=>x.modules.promotion.periods[0].values.estimatedDirectRoi['channel-wholeSite']={kind:'exact',raw:99,value:99}
 ]){const bad=structuredClone(r);change(bad);assert.throws(()=>validateReportData(bad),/REPORT_CONTRACT_INVALID/);}
});
test('finalization completes from files and scripts only; partial reports never become ready',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmp-delivery-'));
 try{
  const r=complete(),model=path.join(dir,'model.json'),a=path.join(dir,'analysis.json');
  fs.writeFileSync(model,JSON.stringify(r));fs.writeFileSync(a,JSON.stringify(analysis(r)));
  const result=finalize({viewmodel:model,analysis:a,out:path.join(dir,'report.html')});
  assert.equal(result.readyForDelivery,true);assert.equal(result.acceptance.browserRequired,false);assert.equal(result.checks.inlineScriptSyntax,true);assert.equal(result.artifactHash.length,64);
  r.coverage[0].modules.scenes='unknown';fs.writeFileSync(model,JSON.stringify(r));
  const partial=finalize({viewmodel:model,analysis:a,out:path.join(dir,'partial.html')});
  assert.equal(partial.readyForDelivery,false);assert.equal(partial.completion,'partial-data');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('nested external assets, invalid JavaScript and mismatched embedded data fail artifact checks',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmp-html-'));
 try{
  const r=complete();fs.writeFileSync(path.join(dir,'model.json'),JSON.stringify(r));fs.writeFileSync(path.join(dir,'analysis.json'),JSON.stringify(analysis(r)));
  const output=path.join(dir,'report.html');finalize({viewmodel:path.join(dir,'model.json'),analysis:path.join(dir,'analysis.json'),out:output});
  const html=fs.readFileSync(output,'utf8'),probe=path.join(dir,'probe.html');
  fs.writeFileSync(probe,html.replace('&lt;/body&gt;','&lt;img src=&quot;https://example.com/p.png&quot;&gt;&lt;/body&gt;'));
  assert.equal(validateArtifact(probe,r).nestedOfflineAssets,false);
  fs.writeFileSync(probe,html.replace('</body>','<script>const = ;</script></body>'));
  assert.equal(validateArtifact(probe,r).inlineScriptSyntax,false);
  const wrong=structuredClone(r);wrong.modules.metrics.metrics[0].values.near7++;
  assert.equal(validateArtifact(output,wrong).embeddedDataMatches,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
