import test from 'node:test';import assert from 'node:assert/strict';
import {buildAudienceProfile,audienceTypes,audienceDimensions} from '../src/audience-profile.mjs';
import {validateAnalysis} from '../src/finalize.mjs';
const reports=()=>audienceTypes.map(t=>({audienceVersion:1,itemId:'123',audienceType:t,status:'complete',period:{type:'rolling',days:30},dimensions:audienceDimensions.map(id=>({id,label:id,multiLabel:id==='segments',status:'returned',countSum:12,rows:[{label:'A',count:8,platformRate:'.8'},{label:'未知',count:4,platformRate:'.4'}],source:{raw:{secret:'not-copied'}}}))}));
test('portrait preserves independent dimensions, labels and partial collection, rejects wrong subject/window',()=>{
 const p=buildAudienceProfile('123',reports());assert.equal(p.status,'complete');assert.equal(p.behaviors.length,5);assert.equal(p.behaviors[0].dimensions[0].source.raw,undefined);assert.ok(p.analyses.purchase.note.includes('独立分布'));assert.equal(p.behaviors[0].dimensions[4].rows[0].platformRate,'.8');
 assert.equal(buildAudienceProfile('123',reports().slice(0,1)).status,'partial');
 for(const bad of [{itemId:'456'},{period:{type:'rolling',days:7}},{dimensions:[{id:'other',rows:[]}]}])assert.throws(()=>buildAudienceProfile('123',[{...reports()[0],...bad}]),/AUDIENCE_/);
 const broken=reports();broken[0].dimensions[0].countSum=1;assert.throws(()=>buildAudienceProfile('123',broken),/AUDIENCE_COUNT_MISMATCH/);
});
test('final analysis requires every behavior when portraits are part of the report',()=>{
 const brief={label:'画像解读',conclusion:'已知特征。',evidence:['样本及占比。']};
 const report={reportVersion:1,audienceProfileRequired:true,plan:{periods:Array(12)},coverage:Array(12),modules:{metrics:{metrics:[{id:'sales'}]},crowd:{metrics:[{id:'people'}]},promotion:{scenes:[{id:'s1'}],metrics:[{id:'charge'}]}}};
 const analysis={metricAnalyses:{sales:brief},crowdAnalyses:{people:brief},promotionAnalyses:{s1:{charge:brief}},businessInterpretations:{metrics:brief,promotion:brief,crowd:brief},businessOverview:brief,audienceAnalyses:Object.fromEntries(audienceTypes.map(t=>[t,brief]))};
 assert.equal(validateAnalysis(report,analysis),true);delete analysis.audienceAnalyses.cart;assert.throws(()=>validateAnalysis(report,analysis),/AUDIENCE_ANALYSES_INCOMPLETE/);delete analysis.audienceAnalyses;assert.throws(()=>validateAnalysis(report,analysis),/ANALYSIS_FIELDS_REQUIRED/);
});
