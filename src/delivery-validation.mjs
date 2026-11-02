import {planPeriods,typed} from './report-data.mjs';
import {estimateDirectRoi} from './estimated-roi.mjs';
import {channels} from './channel-costs.mjs';

const fail=code=>{throw Error('REPORT_CONTRACT_INVALID: '+code);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const keys=(o,ids)=>o&&same(Object.keys(o).sort(),[...ids].sort());
const window=p=>[p?.id,p?.start,p?.end];
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function value(v,estimated=false){
 if(!v||!['exact','range','missing'].includes(v.kind))fail('VALUE_KIND');
 if(v.kind==='missing'){if(v.raw!==null||v.value!=null||v.lower!=null||v.upper!=null)fail('MISSING_VALUE');return;}
 if(v.kind==='exact'){if(!finite(v.value)||v.raw!==v.value)fail('EXACT_VALUE');return;}
 if(!finite(v.lower)||!finite(v.upper)||v.lower>v.upper)fail('RANGE_BOUNDS');
 if(!estimated){let parsed;try{parsed=typed(v.raw);}catch{fail('RANGE_RAW');}if(parsed.lower!==v.lower||parsed.upper!==v.upper)fail('RANGE_RAW');}
}

// Verifies the saved data contract. Raw API mapping is validated by buildReport;
// this check does not certify API truth or natural-language causal judgments.
export function validateReportData(r){
 if(!/^\d+$/.test(r.itemId??'')||r.plan?.itemId!==r.itemId)fail('TARGET_ID');
 if(!hash(r.sourceHash)||r.reportVersion!==1)fail('SOURCE_IDENTITY');
 const expected=planPeriods(r.plan.asOf).periods;
 const periods=(ps,es)=>{if(!Array.isArray(ps)||!same(ps.map(window),es.map(window)))fail('PERIODS');};
 periods(r.plan.periods,expected);periods(r.coverage,expected);
 if(r.product&&r.product.itemId!==r.itemId)fail('PRODUCT_ID');
 if(!keys(r.modules,['metrics','promotion','crowd']))fail('MODULES');
 for(const m of Object.values(r.modules))if(m.meta?.subject!=='商品 ID '+r.itemId||!hash(m.meta?.sourceHash))fail('MODULE_SOURCE');
 const m=r.modules.metrics;
 const metricIds=['sales','orders','averageOrder','ipv','paidClicks','organicClicks','conversion','addToCart'];
 const ids=ms=>ms?.map(x=>x.id);
 if(!same(ids(m.metrics),metricIds)||!same(ids(m.trend?.metrics),metricIds))fail('METRIC_IDS');
 periods(m.periods,expected.slice(0,4));periods(m.trend.periods,expected.slice(4));
 for(const [ms,ps] of [[m.metrics,expected.slice(0,4)],[m.trend.metrics,expected.slice(4)]]){
  for(const metric of ms){if(!keys(metric.values,ps.map(p=>p.id)))fail('METRIC_PERIOD_KEYS');for(const v of Object.values(metric.values))if(v!==null&&!finite(v))fail('METRIC_VALUE');}
  for(const p of ps){const [sales,orders,avg]=ms.slice(0,3).map(x=>x.values[p.id]);const calculated=orders===null||avg===null?null:orders*avg;if(sales!==calculated)fail('SALES_FORMULA');}
 }
 const promo=r.modules.promotion,crowd=r.modules.crowd;
 if(!same(ids(crowd.metrics),['people','orders','conversion','cartFavorite'])||!same(ids(crowd.groups),['itemOld','itemNewShopOld','shopNewCategoryOld','categoryNew']))fail('CROWD_IDS');
 const roi=r.channelCostsRequired?'estimatedDirectRoi':'directRoi';
 if(!same(ids(promo.metrics),['impression','click','chargeRatio','ctr','cpc','directDealAmount',roi,'charge']))fail('PROMOTION_IDS');
 for(const [mod,groups] of [[promo,ids(promo.scenes)],[crowd,[...ids(crowd.groups),'total']]]){
  if(!groups.length||new Set(groups).size!==groups.length)fail('GROUP_IDS');
  periods(mod.periods,expected);
  for(const p of mod.periods){if(!keys(p.values,ids(mod.metrics)))fail('METRIC_FIELDS');for(const metric of mod.metrics){if(!keys(p.values[metric.id],groups))fail('GROUP_FIELDS');for(const v of Object.values(p.values[metric.id]))value(v,metric.id==='estimatedDirectRoi');}}
 }
 if(r.channelCostsRequired){
  periods(promo.channelCosts,expected);
  for(let i=0;i<12;i++){
   const cost=promo.channelCosts[i],p=promo.periods[i];
   if(cost.status==='returned'){
    const channelIds=['keyword','wholeSite','audience','content','leads'];
    const days=(Date.parse(cost.end)-Date.parse(cost.start))/864e5+1;
    if(cost.coverage?.validDays!==days||cost.coverage?.requestedDays!==days)fail('CHANNEL_COVERAGE');
    if(cost.unit!=='CNY'||!hash(cost.sourceHash)||!Array.isArray(cost.daily)||cost.daily.length!==days||new Set(cost.daily.map(d=>d.date)).size!==days)fail('CHANNEL_DAILY');
    const sums=Object.fromEntries(channelIds.map(k=>[k,0]));
    for(const d of cost.daily){if(d.date<cost.start||d.date>cost.end||!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||!channelIds.every(k=>finite(d.values?.[k])))fail('CHANNEL_DAILY');for(const k of channelIds)sums[k]+=d.values[k];}
    const money=n=>Math.round((n+Number.EPSILON)*100)/100;
    if(!channelIds.every(k=>cost.totals?.[k]===money(sums[k]))||cost.totals.total!==money(Object.values(sums).reduce((a,b)=>a+b,0)))fail('CHANNEL_TOTAL');
   }else if(cost.totals!==null)fail('PARTIAL_CHANNEL_TOTAL');
   for(const scene of promo.scenes){const amount=p.values.directDealAmount[scene.id],spend=p.values.charge[scene.id];const mapped=channels.find(c=>c.label===scene.label);const expectedSpend=cost.totals?.[mapped?.id]??null;if(!same(spend,typed(expectedSpend)))fail('CHANNEL_SCENE_MAPPING');const wanted=estimateDirectRoi(amount,spend.kind==='exact'?spend.value:null);if(!same(p.values.estimatedDirectRoi[scene.id],wanted))fail('ROI_FORMULA');}
  }
 }
 if(r.audienceProfileRequired){
  const a=r.audienceProfile;
  if(a?.itemId!==r.itemId||a.days!==30||a.periodType!=='rolling'||!same(ids(a.behaviors),['purchase','browse','favorite','cart','search']))fail('AUDIENCE_IDENTITY');
  for(const b of a.behaviors){
   if(b.period&&(b.period.days!==30||b.period.type!=='rolling'))fail('AUDIENCE_PERIOD');
   if(b.status==='complete'&&(!keys(Object.fromEntries(b.dimensions.map(d=>[d.id,d])),['gender','age','consumption','city','segments'])||b.dimensions.length!==5||b.dimensions.some(d=>!['returned','empty'].includes(d.status))))fail('AUDIENCE_DIMENSIONS');
   for(const d of b.dimensions){if(!Array.isArray(d.rows)||d.rows.some(x=>!finite(x.count)))fail('AUDIENCE_COUNTS');if(d.status==='returned'&&(!d.rows.length||!finite(d.countSum)||Math.abs(d.countSum-d.rows.reduce((s,x)=>s+x.count,0))>1e-8))fail('AUDIENCE_TOTAL');}
  }
 }
 const states=['metrics7','scenes','keywords','crowdRanges','crowdTable',...(r.channelCostsRequired?['channelCosts']:[])];
 const complete=r.dataStatus==='complete'&&r.coverage.every(c=>c.metricsDateVerified===true&&states.every(k=>['returned','empty'].includes(c.modules?.[k])))&&(!r.channelCostsRequired||promo.channelCosts.every(p=>p.status==='returned'))&&(!r.audienceProfileRequired||r.audienceProfile.status==='complete'&&r.audienceProfile.behaviors.every(b=>b.status==='complete'));
 return {checks:{targetIdentity:true,canonicalPeriods:true,sourceFingerprints:true,metricFieldsAndValues:true,missingAndRangeSemantics:true,salesAndRoiFormulas:true},complete};
}
