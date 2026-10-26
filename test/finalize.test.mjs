import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAnalysis} from '../src/finalize.mjs';
test('finalization refuses a basic draft, partial scene analysis and injected source fields',()=>{
 const report={reportVersion:1,plan:{periods:Array(12)},coverage:Array(12),modules:{metrics:{metrics:[{id:'sales'}]},crowd:{metrics:[{id:'orders'}]},promotion:{scenes:[{id:'s1'}],metrics:[{id:'charge'}]}}};
 const a={conclusion:'数据不足，暂不能判断。',evidence:['金额未返回。'],label:'经营解读'};
 const analysis={metricAnalyses:{sales:a},crowdAnalyses:{orders:a},promotionAnalyses:{s1:{charge:a}},businessInterpretations:{metrics:a,promotion:a,crowd:a},businessOverview:a};
 assert.equal(validateAnalysis(report,analysis),true);
 assert.throws(()=>validateAnalysis(report,{}),/ANALYSIS_FIELDS_REQUIRED/);
 assert.throws(()=>validateAnalysis(report,{...analysis,modules:{}}),/ANALYSIS_FIELDS_REQUIRED/);
 assert.throws(()=>validateAnalysis(report,{...analysis,promotionAnalyses:{}}),/PROMOTION_SCENES_INCOMPLETE/);
 assert.throws(()=>validateAnalysis(report,{...analysis,metricAnalyses:{sales:{conclusion:'无证据'}}}),/METRIC_ANALYSES_INCOMPLETE/);
});
