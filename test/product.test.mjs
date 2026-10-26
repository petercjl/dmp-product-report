import test from 'node:test';
import assert from 'node:assert/strict';
import {productIdentity,embedProductImage} from '../src/product.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {planPeriods,buildReport} from '../src/report-data.mjs';
import {finalize} from '../src/finalize.mjs';
test('product identity only accepts the DMP contract and exact target, preserving missing states',()=>{
 const raw={schemaVersion:1,command:'dmp item-info',itemId:'123',status:'unavailable',product:null,error:'DMP_ITEM_INFO_EMPTY'};
 const p=productIdentity(raw,'123');assert.equal(p.title,null);assert.equal(p.error,'DMP_ITEM_INFO_EMPTY');assert.equal(p.source.capability,'tbcli dmp item-info');
 assert.throws(()=>productIdentity({...raw,command:'item media'},'123'),/SOURCE_ID/);
 assert.throws(()=>productIdentity({...raw,product:{itemId:'456'}},'123'),/PRODUCT_ID_MISMATCH/);
});
test('public image becomes offline bytes; redirects and SVG cannot introduce external execution',async()=>{
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRr8AAAAASUVORK5CYII=','base64');
 const p={mainImageUrl:'https://img.alicdn.com/example.png'};
 const result=await embedProductImage(p,{fetchImpl:async()=>new Response(bytes,{headers:{'content-type':'image/png'}})});
 assert.equal(result.image.status,'embedded');assert.ok(result.image.dataUrl.startsWith('data:image/png;base64,'));
 let calls=0;const bad=await embedProductImage({mainImageUrl:p.mainImageUrl},{fetchImpl:async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});}});
 assert.equal(bad.image.status,'unavailable');assert.equal(calls,1);
 const svg=await embedProductImage({mainImageUrl:p.mainImageUrl},{fetchImpl:async()=>new Response('<svg/>',{headers:{'content-type':'image/svg+xml'}})});
 assert.equal(svg.image.status,'unavailable');
});
test('final HTML displays an offline product card outside the views with escaped identity and working links',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dmp-product-card-'));
 try{
  const plan=planPeriods('2026-10-26');
  const r=buildReport(plan,plan.periods.map(p=>({snapshotVersion:1,itemId:'123',anchorId:'456',period:{startDate:p.start,endDate:p.end},modules:{}})));
  r.product={itemId:'123',title:'商品 <script>alert(1)</script>',itemUrl:'https://item.taobao.com/item.htm?id=123',shop:{shopName:'测试店铺',url:'https://shop456.taobao.com'},source:{capability:'tbcli dmp item-info'},image:{status:'embedded',dataUrl:'data:image/png;base64,aW1hZ2U='}};
  const a={label:'测试',conclusion:'测试资料不足。',evidence:['合成测试资料，无经营结论。']};
  const briefs=ms=>Object.fromEntries(ms.map(m=>[m.id,a]));
  const analysis={metricAnalyses:briefs(r.modules.metrics.metrics),crowdAnalyses:briefs(r.modules.crowd.metrics),promotionAnalyses:Object.fromEntries(r.modules.promotion.scenes.map(s=>[s.id,briefs(r.modules.promotion.metrics)])),businessInterpretations:{metrics:a,promotion:a,crowd:a},businessOverview:a};
  const vm=path.join(tmp,'vm.json'),ap=path.join(tmp,'analysis.json'),out=path.join(tmp,'report.html');fs.writeFileSync(vm,JSON.stringify(r));fs.writeFileSync(ap,JSON.stringify(analysis));
  assert.equal(finalize({viewmodel:vm,analysis:ap,out}).readyForDelivery,true);
  const html=fs.readFileSync(out,'utf8');assert.ok(html.indexOf('class="product-card"')<html.indexOf('id="view-overview"'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('href="https://shop456.taobao.com"'));assert.ok(html.includes('src="data:image/png;base64,'));
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
