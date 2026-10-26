import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {ROOT,pythonRuntime} from './workflow.mjs';
import {saveNew} from './report-data.mjs';

const required=['metricAnalyses','promotionAnalyses','crowdAnalyses','businessInterpretations','businessOverview'];
function brief(a){return a&&typeof a.conclusion==='string'&&a.conclusion.trim()&&Array.isArray(a.evidence)&&a.evidence.length>0&&a.evidence.every(x=>typeof x==='string'&&x.trim());}
function sameKeys(object,keys){return object&&JSON.stringify(Object.keys(object).sort())===JSON.stringify([...keys].sort());}
export function validateAnalysis(report,analysis){
 if(!sameKeys(analysis,required))throw Error('ANALYSIS_FIELDS_REQUIRED');
 for(const [key,module] of [['metricAnalyses','metrics'],['crowdAnalyses','crowd']]){
  if(!sameKeys(analysis[key],report.modules[module].metrics.map(m=>m.id))||!Object.values(analysis[key]).every(brief))throw Error('METRIC_ANALYSES_INCOMPLETE: '+module);
 }
 if(!sameKeys(analysis.promotionAnalyses,report.modules.promotion.scenes.map(s=>s.id)))throw Error('PROMOTION_SCENES_INCOMPLETE');
 for(const items of Object.values(analysis.promotionAnalyses))if(!sameKeys(items,report.modules.promotion.metrics.map(m=>m.id))||!Object.values(items).every(brief))throw Error('PROMOTION_ANALYSES_INCOMPLETE');
 if(!sameKeys(analysis.businessInterpretations,['metrics','promotion','crowd'])||!Object.values(analysis.businessInterpretations).every(a=>brief(a)&&typeof a.label==='string'&&a.label.trim())||!brief(analysis.businessOverview)||!analysis.businessOverview.label)throw Error('BUSINESS_INTERPRETATION_REQUIRED');
 if(report.reportVersion!==1||report.plan?.periods?.length!==12||report.coverage?.length!==12)throw Error('TWELVE_PERIODS_REQUIRED');
 return true;
}
export function finalize(opts){
 if(!opts.viewmodel||!opts.analysis||!opts.out)throw Error('FINALIZE_INPUT_REQUIRED');
 const output=path.resolve(opts.out),model=output+'.ViewModel.json',validation=output+'.validation.json';
 for(const p of [output,model,validation])if(fs.existsSync(p))throw Error('OUTPUT_EXISTS: '+p);
 const draft=JSON.parse(fs.readFileSync(opts.viewmodel,'utf8')),analysis=JSON.parse(fs.readFileSync(opts.analysis,'utf8'));
 validateAnalysis(draft,analysis);
 const report={...draft,...analysis,analyses:{metrics:[],promotion:[],crowd:[]}};
 saveNew(model,report);
 const py=pythonRuntime(),r=spawnSync(py.exe,[...py.prefix,'-B',path.join(ROOT,'skill/dmp-product-report/scripts/render.py'),model,output],{encoding:'utf8',timeout:120000});
 if(r.status!==0)throw Error('RENDER_FAILED: '+r.stderr.slice(-1500));
 const html=fs.readFileSync(output,'utf8'),checks={completeAnalysis:true,modulesDefaultOpen:(html.match(/<details class="module-detail" open>/g)??[]).length===3,iframeModules:(html.match(/<iframe\b/g)??[]).length===3,noExternalDependencies:!/<(?:script|img|iframe)\b[^>]*src=["']https?:\/\//i.test(html)&&!/<link\b[^>]*href=["']https?:\/\//i.test(html),noPrivatePaths:!html.includes('/Users/'),noCredentialFields:!/(?:_tb_token_|csrfId|authorization|document\.cookie)/i.test(html),hasOverview:!html.includes('概览内容待完善')};
 const ok=Object.values(checks).every(Boolean),result={ok,stage:'final',readyForDelivery:ok,checks,output,viewmodel:model,sourceHash:report.sourceHash,analysisHash:createHash('sha256').update(JSON.stringify(analysis)).digest('hex'),coverage:report.coverage,warnings:report.warnings};
 saveNew(validation,result);if(!ok)throw Error('FINAL_REPORT_VALIDATION_FAILED');return result;
}
