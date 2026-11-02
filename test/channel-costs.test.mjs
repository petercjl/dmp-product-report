import test from 'node:test';
import assert from 'node:assert/strict';
import {channelCosts,channels} from '../src/channel-costs.mjs';
import {buildReport,shift} from '../src/report-data.mjs';
import {fixture} from './report-data.test.mjs';
export function costFixture(p,value=10){
 const daily=[];for(let d=p.start;d<=p.end;d=shift(d,1))daily.push({date:d,values:Object.fromEntries(channels.map(c=>[c.id,c.id==='wholeSite'?value:0])),gmvTrend:999999});
 return {status:'complete',period:{startDate:p.start,endDate:p.end},items:[{itemId:'123',costs:{unit:'CNY',status:'complete',daily,totals:{total:999999},source:{request:{query:{successItemId:'123',startDate:p.start,endDate:p.end}}}}}]};
}
test('recompute daily CNY sums, preserve zero, exclude trend and provider totals',()=>{
 const p={start:'2026-10-01',end:'2026-10-03'},c=channelCosts(costFixture(p,12.34),'123',p);
 assert.equal(c.status,'returned');assert.equal(c.totals.total,37.02);assert.equal(c.totals.keyword,0);assert.ok(!JSON.stringify(c).includes('gmvTrend'));
});
test('missing, duplicate, outside dates, missing channel and unverified unit cannot form complete totals',()=>{
 const p={start:'2026-10-01',end:'2026-10-03'};
 for(const change of [c=>c.daily.pop(),c=>c.daily.push(c.daily[0]),c=>c.daily.push({...c.daily[0],date:'2026-09-30'}),c=>delete c.daily[0].values.keyword,c=>c.unit='unverified',c=>delete c.source.request,c=>c.coverage={missingDates:['2026-10-03']}]){
  const raw=costFixture(p);change(raw.items[0].costs);const c=channelCosts(raw,'123',p);assert.notEqual(c.status,'returned');assert.equal(c.totals,null);
 }
 const raw=costFixture(p);raw.items[0].costs.daily.pop();assert.equal(channelCosts(raw,'123',p).observedTotals.total,20);
});
test('target and request dates are enforced; owned context never exported',()=>{
 const p={start:'2026-10-01',end:'2026-10-03'},raw=costFixture(p);raw.items[0].costs.source.request.query.itemId='456';assert.ok(!JSON.stringify(channelCosts(raw,'123',p)).includes('456'));
 raw.items[0].costs.source.request.query.successItemId='456';assert.throws(()=>channelCosts(raw,'123',p),/FILTER_MISMATCH/);
 raw.items[0].itemId='456';assert.throws(()=>channelCosts(raw,'123',p),/ID_DATE_MISMATCH/);
});
test('12 independent windows populate channel amounts without changing platform ratios or ROI',()=>{
 const {plan,snapshots}=fixture();plan.channelCostsVersion=1;
 for(const s of snapshots)s.modules.scenes={status:'returned',response:{body:{info:{ok:true},data:[{sceneId:435,sceneName:'货品全站推',charge:{succItemValue:null,itemValue:888},chargeRatio:{succItemValue:1},directRoi:{succItemValue:'10~20'}}]}}};
 const costs=plan.periods.map(p=>costFixture(p)),r=buildReport(plan,snapshots,costs),m=r.modules.promotion;
 assert.equal(m.periods[0].values.charge.s435.value,70);assert.equal(m.periods[2].values.charge.s435.value,300);assert.equal(m.periods[4].values.charge.s435.value,70);
 assert.equal(m.periods[0].values.chargeRatio.s435.value,1);assert.equal(m.periods[0].platformDirectRoi.s435.raw,'10~20');assert.equal(m.periods[0].values.charge['channel-keyword'].value,0);assert.equal(m.channelCosts[0].shares.wholeSite,1);
 costs[0].items[0].costs.daily.pop();const partial=buildReport(plan,snapshots,costs);assert.equal(partial.modules.promotion.periods[0].values.charge.s435.kind,'missing');assert.equal(partial.dataStatus,'partial');assert.notEqual(partial.sourceHash,r.sourceHash);
 const absent=buildReport(plan,snapshots);assert.equal(absent.coverage[0].modules.channelCosts,'unavailable');assert.equal(absent.modules.promotion.periods[0].values.charge.s435.kind,'missing');
});
