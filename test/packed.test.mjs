import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {ROOT} from '../src/workflow.mjs';
import {planPeriods,buildReport} from '../src/report-data.mjs';

test('packed runtime survives bootstrap removal and other host removal, then renders an offline final report',{timeout:180000},()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dmp-packed-'));
 const invoke=(exe,args,cwd=tmp)=>{const r=spawnSync(exe,args,{cwd,encoding:'utf8',timeout:90000,env:{...process.env,AGENT_PACKAGE_UPDATE_CHECK:'0'}});assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout;};
 try{
  const npm=process.platform==='win32'?process.execPath:'npm';
  // On Windows invoke npm-cli.js through Node rather than a shell .cmd wrapper.
  const npmPrefix=process.platform==='win32'?[process.env.npm_execpath]:[];
  const pack=JSON.parse(invoke(npm,[...npmPrefix,'pack','--ignore-scripts','--json','--pack-destination',tmp],ROOT))[0];
  assert.ok(pack.files.every(f=>!/\.before-|\.backup(?:\.|$)|__pycache__|\.pyc$/.test(f.path)), 'public artifact must omit development recovery files');
  const bootstrap=path.join(tmp,'bootstrap');
  invoke(npm,[...npmPrefix,'install','--prefix',bootstrap,path.join(tmp,pack.filename),'--ignore-scripts','--no-audit','--no-fund']);
  const entry=path.join(bootstrap,'node_modules/@petercjl/dmp-product-report/bin/dmp-product-report.mjs');
  const hostA=path.join(tmp,'a'),hostB=path.join(tmp,'b');
  for(const [host,agent] of [[hostA,'generic-a'],[hostB,'independent-b']])invoke(process.execPath,[entry,'skill','install','--target-dir',host,'--agent',agent,'--json']);
  const survivor=path.join(hostB,'dmp-product-report'),owned=path.join(survivor,'.runtime/bin/dmp-product-report.mjs');
  assert.equal(fs.lstatSync(survivor).isSymbolicLink(),false);
  fs.rmSync(bootstrap,{recursive:true,force:true});fs.rmSync(hostA,{recursive:true,force:true});
  const version=JSON.parse(invoke(process.execPath,[owned,'version','--json']));
  assert.equal(version.version,JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'))).version);
  const plan=planPeriods('2026-10-26'),snapshots=plan.periods.map(p=>({snapshotVersion:1,itemId:'123',anchorId:'456',period:{startDate:p.start,endDate:p.end},modules:{}}));
  const report=buildReport(plan,snapshots),draft=path.join(tmp,'draft.json'),analysisPath=path.join(tmp,'analysis.json');
  fs.writeFileSync(draft,JSON.stringify(report),{flag:'wx'});
  const a={label:'经营解读',conclusion:'返回数据不足，暂不能判断。',evidence:['本周期未返回指标原值。']};
  const briefs=ms=>Object.fromEntries(ms.map(m=>[m.id,a]));
  fs.writeFileSync(analysisPath,JSON.stringify({metricAnalyses:briefs(report.modules.metrics.metrics),promotionAnalyses:Object.fromEntries(report.modules.promotion.scenes.map(s=>[s.id,briefs(report.modules.promotion.metrics)])),crowdAnalyses:briefs(report.modules.crowd.metrics),businessInterpretations:{metrics:a,promotion:a,crowd:a},businessOverview:a}),{flag:'wx'});
  const output=path.join(tmp,'final.html');
  const final=JSON.parse(invoke(process.execPath,[owned,'finalize','--viewmodel',draft,'--analysis',analysisPath,'--out',output,'--json']));
  assert.equal(final.readyForDelivery,true);assert.ok(fs.statSync(output).size>10000);
  assert.equal(final.checks.modulesDefaultOpen,true);
  const status=JSON.parse(invoke(process.execPath,[owned,'skill','status','--target-dir',hostB,'--agent','independent-b','--json']));
  assert.equal(status.current,true);assert.equal(status.verification.verified,true);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
