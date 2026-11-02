import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {saveNew} from './report-data.mjs';
import {validateReportData} from './delivery-validation.mjs';

export const componentCatalog=r=>[
 {id:'overview',label:'概览',anchor:'view-overview'},
 {id:'metrics',label:'关键指标对比',anchor:'view-metrics'},
 {id:'promotion',label:'推广策略对比',anchor:'view-promotion'},
 {id:'crowd',label:'人群构成对比',anchor:'view-crowd'},
 {id:'dataCoverage',label:'数据覆盖表',anchor:'report-data-coverage'},
 ...(r.audienceProfileRequired?[{id:'audience',label:'竞品人群画像',anchor:'view-audience'}]:[])
];
const list=v=>Array.isArray(v)?v:[];
const bounds=v=>v===null?null:typeof v==='number'?[v,v]:[v.lower,v.upper];
export const normalized=v=>v==null||v.kind==='missing'?null:typeof v==='number'?v:v.kind==='exact'?v.value:{lower:v.lower,upper:v.upper,raw:v.raw};
const packed=(a,b)=>a===b?a:{lower:a,upper:b};
export function compareValues(current,previous,format='number'){
 const a=bounds(current),b=bounds(previous);
 if(!a||!b)return {status:'missing'};
 const lo=a[0]-b[1],hi=a[1]-b[0];
 const direction=lo>0?'up':hi<0?'down':lo===0&&hi===0?'same':'uncertain';
 return {status:format==='percent'||b[0]>0?'comparable':'zero-baseline',difference:packed(lo,hi),change:format==='percent'?packed(lo*100,hi*100):b[0]>0?packed((a[0]/b[1]-1)*100,(a[1]/b[0]-1)*100):null,changeUnit:format==='percent'?'percentage-points':'relative-percent',direction};
}
function series(metric,values,sourcePrefix){
 const weeks=values.slice(4),known=weeks.flatMap((v,i)=>v===null?[]:[i]);
 const exact=known.filter(i=>typeof weeks[i]==='number');
 const extrema=exact.length===known.length&&exact.length?{
  maximum:Math.max(...exact.map(i=>weeks[i])),minimum:Math.min(...exact.map(i=>weeks[i])),
  maximumPeriods:exact.filter(i=>weeks[i]===Math.max(...exact.map(i=>weeks[i]))).map(i=>'w'+(i+1)),
  minimumPeriods:exact.filter(i=>weeks[i]===Math.min(...exact.map(i=>weeks[i]))).map(i=>'w'+(i+1))
 }:null;
 const base={id:metric.id,label:metric.label,unit:metric.unit,format:metric.format,values,sourcePrefixes:Array.isArray(sourcePrefix)?sourcePrefix:[sourcePrefix]};
 if(values.every(v=>v===null))return {...base,status:'missing-all-periods'};
 const constant=weeks.length===8&&weeks.every(v=>typeof v==='number'&&v===weeks[0]);
 return {...base,comparison:{days7:compareValues(values[0],values[1],metric.format),days30:compareValues(values[2],values[3],metric.format)},weekly:constant?{pattern:'constant',value:weeks[0]}:{validWeeks:known.length,missingPeriods:weeks.flatMap((v,i)=>v===null?['w'+(i+1)]:[]),adjacentChanges:weeks.map((v,i)=>i?compareValues(v,weeks[i-1],metric.format):null),observedExtrema:extrema}};
}
export function analysisSources(r){
 const sources={};
 for(const p of (Array.isArray(r.plan?.periods)?r.plan.periods:[]).filter(Boolean)){
  for(const [module,evidence,modulePath] of [['metrics','metrics7','metrics'],['promotion','scenes','promotion'],['crowd','crowdTable','crowd']]){
   sources[module+':'+p.id]={module,period:p.id,status:r.coverage?.find?.(c=>c.id===p.id)?.modules?.[evidence]??'unknown',fingerprint:r.modules?.[modulePath]?.meta?.sourceHash,evidenceFile:'evidence/'+p.id+'.json',pointer:'/modules/'+evidence,viewmodelPointer:'/modules/'+modulePath};
  }
  if(r.channelCostsRequired)sources['channelCosts:'+p.id]={module:'channelCosts',period:p.id,status:r.coverage?.find?.(c=>c.id===p.id)?.modules?.channelCosts??'unknown',fingerprint:r.modules.promotion.channelCosts.find(c=>c.id===p.id)?.sourceHash??null,evidenceFile:'evidence/'+p.id+'.costs.json',viewmodelPointer:'/modules/promotion/channelCosts'};
 }
 if(r.audienceProfileRequired)for(const b of r.audienceProfile.behaviors)sources['audience:'+b.id]={module:'audience',behavior:b.id,status:b.status,fetchedAt:b.fetchedAt??null,evidenceFile:'evidence/audience-'+b.id+'.json',viewmodelPointer:'/audienceProfile/behaviors'};
 return sources;
}
export function prepareAnalysisInput(r){
 const ps=r.plan.periods,metrics=r.modules.metrics,promotion=r.modules.promotion,crowd=r.modules.crowd;
 const rows=metrics.metrics.map(m=>series(m,ps.map((p,i)=>i<4?m.values[p.id]:metrics.trend.metrics.find(x=>x.id===m.id).values[p.id]),'metrics'));
 const promo=promotion.scenes.map(s=>({id:s.id,label:s.label,metrics:promotion.metrics.map(m=>series(m,promotion.periods.map(p=>normalized(p.values[m.id][s.id])),r.channelCostsRequired&&m.id==='charge'?'channelCosts':m.id==='estimatedDirectRoi'?['promotion','channelCosts']:'promotion'))}));
 const groups=[...crowd.groups,{id:'total',label:'平台合计'}];
 const compactSeries=row=>{const {label,unit,format,sourcePrefixes,...rest}=row;return rest;};
 const crowds=crowd.metrics.map(m=>({id:m.id,label:m.label,format:m.format,unit:m.unit,groups:groups.map(g=>({groupId:g.id,...compactSeries(series(m,crowd.periods.map(p=>normalized(p.values[m.id][g.id])),'crowd'))}))}));
 const compositions=['people','orders'].map(id=>({metricId:id,periods:crowd.periods.map(p=>{
  const counts=Object.fromEntries(crowd.groups.map(g=>[g.id,normalized(p.values[id][g.id])])),known=Object.values(counts).filter(v=>typeof v==='number'),sum=known.reduce((a,b)=>a+b,0),total=normalized(p.values[id].total);
  const newCounts=Object.entries(counts).filter(([k])=>k!=='itemOld').map(([,v])=>v),returnedNew=newCounts.filter(v=>typeof v==='number');
  const itemNewObserved=returnedNew.length?returnedNew.reduce((a,b)=>a+b,0):null;
  return {period:p.id,counts,itemNew:{observedCount:itemNewObserved,completeValue:returnedNew.length===3?itemNewObserved:null,shareOfReturnedCategories:itemNewObserved!==null&&sum>0?itemNewObserved/sum:null},returnedSum:known.length?sum:null,missingGroups:Object.entries(counts).filter(([,v])=>v===null).map(([k])=>k),shares:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,typeof v==='number'&&sum>0?v/sum:null])),platformTotal:total,differenceFromPlatformTotal:known.length&&typeof total==='number'?sum-total:null,sourceRef:'crowd:'+p.id};
 })}));
 for(const c of compositions)c.shareComparability=Object.fromEntries([['days7',0,1],['days30',2,3]].map(([id,a,b])=>[id,{sameReturnedGroups:JSON.stringify(c.periods[a].missingGroups)===JSON.stringify(c.periods[b].missingGroups),nonzeroDenominators:c.periods[a].returnedSum>0&&c.periods[b].returnedSum>0}]));
 const salesDrivers={};
 const vals=id=>rows.find(m=>m.id===id).values;
 for(const [id,a,b] of [['days7',0,1],['days30',2,3]]){
  const [oc,op,ac,ap]=[vals('orders')[a],vals('orders')[b],vals('averageOrder')[a],vals('averageOrder')[b]];
  salesDrivers[id]=[oc,op,ac,ap].some(x=>x===null)?{status:'missing'}:{status:'calculated',ordersContribution:(oc-op)*(ac+ap)/2,averageOrderContribution:(ac-ap)*(oc+op)/2,salesDifference:vals('sales')[a]-vals('sales')[b],method:'symmetric-two-factor',sourceRefs:['metrics:'+ps[a].id,'metrics:'+ps[b].id]};
 }
 const audience=r.audienceProfileRequired?{days:r.audienceProfile.days,periodType:'rolling',actualDatesVerified:r.audienceProfile.actualDatesVerified,behaviors:r.audienceProfile.behaviors.map(b=>({id:b.id,label:b.label,status:b.status,fetchedAt:b.fetchedAt??null,sourceRef:'audience:'+b.id,dimensions:b.dimensions.map(d=>({id:d.id,label:d.label,status:d.status,multiLabel:!!d.multiLabel,countSum:d.countSum??null,rowsTotal:d.rows.length,rows:d.rows.map(row=>({label:row.label,count:row.count,platformRate:row.platformRate??null,share:d.countSum>0?row.count/d.countSum:null})).sort((a,b)=>b.count-a.count).slice(0,d.id==='segments'?5:100),rowsPolicy:d.id==='segments'?'top-5; full labels in ViewModel/source':'full distribution'}))}))}:null;
 const anomalies=[...(r.warnings??[]).map(message=>({code:'SOURCE_WARNING',message}))];
 for(const c of r.coverage)if(!c.metricsDateVerified)anomalies.push({code:'DATE_UNVERIFIED',period:c.id,sourceRef:'metrics:'+c.id});
 for(const p of ps){const i=ps.indexOf(p),crowdOrders=normalized(crowd.periods[i].values.orders.total),operatingOrders=rows.find(m=>m.id==='orders').values[i];if(typeof crowdOrders==='number'&&typeof operatingOrders==='number'&&crowdOrders!==operatingOrders)anomalies.push({code:'CROSS_SOURCE_ORDERS_DIFFER',period:p.id,crowdOrders,operatingOrders,sourceRefs:['crowd:'+p.id,'metrics:'+p.id]});}
 for(const comp of compositions)for(const p of comp.periods){if(p.missingGroups.length)anomalies.push({code:'MISSING_CROWD_GROUPS',metric:comp.metricId,period:p.period,groups:p.missingGroups,sourceRef:p.sourceRef});if(p.differenceFromPlatformTotal)anomalies.push({code:'CROWD_TOTAL_CONFLICT',metric:comp.metricId,period:p.period,difference:p.differenceFromPlatformTotal,sourceRef:p.sourceRef});}
 const sources=analysisSources(r);
 return {contract:'dmp-analysis-input@1',identity:{itemId:r.itemId,asOf:r.plan.asOf,sourceHash:r.sourceHash},product:{title:r.product?.title??null},dataStatus:r.dataStatus,capabilityGaps:r.capabilityGaps??[],periods:ps,evidencePathsRelativeTo:'original collection runDir, not a nested build directory',valueContract:{order:'All values arrays follow periods order; first four comparison, last eight natural weeks.',exact:'number',missing:null,range:{lower:'unrounded number',upper:'unrounded number',raw:'platform or outward-rounded estimate label'},percent:'fractions; comparison.change is percentage points for percent metrics',trend:'Missing weeks break continuity; observedExtrema use returned exact values only.'},components:componentCatalog(r),sources,coverage:r.coverage,metrics:rows,salesDrivers,promotion:promo,channelCosts:r.channelCostsRequired?promotion.channelCosts.map(c=>({period:c.id,status:c.status,coverage:c.coverage,totals:c.totals,observedTotals:c.observedTotals,shares:c.shares??null,sourceRef:'channelCosts:'+c.id})):null,crowd:crowds,crowdComposition:compositions,audience,anomalies,boundaries:['Sales equals full precision orders × averageOrder.','Crowd shares use returned category counts; missing is unknown, platform total stays independent.','Estimated ROI is direct amount interval / complete mapped channel cost; no midpoint or exact ROI growth inference.','Audience dimensions are independent distributions and behavior windows do not imply a conversion funnel.','Descriptive changes are facts; operating strategies remain evidence-bounded judgments.']};
}

