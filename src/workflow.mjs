import {buildAudienceProfile,audienceTypes} from './audience-profile.mjs';
import {createHash} from 'node:crypto';
import fs from 'node:fs';import path from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {planPeriods,buildReport,saveNew} from './report-data.mjs';
import {channelCosts} from './channel-costs.mjs';
import {provider,inspectProvider} from './provider.mjs';
import {productIdentity,embedProductImage} from './product.mjs';
export const ROOT=fileURLToPath(new URL('../',import.meta.url));
export function pythonRuntime(){const candidates=process.env.DMP_REPORT_PYTHON?[[process.env.DMP_REPORT_PYTHON,[]]]:process.platform==='win32'?[['py',['-3']],['python',[]],['python3',[]]]:[['python3',[]],['python',[]]];for(const[exe,prefix]of candidates){const r=spawnSync(exe,[...prefix,'-c','import sys;assert sys.version_info>=(3,10);print(sys.version.split()[0])'],{encoding:'utf8',timeout:5000});if(r.status===0)return{exe,prefix,version:r.stdout.trim()};}throw Error('PYTHON_3_10_REQUIRED');}
export function doctor(){const py=pythonRuntime(),info=inspectProvider();return{ok:info.ok,node:process.version,python:py.version,tbcliVersion:info.providerVersion,channelCostsAvailable:info.channelCostsAvailable,audienceProfileAvailable:info.audienceProfileAvailable,tbcliSnapshot:info.snapshotVersion,subjectMode:info.subjectMode,independentRoutes:info.independentRoutes,fullAnalysisAvailable:info.fullAnalysisAvailable,tbcliItemSummary:info.itemSummaryVersion,renderer:'bundled-stdlib',templates:['metrics','promotion','crowd','audience-profile'],runtimeDependencies:['Node.js >=20','Python >=3.10','tbcli with target-only snapshot v2, CNY channel costs item summary v1 and audience v1','authenticated merchant and Taobao buyer Chrome sessions'],rendererExternalDependencies:[]};}
function invoke(exe,args){const tool=provider();args=[...tool.prefix,...args];exe=tool.exe;return new Promise((resolve,reject)=>{const p=spawn(exe,args,{stdio:['ignore','pipe','pipe'],env:{...process.env,TBCLI_UPDATE_CHECK:'0'}});let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>{stderr+=b;if(stderr.length>12000)stderr=stderr.slice(-12000);});p.on('error',reject);p.on('exit',code=>resolve({code,stdout,stderr}));});}
export async function collect(opts){
 const itemId=String(opts.itemId??'');if(!/^[1-9]\d+$/.test(itemId))throw Error('ITEM_ID_REQUIRED');
 if(Object.keys(opts).some(k=>!['itemId','asOf','outDir','cdpUrl','buyerCdpUrl'].includes(k)))throw Error('INVALID_COLLECTION_ARGUMENT');
 const info=doctor();if(!info.ok)throw Error('TBCLI_REPORT_CAPABILITY_REQUIRED');
 const out=path.resolve(opts.outDir??'');if(!opts.outDir||fs.existsSync(out))throw Error('NEW_OUT_DIR_REQUIRED');fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'evidence'));
 const plan={...planPeriods(opts.asOf),itemId,channelCostsVersion:1,audienceProfileVersion:1};saveNew(path.join(out,'plan.json'),plan);
 const operation={status:'collecting',itemId,completed:[],startedAt:new Date().toISOString()};
 const metadataFile=path.join(out,'evidence','product-info.json'),metadataArgs=['item','summary','--item-id',itemId,'--browser-role','buyer','--out',metadataFile,'--json'];if(opts.buyerCdpUrl)metadataArgs.push('--session-mode','cdp','--cdp-url',opts.buyerCdpUrl);
 const metadataRun=await invoke('tbcli',metadataArgs);if(![0,2].includes(metadataRun.code)){saveNew(path.join(out,'stopped.json'),{...operation,status:'stopped',failed:'product-info',browserRole:'buyer',exitCode:metadataRun.code});throw Error('PRODUCT_COLLECTION_STOPPED: inspect '+metadataFile);}const identity=productIdentity(JSON.parse(fs.readFileSync(metadataFile,'utf8')),itemId);saveNew(path.join(out,'product.json'),await embedProductImage(identity));
 for(const p of plan.periods){const target=path.join(out,'evidence',p.id+'.json'),argv=['dmp','snapshot','--browser-role','merchant','--item-id',itemId,'--start-date',p.start,'--end-date',p.end,'--out',target,'--json'];if(opts.cdpUrl)argv.push('--session-mode','cdp','--cdp-url',opts.cdpUrl);
  const r=await invoke('tbcli',argv);if(r.code!==0&&r.code!==2){saveNew(path.join(out,'stopped.json'),{...operation,status:'stopped',failed:p.id,reason:'collection stopped; inspect saved snapshot',exitCode:r.code});throw Error('COLLECTION_STOPPED: '+p.id+' '+out);}
  const s=JSON.parse(fs.readFileSync(target));if(s.status==='stopped')throw Error('COLLECTION_STOPPED');
  const costsFile=path.join(out,'evidence',p.id+'.costs.json'),contextId=s.executionContext?.status==='selected'?s.executionContext.itemId:null;
  if(contextId&&/^[1-9]\d+$/.test(String(contextId))){
   const args=['dmp','report','--browser-role','merchant','--modules','costs','--item-id',itemId,'--anchor-id',String(contextId),'--start-date',p.start,'--end-date',p.end,'--out',costsFile,'--json'];
   if(opts.cdpUrl)args.push('--session-mode','cdp','--cdp-url',opts.cdpUrl);
   const cr=await invoke('tbcli',args);
   if(![0,2].includes(cr.code)){saveNew(path.join(out,'stopped.json'),{...operation,status:'stopped',failed:p.id+'.costs',exitCode:cr.code});throw Error('COLLECTION_STOPPED: channel costs '+p.id);}
   const raw=JSON.parse(fs.readFileSync(costsFile,'utf8'));if(raw.status==='stopped')throw Error('COLLECTION_STOPPED: channel costs');
  }
  operation.snapshotStates??=[];operation.snapshotStates.push({period:p.id,status:s.status});operation.completed.push(p.id);console.error(JSON.stringify({period:p.id,status:s.status,completed:operation.completed.length,total:12}));}
 for(const type of audienceTypes){
  const target=path.join(out,'evidence','audience-'+type+'.json'),argv=['dmp','audience','--browser-role','merchant','--item-id',itemId,'--days','30','--audience-type',type,'--out',target,'--json'];
  if(opts.cdpUrl)argv.push('--session-mode','cdp','--cdp-url',opts.cdpUrl);
  const r=await invoke('tbcli',argv);
  if(r.code!==0){saveNew(path.join(out,'stopped.json'),{...operation,status:'stopped',failed:'audience-'+type,exitCode:r.code});throw Error('COLLECTION_STOPPED: audience '+type);}
  console.error(JSON.stringify({audience:type,status:'complete'}));
 }
 operation.capabilityGaps=[...new Set(plan.periods.flatMap(p=>{const s=JSON.parse(fs.readFileSync(path.join(out,'evidence',p.id+'.json')));return(s.capabilityGaps??[]).map(g=>g.module);} ))];operation.costsMissing=plan.periods.filter(p=>!fs.existsSync(path.join(out,'evidence',p.id+'.costs.json'))).map(p=>p.id);operation.costCoverage=plan.periods.map(p=>{const file=path.join(out,'evidence',p.id+'.costs.json');return {period:p.id,status:channelCosts(fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null,itemId,p).status};});operation.status=operation.capabilityGaps.length||operation.snapshotStates.some(s=>s.status!=='complete')||operation.costCoverage.some(c=>c.status!=='returned')?'partial':'collected';operation.finishedAt=new Date().toISOString();saveNew(path.join(out,'collection.json'),operation);return out;
}
export function build(opts){
 const run=path.resolve(opts.runDir??'');if(!opts.runDir)throw Error('RUN_DIR_REQUIRED');const plan=JSON.parse(fs.readFileSync(path.join(run,'plan.json'))),snapshots=plan.periods.map(p=>{
 const file=path.join(run,'evidence',p.id+'.json'),stopped=fs.existsSync(path.join(run,'stopped.json'));
 let s=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 if(!s&&!stopped)throw Error('SNAPSHOT_FILE_MISSING: '+p.id);
 if(!s)s={snapshotVersion:2,subject:{mode:'target-only',itemId:plan.itemId},itemId:plan.itemId,period:{startDate:p.start,endDate:p.end},status:'not-collected',modules:{}};
 if(stopped&&['stopped','not-collected'].includes(s.status))for(const name of ['metrics7','scenes','keywords','crowdRanges','crowdTable'])s.modules[name]??={status:'unavailable',reason:'collection-not-completed',request:null,response:null};
 return s;
 }),costs=plan.periods.map(p=>{const f=path.join(run,'evidence',p.id+'.costs.json');return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):null;}),report=buildReport(plan,snapshots,costs);const productFile=path.join(run,'product.json');if(fs.existsSync(productFile)){report.product=JSON.parse(fs.readFileSync(productFile,'utf8'));if(report.product.itemId!==report.itemId)throw Error('PRODUCT_ID_MISMATCH');}
 if(plan.audienceProfileVersion===1){
  const reports=audienceTypes.map(type=>{const f=path.join(run,'evidence','audience-'+type+'.json');return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):null;});
  report.audienceProfileRequired=true;report.audienceProfile=buildAudienceProfile(plan.itemId,reports);report.audienceAnalyses=report.audienceProfile.analyses;
  report.sourceHash=createHash('sha256').update(JSON.stringify({base:report.sourceHash,audienceReports:reports})).digest('hex');
  if(report.audienceProfile.status!=='complete'){report.dataStatus='partial';report.warnings.push('竞品行为画像尚未全部取得。');}
 }
 const artifactDir=fs.existsSync(path.join(run,'report.ViewModel.json'))?path.join(run,'builds',new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid):run;const output=opts.out?path.resolve(opts.out):path.join(artifactDir,'商品经营报告-'+report.itemId+'.html');if(fs.existsSync(output))throw Error('OUTPUT_EXISTS');if(artifactDir!==run)fs.mkdirSync(artifactDir,{recursive:true});
 saveNew(path.join(artifactDir,'report.ViewModel.json'),report);
 for(const[name,vm]of Object.entries(report.modules))saveNew(path.join(artifactDir,name+'.ViewModel.json'),vm);
 saveNew(path.join(artifactDir,'analysis.json'),{overview:report.overview,analyses:report.analyses,warnings:report.warnings});
 const csv=rows=>'\ufeff'+rows.map(r=>r.map(x=>'"'+String(x??'未返回').replaceAll('"','""')+'"').join(',')).join('\n');
 if(report.audienceProfile)saveNew(path.join(artifactDir,'竞品人群画像.csv'),csv([['行为','滚动天数','读取时间','维度','分类','人数或标签计数','平台原始rate','分类计数归一化占比','口径'],...report.audienceProfile.behaviors.flatMap(b=>b.dimensions.flatMap(d=>d.rows.map(r=>[b.label,30,b.fetchedAt,d.label,r.label,r.count,r.platformRate,r.normalizedShare,d.multiLabel?'标签可能重叠':'返回维度人数构成'])))]));
 if(report.modules.promotion.channelCosts)saveNew(path.join(artifactDir,'渠道消耗.csv'),csv([['周期','开始日期','结束日期','状态','有效天数','请求天数','关键词推广(元)','货品全站推(元)','人群推广(元)','内容运营(元)','线索推广(元)','完整周期合计(元)','已返回小计(元)'],...report.modules.promotion.channelCosts.map(p=>[p.label,p.start,p.end,p.status,p.coverage?.validDays??0,p.coverage?.requestedDays??'',...['keyword','wholeSite','audience','content','leads'].map(k=>p.totals?.[k]??null),p.totals?.total??null,p.observedTotals?.total??null])]));
 const metrics=report.modules.metrics;saveNew(path.join(artifactDir,'经营指标.csv'),csv([['周期','开始日期','结束日期',...metrics.metrics.map(m=>m.label)],...plan.periods.map(p=>{const ms=p.mode==='comparison'?metrics.metrics:metrics.trend.metrics;return[p.label,p.start,p.end,...ms.map(m=>m.values[p.id])];})]));
 for(const name of ['promotion','crowd']){const vm=report.modules[name],groups=vm.scenes??[{id:'total',label:'平台合计'},...vm.groups];saveNew(path.join(artifactDir,name+'.csv'),csv([['周期','开始日期','结束日期','分组',...vm.metrics.map(m=>m.label)],...vm.periods.flatMap(p=>groups.map(g=>[p.label,p.start,p.end,g.label,...vm.metrics.map(m=>{const v=p.values[m.id][g.id];return v.kind==='missing'?null:v.kind==='range'?v.raw:m.format==='percent'?(v.value*100).toFixed(4)+'%':v.value;})]))]));}
 const py=pythonRuntime(),renderer=path.join(ROOT,'skill','dmp-product-report','scripts','render.py'),r=spawnSync(py.exe,[...py.prefix,'-B',renderer,path.join(artifactDir,'report.ViewModel.json'),output],{encoding:'utf8',timeout:120000});if(r.status!==0)throw Error('RENDER_FAILED: '+r.stderr.slice(-1500));
 const html=fs.readFileSync(output,'utf8'),checks={iframeModules:(html.match(/<iframe\b/g)??[]).length===3,noExternalDependencies:!/<(?:script|img|iframe)\b[^>]*src=["']https?:\/\//i.test(html)&&!/<link\b[^>]*href=["']https?:\/\//i.test(html),noPrivatePaths:!html.includes('/Users/'),noCredentialFields:!/(?:_tb_token_|csrfId|authorization|document\.cookie)/i.test(html),periods:plan.periods.length===12,noRendererDependency:!html.includes('commerce-ui'),hasOverview:report.overview.length>=2};
 const ok=Object.values(checks).every(Boolean);saveNew(path.join(artifactDir,'validation.json'),{ok,checks,renderer:'bundled-python-stdlib',reportStatus:report.dataStatus,warnings:report.warnings,output});if(!ok)throw Error('REPORT_VALIDATION_FAILED');return{ok:report.dataStatus==='complete',status:report.dataStatus==='complete'?"draft":"partial",stage:"draft",readyForDelivery:false,next:"author analyses using the Skill knowledge, then finalize",output,runDir:run,artifactDir,warnings:report.warnings.length,capabilityGaps:report.capabilityGaps,checks};
}
