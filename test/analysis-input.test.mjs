import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fixture} from './report-data.test.mjs';
import {buildReport} from '../src/report-data.mjs';
import {build,ROOT} from '../src/workflow.mjs';
import {prepareAnalysisInput,analysisTemplate,analysisSchema,compareValues,writeAnalysisInputs} from '../src/analysis-input.mjs';
import {collectAnalysisIssues,schemaIssues} from '../src/analysis-validation.mjs';
import {inspectReportData} from '../src/delivery-validation.mjs';
import {finalize,validateArtifact} from '../src/finalize.mjs';

function sample(){const f=fixture();for(const s of f.snapshots)s.modules.crowdRanges.status='empty';return {...f,report:buildReport(f.plan,f.snapshots)};}
function fill(template,p=''){
 if(template?.conclusion!==undefined){template.conclusion='以已返回原值和周期对照描述经营表现。';template.evidence=['未返回分类保留未知，变化量采用脚本结果。'];template.sourceRefs=[p.startsWith('/promotionAnalyses/')?'promotion:near7':p.startsWith('/crowdAnalyses/')?'crowd:near7':p.startsWith('/audienceAnalyses/')?'audience:'+p.split('/')[2]:'metrics:near7'];return;}
 for(const [k,v] of Object.entries(template))if(v&&typeof v==='object')fill(v,p+'/'+k);
}
test('fixed comparisons distinguish null, zero baseline, percentage points and overlapping bounds',()=>{
 assert.equal(compareValues(null,0).status,'missing');
 assert.equal(compareValues(1,0).status,'zero-baseline');
 assert.equal(compareValues(.2,.1,'percent').change,10);
 assert.equal(compareValues({lower:10,upper:20},{lower:15,upper:25}).direction,'uncertain');
 assert.deepEqual(compareValues({lower:20,upper:30},10).change,{lower:100,upper:200});
});
test('summary excludes image payloads, fixes field order and preserves derived values and source scope',()=>{
 const {report}=sample();report.product={itemId:'123',title:'示例商品',images:[{dataUrl:'data:image/png;base64,'+'A'.repeat(500000)}]};
 const s=prepareAnalysisInput(report);
 assert.equal(s.contract,'dmp-analysis-input@1');assert.equal(s.metrics[0].values.length,12);
 assert.equal(s.metrics[0].values[0],5*11.111);assert.equal(s.salesDrivers.days7.salesDifference,0);
 assert.equal(s.crowdComposition[0].periods[0].shares.itemOld,null);
 assert.equal(s.crowdComposition[0].periods[0].shares.categoryNew,1);
 assert.ok(s.sources['metrics:near7'].evidenceFile.endsWith('near7.json'));
 assert.ok(s.components.some(c=>c.id==='dataCoverage'));
 assert.ok(!JSON.stringify(s).includes('data:image'));assert.ok(JSON.stringify(s).length<JSON.stringify(report).length/3);
 const schema=analysisSchema(report);assert.ok(schema.$defs.brief);assert.ok(JSON.stringify(schema).length<15000);
});
test('one pass lists all analysis repairs, checks source identity and component/source references',()=>{
 const {report}=sample(),a=analysisTemplate(report);
 const blank=collectAnalysisIssues(report,a).issues;
 assert.ok(blank.some(i=>i.path==='/metricAnalyses/sales/conclusion'));
 assert.ok(blank.some(i=>i.path==='/businessOverview/evidence'));
 assert.ok(blank.some(i=>i.path==='/crowdAnalyses/orders/sourceRefs'));
 fill(a);assert.equal(collectAnalysisIssues(report,a).issues.length,0);
 a.inputIdentity.itemId='999';a.metricAnalyses.sales.sourceRefs=['not-a-source'];a.businessOverview.componentRefs=['missingTable'];
 const issues=collectAnalysisIssues(report,a).issues;
 assert.ok(issues.some(i=>i.path==='/inputIdentity/itemId'));
 assert.ok(issues.some(i=>i.path.includes('/sourceRefs')));
 assert.ok(issues.some(i=>i.path.includes('/componentRefs')));
 assert.ok(schemaIssues(analysisSchema(report),a).length>=3);
 const bad=structuredClone(report);bad.sourceHash='bad';bad.plan.itemId='999';bad.modules.metrics.metrics[0].values.near7++;
 const data=inspectReportData(bad);assert.ok(data.issues.some(i=>i.code==='TARGET_ID'));assert.ok(data.issues.some(i=>i.code==='SOURCE_IDENTITY'));assert.ok(data.issues.some(i=>i.code==='SALES_FORMULA'));
});
test('CLI consumes generated contracts and finalizes once with actual coverage component and receipt',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmp-analysis-contract-'));
 try{
  const {report}=sample(),model=path.join(dir,'model.json'),analysis=path.join(dir,'analysis.json'),output=path.join(dir,'final.html');
  fs.writeFileSync(model,JSON.stringify(report));const files=writeAnalysisInputs(report,dir);
  assert.ok(fs.readFileSync(files.files.brief,'utf8').includes('near7'));
  const blank=JSON.parse(fs.readFileSync(files.files.template));fs.writeFileSync(analysis,JSON.stringify(blank));
  let r=spawnSync(process.execPath,[path.join(ROOT,'bin/dmp-product-report.mjs'),'finalize','--viewmodel',model,'--analysis',analysis,'--out',output,'--json'],{encoding:'utf8'});
  assert.equal(r.status,1);const errors=JSON.parse(r.stderr);assert.ok(errors.repairCount>20);assert.ok(!fs.existsSync(output));
  fill(blank);blank.businessOverview.note='数据覆盖见数据覆盖表。';blank.businessOverview.componentRefs=['dataCoverage'];fs.writeFileSync(analysis,JSON.stringify(blank));
  r=spawnSync(process.execPath,[path.join(ROOT,'bin/dmp-product-report.mjs'),'check-analysis','--viewmodel',model,'--analysis',analysis,'--json'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).repairCount,0);
  const result=finalize({viewmodel:model,analysis,out:output});assert.equal(result.readyForDelivery,true);assert.equal(result.next,'deliver-artifacts');assert.deepEqual(result.requiredActions,[]);assert.ok(result.componentRefs.includes('dataCoverage'));
  const html=fs.readFileSync(output,'utf8');assert.ok(html.includes('id="report-data-coverage"'));assert.ok(html.includes('coverage-table'));
  const broken=path.join(dir,'broken.html');fs.writeFileSync(broken,html.replace('id="report-data-coverage"','id="other"'));assert.equal(validateArtifact(broken,report).componentTargetsPresent,false);
  fs.writeFileSync(broken,html.replace('<td>近7天</td>','<td>错误周期</td>'));assert.equal(validateArtifact(broken,report).coverageContentMatches,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('build automatically emits analysis artifacts without a second renderer or collection',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmp-build-summary-'));
 try{
  const {plan,snapshots}=sample();fs.mkdirSync(path.join(dir,'evidence'));fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify(plan));
  plan.periods.forEach((p,i)=>fs.writeFileSync(path.join(dir,'evidence',p.id+'.json'),JSON.stringify(snapshots[i])));
  const result=build({runDir:dir});assert.equal(result.stage,'draft');assert.equal(result.readyForDelivery,false);
  for(const file of Object.values(result.analysisInputs.files))assert.ok(fs.existsSync(file));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