const briefSchema=(sourceIds,components,labeled,v2)=>({type:'object',required:['conclusion','evidence',...(labeled?['label']:[]),...(v2?['sourceRefs']:[])],additionalProperties:false,properties:{conclusion:{type:'string',minLength:1,pattern:'\\S'},evidence:{type:'array',minItems:1,items:{type:'string',minLength:1,pattern:'\\S'}},label:{type:'string',minLength:1,pattern:'\\S'},note:{type:'string'},strategy:{type:'string'},sourceRefs:{type:'array',...(v2?{minItems:1}:{}),uniqueItems:true,items:{type:'string',enum:sourceIds}},componentRefs:{type:'array',uniqueItems:true,items:{type:'string',enum:components}}}});
export function analysisSchema(r,{legacy=false}={}){
 let sources=[];try{sources=Object.keys(analysisSources(r));}catch{}const components=componentCatalog(r).map(c=>c.id);
 const objects=properties=>({type:'object',required:Object.keys(properties),additionalProperties:false,properties});
 const keyed=(ids,labeled=false)=>objects(Object.fromEntries(ids.map(id=>[id,{$ref:'#/$defs/'+(labeled?'labeledBrief':'brief')}])));
 const properties={metricAnalyses:keyed(list(r.modules?.metrics?.metrics).map(m=>m.id)),promotionAnalyses:objects(Object.fromEntries(list(r.modules?.promotion?.scenes).map(s=>[s.id,keyed(list(r.modules?.promotion?.metrics).map(m=>m.id))]))),crowdAnalyses:keyed(list(r.modules?.crowd?.metrics).map(m=>m.id)),businessInterpretations:keyed(['metrics','promotion','crowd'],true),businessOverview:{$ref:'#/$defs/labeledBrief'},...(r.audienceProfileRequired?{audienceAnalyses:keyed(['purchase','browse','favorite','cart','search'],true)}:{})};
 if(!legacy){properties.analysisVersion={const:2};properties.inputIdentity=objects({itemId:{const:r.itemId},sourceHash:{const:r.sourceHash}});}
 return {$schema:'https://json-schema.org/draft/2020-12/schema',title:'DMP analysis JSON for '+r.itemId,$defs:{brief:briefSchema(sources,components,false,!legacy),labeledBrief:briefSchema(sources,components,true,!legacy)},...objects(properties)};
}
export function analysisTemplate(r){
 const blank=(labeled,label)=>({...(labeled?{label}:{}),conclusion:'',evidence:[],sourceRefs:[]});
 const keyed=ms=>Object.fromEntries(ms.map(m=>[m.id,blank(false)]));
 return {analysisVersion:2,inputIdentity:{itemId:r.itemId,sourceHash:r.sourceHash},metricAnalyses:keyed(r.modules.metrics.metrics),promotionAnalyses:Object.fromEntries(r.modules.promotion.scenes.map(s=>[s.id,keyed(r.modules.promotion.metrics)])),crowdAnalyses:keyed(r.modules.crowd.metrics),businessInterpretations:{metrics:blank(true,'经营解读'),promotion:blank(true,'推广解读'),crowd:blank(true,'客群解读')},businessOverview:blank(true,'综合概览'),...(r.audienceProfileRequired?{audienceAnalyses:Object.fromEntries(['purchase','browse','favorite','cart','search'].map(id=>[id,blank(true,'近30天'+(r.audienceProfile?.behaviors.find(b=>b.id===id)?.label??id)+'人群特征')]))}:{})};
}
function display(v,percent=false){
 if(v===null||v===undefined)return '未返回';
 if(typeof v==='object')return percent?'['+display(v.lower,true)+', '+display(v.upper,true)+']':v.raw??'['+display(v.lower)+', '+display(v.upper)+']';
 if(typeof v!=='number')return percent&&typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v))?display(Number(v),true):String(v);
 return (v*(percent?100:1)).toLocaleString('en-US',{maximumFractionDigits:2,useGrouping:false})+(percent?'%':'');
}
function change(c){
 if(!c||c.status==='missing')return '缺失';
 if(c.changeUnit==='percentage-points')return '差 '+display(c.change)+'个百分点；'+c.direction;
 return '差 '+display(c.difference)+'；'+(c.status==='zero-baseline'?'基数为0或区间含0，相对变化未定义':display(c.change)+(c.changeUnit==='percentage-points'?'个百分点':'%'))+'；'+c.direction;
}
export function analysisBrief(s){
 const lines=['# DMP 分析输入',`商品 ${s.identity.itemId} · 报告日 ${s.identity.asOf}`,...(s.product.title?[s.product.title]:[]),`来源指纹 ${s.identity.sourceHash}`,'数值保留2位小数便于阅读，精确值与完整区间见同目录 analysis-input.json。以下为固定计算，不是经营结论。',
  '## 周期与来源',...s.periods.map(p=>`${p.id}: ${p.label} ${p.start} 至 ${p.end}`),
  '来源ID：metrics:周期 / promotion:周期 / crowd:周期 / channelCosts:周期 / audience:行为。证据路径相对于原采集runDir。',
  'metrics指向 evidence/周期.json 的metrics7；promotion指向scenes；crowd指向crowdTable；channelCosts指向 evidence/周期.costs.json；audience指向 evidence/audience-行为.json。各来源业务状态见下表，JSON还保留指纹与ViewModel位置。',
  '|周期|经营日期核实|来源状态|','|---|---|---|',...s.coverage.map(c=>`|${c.id}|${c.metricsDateVerified?'是':'否'}|${Object.entries(c.modules).map(([k,v])=>k+'='+v).join('; ')}|`),
  '可引用组件：'+s.components.map(c=>c.id+'（'+c.label+'）').join('；'),
  '## 关键指标'];
 const table=(rows,caption)=>{
  lines.push(caption,'\n|指标/分组|'+s.periods.map(p=>p.id).join('|')+'|7天变化|30天变化|最新周变化|','|---|'+s.periods.map(()=> '---').join('|')+'|---|---|---|');
  for(const row of rows)lines.push('|'+(row.groupId??row.id)+'|'+row.values.map(v=>display(v,row.format==='percent')).join('|')+'|'+change(row.comparison?.days7)+'|'+change(row.comparison?.days30)+'|'+(row.weekly?.pattern==='constant'?'8周恒定 '+display(row.weekly.value,row.format==='percent'):change(row.weekly?.adjacentChanges?.[7]))+'|');
  for(const row of rows)if(row.weekly?.observedExtrema)lines.push(`${row.groupId??row.id} 已返回周极值：最高 ${display(row.weekly.observedExtrema.maximum,row.format==='percent')}（${row.weekly.observedExtrema.maximumPeriods.join(',')}），最低 ${display(row.weekly.observedExtrema.minimum,row.format==='percent')}（${row.weekly.observedExtrema.minimumPeriods.join(',')}）；有效${row.weekly.validWeeks}/8周。`);
 };
 table(s.metrics,s.metrics.map(m=>m.id+'='+m.label+' ('+m.unit+')').join('；'));
 lines.push('### 量价算术分解');
 for(const [period,d] of Object.entries(s.salesDrivers))lines.push(`${period}: `+(d.status==='missing'?'缺失':`销售额差 ${display(d.salesDifference)}元；笔数贡献 ${display(d.ordersContribution)}元，笔单价贡献 ${display(d.averageOrderContribution)}元。对称两因素分解，属于算术贡献。`));
 lines.push('## 推广');
 for(const scene of s.promotion){lines.push('### '+scene.id+' '+scene.label);const absent=scene.metrics.filter(m=>m.status==='missing-all-periods');if(absent.length)lines.push('全部12期未返回：'+absent.map(m=>m.id+'='+m.label).join('；'));const present=scene.metrics.filter(m=>m.status!=='missing-all-periods');if(present.length)table(present,present.map(m=>m.id+'='+m.label+' ('+m.unit+') 来源 '+m.sourcePrefixes.join('+')).join('；'));}
 if(s.channelCosts){lines.push('### 渠道金额覆盖','|周期|状态|有效/请求天数|完整总额|已返回小计|','|---|---|---|---|---|');for(const c of s.channelCosts)lines.push(`|${c.period}|${c.status}|${c.coverage?.validDays??0}/${c.coverage?.requestedDays??'?'}|${display(c.totals?.total)}|${display(c.observedTotals?.total)}|`);}
 lines.push('## 新老客构成','分类：itemOld=宝贝老客；itemNewShopOld=宝贝新客且店铺老客；shopNewCategoryOld=店铺新客且类目老客；categoryNew=类目新客；total=平台合计。');
 for(const metric of s.crowd){lines.push('### '+metric.id+' '+metric.label);table(metric.groups.map(g=>({...g,format:metric.format})),`单位 ${metric.unit}；平台合计独立，比例不取分类平均。`);}
 for(const c of s.crowdComposition){lines.push('### '+c.metricId+' 构成分母','|周期|已返回分类和|平台合计|分类缺失|分类占比|商品新客已返回小计|','|---|---|---|---|---|---|');for(const p of c.periods)lines.push(`|${p.period}|${display(p.returnedSum)}|${display(p.platformTotal)}|${p.missingGroups.join(',')||'无'}|${Object.entries(p.shares).map(([k,v])=>k+' '+display(v,true)).join('; ')}|${display(p.itemNew.observedCount)}（全三类${p.itemNew.completeValue===null?'未齐':'齐全'}）|`);}
 if(s.audience){lines.push('## 近30天行为画像','画像为采集时滚动窗口，与上方12周期分开解释；本合同起止日期未回显，不按报告日倒算。独立维度；策略标签可重叠；不以不同行为人数计算转化率。以下每维度取前三项，完整分布/标签Top5见JSON。');for(const b of s.audience.behaviors){lines.push('### '+b.id+' '+b.label+' · '+b.status+' · 读取 '+(b.fetchedAt??'未知'));for(const d of b.dimensions)lines.push(`${d.id} ${d.label}：${d.status}；分母 ${display(d.countSum)}；`+d.rows.slice(0,3).map(r=>r.label+' '+display(r.count)+'（'+display(d.multiLabel?r.platformRate:r.share,true)+'）').join('；'));}}
 lines.push('## 异常与限制',...s.anomalies.map(a=>'- '+JSON.stringify(a)),...s.boundaries.map(b=>'- '+b),
  '## 分析文件与结束条件','复制 analysis.template.json 为新的分析文件。逐指标、逐场景填写 conclusion、evidence、sourceRefs，保留 analysisVersion 和 inputIdentity。sourceRefs从上面的来源ID选取，componentRefs仅选可引用组件。analysis.schema.json是本次输入的完整机器合同。',
  '完成知识方法中的经营解读与证据选择后运行 finalize。它会一次列出所有可修复缺项；修复后到新路径输出。readyForDelivery=true 后交付 artifacts 指向的文件。不另渲染独立模块、不启动预览服务、不进行现场模板回归。');
 return lines.map(line=>line.startsWith('#')?'\n'+line+'\n':line).join('\n')+'\n';
}
export function writeAnalysisInputs(r,dir){
 const files={brief:path.join(dir,'analysis-input.md'),summary:path.join(dir,'analysis-input.json'),template:path.join(dir,'analysis.template.json'),schema:path.join(dir,'analysis.schema.json')};
 for(const p of Object.values(files))if(fs.existsSync(p))throw Error('OUTPUT_EXISTS: '+p);
 const summary=prepareAnalysisInput(r);
 for(const [key,data] of [['brief',analysisBrief(summary)],['summary',summary],['template',analysisTemplate(r)],['schema',analysisSchema(r)]])saveNew(files[key],data);
 return {contract:summary.contract,files,briefBytes:fs.statSync(files.brief).size,summaryBytes:fs.statSync(files.summary).size,summaryHash:createHash('sha256').update(fs.readFileSync(files.summary)).digest('hex')};
}
export function analysisInputCommand(opts){
 if(!opts.viewmodel||!opts.outDir)throw Error('ANALYSIS_INPUT_REQUIRED');
 const dir=path.resolve(opts.outDir);if(fs.existsSync(dir))throw Error('NEW_OUT_DIR_REQUIRED');
 const r=JSON.parse(fs.readFileSync(opts.viewmodel,'utf8'));validateReportData(r);
 fs.mkdirSync(dir,{recursive:true});return {ok:true,...writeAnalysisInputs(r,dir)};
}
