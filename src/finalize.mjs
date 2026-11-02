import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {ROOT,pythonRuntime} from './workflow.mjs';
import {saveNew} from './report-data.mjs';
import {Script} from 'node:vm';
import {inspectReportData} from './delivery-validation.mjs';
import {collectAnalysisIssues,issuesError} from './analysis-validation.mjs';
import {componentCatalog} from './analysis-input.mjs';

export function validateAnalysis(report,analysis){
 const {issues}=collectAnalysisIssues(report,analysis);
 if(report.reportVersion!==1||report.plan?.periods?.length!==12||report.coverage?.length!==12)issues.push({path:'/plan/periods',code:'TWELVE_PERIODS_REQUIRED'});
 if(issues.length)throw issuesError('ANALYSIS_VALIDATION_FAILED',issues);
 return true;
}
export function validateArtifact(output,report,py=pythonRuntime()){
 const parsed=spawnSync(py.exe,[...py.prefix,'-B',path.join(ROOT,'skill/dmp-product-report/scripts/validate_html.py'),output],{encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024});
 if(parsed.status!==0)throw Error('HTML_CONTRACT_INVALID: '+parsed.stderr.slice(-500));
 const artifact=JSON.parse(parsed.stdout);
 const checks={...artifact.checks,componentTargetsPresent:componentCatalog(report).every(c=>artifact.rootIds.includes(c.anchor))};
 const states={returned:'有返回',empty:'空结果',unavailable:'查询失败',partial:'覆盖不完整'};
 const expectedCoverage=report.coverage.map(c=>{
  const cells=[c.label,c.start+' 至 '+c.end,c.metricsDateVerified?'已核对':'未核实',...['scenes','keywords','crowdRanges','crowdTable'].map(k=>states[c.modules[k]]??'未执行')];
  if(report.channelCostsRequired){const p=report.modules.promotion.channelCosts.find(p=>p.id===c.id);cells.push((p?.status==='returned'?'完整':'不完整')+' · '+(p?.coverage?.validDays??0)+'/'+(p?.coverage?.requestedDays??'?')+'天');}
  return cells;
 });
 checks.coverageContentMatches=JSON.stringify(artifact.coverageRows)===JSON.stringify(expectedCoverage);
 checks.inlineScriptSyntax=true;
 for(const script of artifact.scripts)try{new Script(script);}catch{checks.inlineScriptSyntax=false;}
 checks.embeddedDataMatches=artifact.dashboards.every((d,i)=>JSON.stringify(d)===JSON.stringify(report.modules[['metrics','promotion','crowd'][i]]));
 return checks;
}
export function finalize(opts){
 if(!opts.viewmodel||!opts.analysis||!opts.out)throw Error('FINALIZE_INPUT_REQUIRED');
 const output=path.resolve(opts.out),model=output+'.ViewModel.json',validation=output+'.validation.json';
 for(const p of [output,model,validation])if(fs.existsSync(p))throw Error('OUTPUT_EXISTS: '+p);
 const draft=JSON.parse(fs.readFileSync(opts.viewmodel,'utf8')),analysis=JSON.parse(fs.readFileSync(opts.analysis,'utf8'));
 const dataValidation=inspectReportData(draft),analysisValidation=collectAnalysisIssues(draft,analysis);
 const inputIssues=[...dataValidation.issues,...analysisValidation.issues];
 if(inputIssues.length)throw issuesError('FINALIZE_INPUT_INVALID',inputIssues);
 const report={...draft,...analysis,dataStatus:dataValidation.complete?'complete':'partial',analyses:{metrics:[],promotion:[],crowd:[]}};
 saveNew(model,report);
 const py=pythonRuntime(),r=spawnSync(py.exe,[...py.prefix,'-B',path.join(ROOT,'skill/dmp-product-report/scripts/render.py'),model,output],{encoding:'utf8',timeout:120000});
 if(r.status!==0)throw Error('RENDER_FAILED: '+r.stderr.slice(-1500));
 const html=fs.readFileSync(output,'utf8'),checks={completeAnalysis:true,modulesDefaultOpen:(html.match(/<details class="module-detail" open>/g)??[]).length===3,iframeModules:(html.match(/<iframe\b/g)??[]).length===3,noExternalDependencies:!/<(?:script|img|iframe)\b[^>]*src=["']https?:\/\//i.test(html)&&!/<link\b[^>]*href=["']https?:\/\//i.test(html),noPrivatePaths:!html.includes('/Users/'),noCredentialFields:!/(?:_tb_token_|csrfId|authorization|document\.cookie)/i.test(html),hasOverview:!html.includes('概览内容待完善')};
 Object.assign(checks,dataValidation.checks,validateArtifact(output,report,py));
 if(report.audienceProfileRequired)checks.audienceProfile=html.includes('id="view-audience"');
 const ok=Object.values(checks).every(Boolean),result={ok,stage:'final',readyForDelivery:ok&&!(report.capabilityGaps?.length)&&dataValidation.complete,completion:report.capabilityGaps?.length?'blocked-capability':dataValidation.complete?'complete':'partial-data',validationContract:'script-delivery@2',next:ok?'deliver-artifacts':'repair-validation-issues',requiredActions:[],components:componentCatalog(report),componentRefs:analysisValidation.componentRefs,artifacts:{html:output,viewmodel:model,validation},acceptance:{method:'deterministic-scripts',browserRequired:false,limits:['Checks validate saved data contracts, formulas, analysis coverage and offline artifact integrity.','Natural-language factual accuracy and causal or strategy judgments require the bundled analysis method and source evidence.','Browser layout and runtime interaction are not certified by static validation.']},artifactHash:createHash('sha256').update(html).digest('hex'),viewmodelHash:createHash('sha256').update(fs.readFileSync(model)).digest('hex'),capabilityGaps:report.capabilityGaps??[],checks,output,viewmodel:model,sourceHash:report.sourceHash,analysisHash:createHash('sha256').update(JSON.stringify(analysis)).digest('hex'),coverage:report.coverage,warnings:report.warnings};
 result.issues=Object.entries(checks).filter(([,valid])=>!valid).map(([key])=>({path:'/checks/'+key,code:'ARTIFACT_CHECK_FAILED'}));result.repairCount=result.issues.length;if(!result.readyForDelivery&&ok)result.next='deliver-partial-with-gaps';saveNew(validation,result);if(!ok)throw issuesError('FINAL_REPORT_VALIDATION_FAILED',result.issues);return result;
}
