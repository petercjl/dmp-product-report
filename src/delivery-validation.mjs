import {planPeriods,typed} from './report-data.mjs';
import {estimateDirectRoi} from './estimated-roi.mjs';
import {channels} from './channel-costs.mjs';

const list=v=>Array.isArray(v)?v:[];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const keys=(o,ids)=>object(o)&&same(Object.keys(o).sort(),[...ids].sort());
const ids=ms=>Array.isArray(ms)?ms.map(x=>x?.id):[];
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);

// Reports all independent repairable contract failures, without mutating data.
export function inspectReportData(r){
 const issues=[];
 const check=(ok,path,code)=>{if(!ok)issues.push({path,code});return !!ok;};
 if(!check(object(r),'/','REPORT_OBJECT'))return {issues,checks:{reportObject:false},complete:false};
 check(typeof r.itemId==='string'&&/^\d+$/.test(r.itemId)&&r.plan?.itemId===r.itemId,'/plan/itemId','TARGET_ID');
 check(hash(r.sourceHash)&&r.reportVersion===1,'/sourceHash','SOURCE_IDENTITY');
 let expected;
 try{if(typeof r.plan?.asOf!=='string')throw Error();expected=planPeriods(r.plan.asOf).periods;}catch{check(false,'/plan/asOf','INVALID_DATE');}
 const periods=(ps,es,pointer)=>{
  if(!check(Array.isArray(ps),pointer,'PERIODS_ARRAY')||!es)return false;
  check(ps.length===es.length,pointer,'PERIODS_LENGTH');
  es.forEach((p,i)=>check(same([ps[i]?.id,ps[i]?.start,ps[i]?.end],[p.id,p.start,p.end]),pointer+'/'+i,'PERIODS'));
  return true;
 };
 periods(r.plan?.periods,expected,'/plan/periods');periods(r.coverage,expected,'/coverage');
 for(const [i,c] of list(r.coverage).entries())check(object(c?.modules)&&typeof c?.metricsDateVerified==='boolean','/coverage/'+i,'COVERAGE_FIELDS');
 if(r.product)check(r.product.itemId===r.itemId,'/product/itemId','PRODUCT_ID');
 const modules=r.modules??{};
 check(keys(modules,['metrics','promotion','crowd']),'/modules','MODULES');
 for(const name of ['metrics','promotion','crowd']){
  const m=modules[name];if(m)check(m.meta?.subject==='商品 ID '+r.itemId&&hash(m.meta?.sourceHash),'/modules/'+name+'/meta','MODULE_SOURCE');
 }
 const cell=(v,p,estimated=false)=>{
  if(!check(object(v)&&['exact','range','missing'].includes(v.kind),p,'VALUE_KIND'))return;
  if(v.kind==='missing'){check(v.raw===null&&v.value==null&&v.lower==null&&v.upper==null,p,'MISSING_VALUE');return;}
  if(v.kind==='exact'){check(finite(v.value)&&v.raw===v.value,p,'EXACT_VALUE');return;}
  check(finite(v.lower)&&finite(v.upper)&&v.lower<=v.upper,p,'RANGE_BOUNDS');
  if(!estimated){let parsed;try{parsed=typed(v.raw);}catch{}check(parsed?.kind==='range'&&parsed.lower===v.lower&&parsed.upper===v.upper,p,'RANGE_RAW');}
 };
 const metrics=modules.metrics;
 if(metrics){
  const wanted=['sales','orders','averageOrder','ipv','paidClicks','organicClicks','conversion','addToCart'];
  check(same(ids(metrics.metrics),wanted),'/modules/metrics/metrics','METRIC_IDS');check(same(ids(metrics.trend?.metrics),wanted),'/modules/metrics/trend/metrics','METRIC_IDS');
  periods(metrics.periods,expected?.slice(0,4),'/modules/metrics/periods');periods(metrics.trend?.periods,expected?.slice(4),'/modules/metrics/trend/periods');
  for(const [ms,ps,base] of [[metrics.metrics,expected?.slice(0,4),'/modules/metrics/metrics'],[metrics.trend?.metrics,expected?.slice(4),'/modules/metrics/trend/metrics']]){
   if(!Array.isArray(ms)||!ps)continue;
   ms.forEach((m,i)=>{check(keys(m?.values,ps.map(p=>p.id)),base+'/'+i+'/values','METRIC_PERIOD_KEYS');for(const [id,v] of Object.entries(m?.values??{}))check(v===null||finite(v),base+'/'+i+'/values/'+id,'METRIC_VALUE');});
   for(const p of ps){const vals=['sales','orders','averageOrder'].map(id=>ms.find(m=>m?.id===id)?.values?.[p.id]);if(vals.some(v=>v===undefined))continue;const [s,o,a]=vals;check(s===(o===null||a===null?null:o*a),base+'/sales/'+p.id,'SALES_FORMULA');}
  }
 }
 const promo=modules.promotion,crowd=modules.crowd;
 if(crowd){check(same(ids(crowd.metrics),['people','orders','conversion','cartFavorite']),'/modules/crowd/metrics','CROWD_IDS');check(same(ids(crowd.groups),['itemOld','itemNewShopOld','shopNewCategoryOld','categoryNew']),'/modules/crowd/groups','CROWD_IDS');}
 if(promo)check(same(ids(promo.metrics),['impression','click','chargeRatio','ctr','cpc','directDealAmount',r.channelCostsRequired?'estimatedDirectRoi':'directRoi','charge']),'/modules/promotion/metrics','PROMOTION_IDS');
 for(const [name,mod,groups] of [['promotion',promo,ids(promo?.scenes)],['crowd',crowd,[...ids(crowd?.groups),'total']]]){
  if(!mod)continue;const base='/modules/'+name;
  check(groups.length>0&&groups.every(id=>typeof id==='string')&&new Set(groups).size===groups.length,base+'/groups','GROUP_IDS');
  periods(mod.periods,expected,base+'/periods');
  for(const [i,p] of list(mod.periods).entries()){
   check(keys(p?.values,ids(mod.metrics)),base+'/periods/'+i+'/values','METRIC_FIELDS');
   for(const m of list(mod.metrics)){const vals=p?.values?.[m.id],pointer=base+'/periods/'+i+'/values/'+m.id;check(keys(vals,groups),pointer,'GROUP_FIELDS');for(const [g,v] of Object.entries(vals??{}))cell(v,pointer+'/'+g,m.id==='estimatedDirectRoi');}
  }
 }
 if(r.channelCostsRequired&&promo){
  periods(promo.channelCosts,expected,'/modules/promotion/channelCosts');
  for(const [i,cost] of list(promo.channelCosts).entries()){
   const base='/modules/promotion/channelCosts/'+i,p=promo.periods?.[i];if(!check(object(cost),base,'CHANNEL_OBJECT'))continue;
   if(cost.status==='returned'){
    const channelIds=channels.map(c=>c.id),days=(Date.parse(cost.end)-Date.parse(cost.start))/864e5+1;
    check(cost.coverage?.validDays===days&&cost.coverage?.requestedDays===days,base+'/coverage','CHANNEL_COVERAGE');
    const daily=Array.isArray(cost.daily)?cost.daily:[];
    check(cost.unit==='CNY'&&hash(cost.sourceHash)&&daily.length===days&&new Set(daily.map(d=>d.date)).size===days,base+'/daily','CHANNEL_DAILY');
    const sums=Object.fromEntries(channelIds.map(k=>[k,0]));let valid=true;
    for(const [j,d] of daily.entries()){if(!check(object(d),base+'/daily/'+j,'CHANNEL_DAILY')){valid=false;continue;}valid=check(d.date>=cost.start&&d.date<=cost.end&&/^\d{4}-\d{2}-\d{2}$/.test(d.date)&&channelIds.every(k=>finite(d.values?.[k])),base+'/daily/'+j,'CHANNEL_DAILY')&&valid;for(const k of channelIds)sums[k]+=d.values?.[k]??NaN;}
    const money=n=>Math.round((n+Number.EPSILON)*100)/100;
    if(valid)check(channelIds.every(k=>cost.totals?.[k]===money(sums[k]))&&cost.totals?.total===money(Object.values(sums).reduce((a,b)=>a+b,0)),base+'/totals','CHANNEL_TOTAL');
   }else check(cost.totals===null,base+'/totals','PARTIAL_CHANNEL_TOTAL');
   for(const scene of list(promo.scenes)){
    const amount=p?.values?.directDealAmount?.[scene.id],spend=p?.values?.charge?.[scene.id],mapped=channels.find(c=>c.label===scene.label),expectedSpend=cost.totals?.[mapped?.id]??null;
    check((expectedSpend===null||finite(expectedSpend))&&same(spend,typed(expectedSpend)),base+'/scene/'+scene.id,'CHANNEL_SCENE_MAPPING');
    check(same(p?.values?.estimatedDirectRoi?.[scene.id],estimateDirectRoi(amount,spend?.kind==='exact'?spend.value:null)),base+'/roi/'+scene.id,'ROI_FORMULA');
   }
  }
 }
 if(r.audienceProfileRequired){
  const a=r.audienceProfile;check(a&&a.itemId===r.itemId&&a.days===30&&a.periodType==='rolling'&&same(ids(a.behaviors),['purchase','browse','favorite','cart','search']),'/audienceProfile','AUDIENCE_IDENTITY');
  for(const [i,b] of list(a?.behaviors).entries()){
   const base='/audienceProfile/behaviors/'+i;if(!check(object(b),base,'AUDIENCE_BEHAVIOR'))continue;
   if(b.period)check(b.period.days===30&&b.period.type==='rolling',base+'/period','AUDIENCE_PERIOD');
   if(b.status==='complete')check(same(ids(b.dimensions).slice().sort(),['gender','age','consumption','city','segments'].sort())&&(b.dimensions??[]).every(d=>['returned','empty'].includes(d.status)),base+'/dimensions','AUDIENCE_DIMENSIONS');
   for(const [j,d] of list(b.dimensions).entries()){
    const ptr=base+'/dimensions/'+j;if(!check(object(d),ptr,'AUDIENCE_DIMENSION'))continue;check(Array.isArray(d.rows)&&list(d.rows).every(x=>finite(x.count)),ptr+'/rows','AUDIENCE_COUNTS');
    if(d.status==='returned')check(d.rows?.length>0&&finite(d.countSum)&&Math.abs(d.countSum-list(d.rows).reduce((s,x)=>s+x.count,0))<=1e-8,ptr+'/countSum','AUDIENCE_TOTAL');
   }
  }
 }
 const states=['metrics7','scenes','keywords','crowdRanges','crowdTable',...(r.channelCostsRequired?['channelCosts']:[])];
 const complete=issues.length===0&&r.dataStatus==='complete'&&Array.isArray(r.coverage)&&r.coverage.every(c=>c.metricsDateVerified===true&&states.every(k=>['returned','empty'].includes(c.modules?.[k])))&&(!r.channelCostsRequired||promo?.channelCosts?.every(p=>p.status==='returned'))&&(!r.audienceProfileRequired||r.audienceProfile?.status==='complete'&&r.audienceProfile.behaviors?.every(b=>b.status==='complete'));
 const checks=Object.fromEntries(['targetIdentity','canonicalPeriods','sourceFingerprints','metricFieldsAndValues','missingAndRangeSemantics','salesAndRoiFormulas'].map(k=>[k,issues.length===0]));
 return {issues,checks,complete:!!complete};
}
export function validateReportData(r){
 const result=inspectReportData(r);
 if(result.issues.length){const e=Error('REPORT_CONTRACT_INVALID: '+[...new Set(result.issues.map(i=>i.code))].join(', '));e.code='REPORT_CONTRACT_INVALID';e.details={repairCount:result.issues.length,issues:result.issues};throw e;}
 return result;
}
