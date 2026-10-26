#!/usr/bin/env node
import {doctor,collect,build,ROOT} from '../src/workflow.mjs';
import {configure} from '../src/provider.mjs';
import {finalize} from '../src/finalize.mjs';
import {runMaintenance,autoDetect,maintenanceManifest} from '../src/package-runtime.mjs';
import fs from 'node:fs';import path from 'node:path';
const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'))),argv=process.argv.slice(2),command=argv.shift()??'help';
const config={root:ROOT,name:pkg.name,version:pkg.version,tool:'dmp-product-report',skills:['dmp-product-report'],entry:'bin/dmp-product-report.mjs',runtimeItems:['package.json','bin','src','skill','capabilities.json','README.md','INSTALL.md','UPDATE.md'],targetEnvironment:'DMP_REPORT_SKILL_TARGET'};
try{
 if(command==='version'||command==='--version'){console.log(argv.includes('--json')?JSON.stringify({ok:true,package:pkg.name,version:pkg.version}):pkg.version);}
 else if(['skill','update','operation'].includes(command)){await runMaintenance(config,command,argv);}
 else if(command==='capabilities'){console.log(JSON.stringify(maintenanceManifest(config)));}
 else if(command==='help'||command==='--help'||argv.includes('--help')){if(argv.includes('--json')){console.log(JSON.stringify(maintenanceManifest(config)));}else console.log('dmp-product-report run --item-id ID --anchor-id OWNED_ID --out-dir NEW_DIR [--as-of YYYY-MM-DD]\ncollect: same inputs; build --run-dir DIR [--out NEW.html]\nfinalize --viewmodel DRAFT.json --analysis ANALYSIS.json --out NEW.html\nconfigure --tbcli-entry TOOL_ENTRY.mjs\ndoctor --json; version --json; capabilities --json\nskill source|status|install|update --target-dir PARENT --agent NAME --json\nupdate check|install --target-dir PARENT --agent NAME --json');}
 else{
  const options={};const allowed=new Set(command==='configure'?['tbcli-entry']:command==='finalize'?['viewmodel','analysis','out']:command==='build'?['run-dir','out']:command==='doctor'?[]:['item-id','anchor-id','out-dir','as-of','cdp-url']);for(let i=0;i<argv.length;i++){const arg=argv[i];if(arg==='--json')continue;if(!arg.startsWith('--')||!allowed.has(arg.slice(2))||argv[i+1]===undefined||argv[i+1].startsWith('--'))throw Error('INVALID_ARGUMENT: '+arg);const key=arg.slice(2).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());if(Object.hasOwn(options,key))throw Error('DUPLICATE_ARGUMENT');options[key]=argv[++i];}
  if(command==='configure'){console.log(JSON.stringify(configure(options)));}
  else if(command==='doctor'){const r=doctor();console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=1;}
  else if(command==='run'||command==='collect'){await autoDetect(config);const dir=await collect(options);console.log(JSON.stringify(command==='run'?build({runDir:dir}):{ok:true,runDir:dir}));}
  else if(command==='finalize'){console.log(JSON.stringify(finalize(options)));}
  else if(command==='build'){console.log(JSON.stringify(build(options)));}
  else throw Error('UNKNOWN_COMMAND');
 }
}catch(e){console.error(JSON.stringify({ok:false,code:e.code??e.message.split(':')[0],message:e.message}));process.exitCode=1;}
