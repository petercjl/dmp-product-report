import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import {ROOT} from '../src/workflow.mjs';
test('release bump synchronizes manifests and keeps recovery files outside the package tree',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dmp-bump-test-'));let backup;
 try{
  fs.mkdirSync(path.join(tmp,'src'));fs.mkdirSync(path.join(tmp,'skill/dmp-product-report'),{recursive:true});
  fs.copyFileSync(path.join(ROOT,'src/sync-version.mjs'),path.join(tmp,'src/sync-version.mjs'),fs.constants.COPYFILE_EXCL);
  for(const [name,version] of [['package.json','1.0.1'],['capabilities.json','1.0.0'],['skill/dmp-product-report/package.json','1.0.0']])fs.writeFileSync(path.join(tmp,name),JSON.stringify({version}),{flag:'wx'});
  const r=spawnSync(process.execPath,[path.join(tmp,'src/sync-version.mjs')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);backup=JSON.parse(r.stdout).manifestBackupDirectory;
  assert.equal(backup.startsWith(tmp+path.sep),false);
  for(const name of ['capabilities.json','skill/dmp-product-report/package.json']){assert.equal(JSON.parse(fs.readFileSync(path.join(tmp,name))).version,'1.0.1');assert.equal(fs.existsSync(path.join(tmp,name+'.before-1.0.0')),false);}
  assert.equal(JSON.parse(fs.readFileSync(path.join(backup,'skill-dmp-product-report-package.json'))).version,'1.0.0');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});if(backup)fs.rmSync(backup,{recursive:true,force:true});}
});
