import fs from 'node:fs';
import {analysisSchema,componentCatalog} from './analysis-input.mjs';

// The generated schema uses only the JSON Schema keywords implemented here.
// Collect independent failures; one missing parent is one actionable issue.
export function schemaIssues(schema,value,pointer='',issues=[],root=schema){
 if(schema.$ref){const target=schema.$ref.slice(2).split('/').reduce((o,k)=>o?.[k],root);if(!target)throw Error('INVALID_SCHEMA_REFERENCE');return schemaIssues(target,value,pointer,issues,root);}
 const add=(rule,expected)=>issues.push({path:pointer||'/',rule,expected});
 if(Object.hasOwn(schema,'const')&&JSON.stringify(value)!==JSON.stringify(schema.const))add('const',schema.const);
 if(schema.enum&&!schema.enum.includes(value))add('enum',schema.enum);
 if(schema.type){const ok=schema.type==='object'?value!==null&&typeof value==='object'&&!Array.isArray(value):schema.type==='array'?Array.isArray(value):typeof value===schema.type;if(!ok){add('type',schema.type);return issues;}}
 if(typeof value==='string'){
  if(schema.minLength!==undefined&&value.length<schema.minLength)add('minLength',schema.minLength);
  else if(schema.pattern&&!new RegExp(schema.pattern).test(value))add('pattern',schema.pattern);
 }
 if(Array.isArray(value)){
  if(schema.minItems!==undefined&&value.length<schema.minItems)add('minItems',schema.minItems);
  if(schema.uniqueItems&&new Set(value.map(x=>JSON.stringify(x))).size!==value.length)add('uniqueItems',true);
  if(schema.items)value.forEach((x,i)=>schemaIssues(schema.items,x,pointer+'/'+i,issues,root));
 }
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  for(const k of schema.required??[])if(!Object.hasOwn(value,k))issues.push({path:pointer+'/'+k,rule:'required'});
  for(const [k,x] of Object.entries(value)){
   const child=pointer+'/'+k.replaceAll('~','~0').replaceAll('/','~1');
   if(schema.properties?.[k])schemaIssues(schema.properties[k],x,child,issues,root);
   else if(schema.additionalProperties===false)issues.push({path:child,rule:'additionalProperties'});
  }
 }
 return issues;
}
const codeFor=path=>path.startsWith('/metricAnalyses/')||path.startsWith('/crowdAnalyses/')?'METRIC_ANALYSES_INCOMPLETE':path.startsWith('/promotionAnalyses/')?(path.split('/').length>3?'PROMOTION_ANALYSES_INCOMPLETE':'PROMOTION_SCENES_INCOMPLETE'):path.startsWith('/audienceAnalyses/')?'AUDIENCE_ANALYSES_INCOMPLETE':path.startsWith('/business')?'BUSINESS_INTERPRETATION_REQUIRED':'ANALYSIS_FIELDS_REQUIRED';
export function collectAnalysisIssues(report,analysis){
 const schema=analysisSchema(report,{legacy:analysis?.analysisVersion===undefined});
 const issues=schemaIssues(schema,analysis).map(x=>({...x,code:codeFor(x.path)}));
 const components=componentCatalog(report),aliases=new Map(components.map(c=>[c.label,c.id]));
 // Explicit component references are schema-enumerated. Recognized prose aliases
 // are also recorded, so the rendered artifact must actually contain the target.
 const refs=new Set();
 const visit=(v,p)=>{
  if(!v||typeof v!=='object')return;
  if(analysis?.analysisVersion===2&&Array.isArray(v.sourceRefs)&&v.sourceRefs.length){
   const metric=p.split('/')[3];
   const families=p.startsWith('/metricAnalyses/')?['metrics:']:p.startsWith('/promotionAnalyses/')?(report.channelCostsRequired&&metric==='charge'?['channelCosts:']:metric==='estimatedDirectRoi'?['promotion:','channelCosts:']:['promotion:']):p.startsWith('/crowdAnalyses/')?['crowd:']:p.startsWith('/audienceAnalyses/')?['audience:'+p.split('/')[2]]:[];
   for(const family of families)if(!v.sourceRefs.some(id=>typeof id==='string'&&id.startsWith(family)))issues.push({path:p+'/sourceRefs',code:'SOURCE_REFERENCE_SCOPE',expected:family});
  }
  if(Array.isArray(v.componentRefs))for(const id of v.componentRefs)if(typeof id==='string')refs.add(id);
  for(const [k,x] of Object.entries(v)){
   if(typeof x==='string'){
    for(const [label,id] of aliases)if(x.includes(label))refs.add(id);
    for(const m of x.matchAll(/\[\[component:([^\]]+)\]\]/g)){
     refs.add(m[1]);if(!components.some(c=>c.id===m[1]))issues.push({path:p+'/'+k,code:'UNKNOWN_COMPONENT_REFERENCE',rule:'component',expected:components.map(c=>c.id)});
    }
   }else if(x&&typeof x==='object')visit(x,p+'/'+k);
  }
 };
 visit(analysis,'');
 return {issues,componentRefs:[...refs].filter(id=>components.some(c=>c.id===id))};
}
export function issuesError(code,issues){
 const e=Error(code+': '+issues.map(i=>i.code??i.rule).filter((x,i,a)=>a.indexOf(x)===i).join(', '));
 e.code=code;e.details={repairCount:issues.length,issues};return e;
}
export function checkAnalysis(opts,inspectData){
 if(!opts.viewmodel||!opts.analysis)throw Error('ANALYSIS_CHECK_INPUT_REQUIRED');
 const report=JSON.parse(fs.readFileSync(opts.viewmodel,'utf8')),analysis=JSON.parse(fs.readFileSync(opts.analysis,'utf8'));
 const data=inspectData(report),a=collectAnalysisIssues(report,analysis),issues=[...data.issues,...a.issues];
 return {ok:issues.length===0,readyToRender:issues.length===0,dataComplete:data.complete,repairCount:issues.length,issues,componentRefs:a.componentRefs,next:issues.length?'Repair listed paths together; rerun check-analysis before finalize.':'Run finalize once to a new HTML path.'};
}
