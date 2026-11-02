import test from 'node:test';import assert from 'node:assert/strict';
import {estimateDirectRoi} from '../src/estimated-roi.mjs';
import {buildReport,typed} from '../src/report-data.mjs';
import {fixture} from './report-data.test.mjs';import {costFixture} from './channel-costs.test.mjs';
test('ROI interval divides by positive spend and outward labels contain true bounds',()=>{
 const r=estimateDirectRoi(typed('2千~3千'),1635.72);assert.equal(r.lower,2000/1635.72);assert.equal(r.upper,3000/1635.72);
 const [a,b]=r.raw.split('~').map(Number);assert.ok(a<=r.lower&&b>=r.upper);assert.equal(estimateDirectRoi(typed(0),10).value,0);
 for(const x of [0,null,undefined,-1,Infinity])assert.equal(estimateDirectRoi(typed(10),x).kind,'missing');
 assert.equal(estimateDirectRoi(typed(null),10).kind,'missing');
});
test('ROI uses complete matching channel, preserves platform source and keeps partial spend unknown',()=>{
 const {plan,snapshots}=fixture();plan.channelCostsVersion=1;for(const s of snapshots)s.modules.scenes={status:'returned',response:{body:{info:{ok:true},data:[{sceneId:435,sceneName:'货品全站推',directDealAmount:{succItemValue:'100~200'},directRoi:{succItemValue:'0~10'}}]}}};
 const raw=plan.periods.map(p=>costFixture(p));const r=buildReport(plan,snapshots,raw);assert.equal(r.modules.promotion.periods[0].values.estimatedDirectRoi.s435.lower,100/70);assert.equal(r.modules.promotion.periods[0].platformDirectRoi.s435.raw,'0~10');assert.equal(r.modules.promotion.periods[0].values.directRoi,undefined);
 raw[0].items[0].costs.daily.pop();assert.equal(buildReport(plan,snapshots,raw).modules.promotion.periods[0].values.estimatedDirectRoi.s435.kind,'missing');
 const old=buildReport(fixture().plan,snapshots);assert.ok(old.modules.promotion.metrics.some(m=>m.id==='directRoi'));
});
