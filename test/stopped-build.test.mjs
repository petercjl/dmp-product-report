import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {fixture} from './report-data.test.mjs';import {build} from '../src/workflow.mjs';
test('stopped collection renders acquired periods without manufacturing remaining source evidence',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmp-stopped-build-'));
 try{
  fs.mkdirSync(path.join(dir,'evidence'));const {plan,snapshots}=fixture();plan.itemId='123';plan.channelCostsVersion=1;
  fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify(plan));fs.writeFileSync(path.join(dir,'stopped.json'),JSON.stringify({failed:'prior7'}));
  fs.writeFileSync(path.join(dir,'evidence/near7.json'),JSON.stringify(snapshots[0]));
  const result=build({runDir:dir});assert.equal(result.status,'partial');assert.equal(result.readyForDelivery,false);
  const r=JSON.parse(fs.readFileSync(path.join(dir,'report.ViewModel.json')));assert.equal(r.modules.metrics.metrics[0].values.near7,5*11.111);assert.equal(r.modules.metrics.metrics[0].values.prior7,null);assert.equal(r.coverage[1].modules.metrics7,'unavailable');assert.equal(fs.existsSync(path.join(dir,'evidence/prior7.json')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
