import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
export const settingsPath=()=>path.join(os.homedir(),'.config','dmp-product-report','config.json');
export function settings(){try{return JSON.parse(fs.readFileSync(settingsPath(),'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw Error('INVALID_REPORT_CONFIG');}}
export function provider(){const entry=process.env.DMP_REPORT_TBCLI_ENTRY??settings().tbcliEntry;return entry?{exe:process.execPath,prefix:[entry]}:{exe:'tbcli',prefix:[]};}
export function inspectProvider(tool=provider()){
 const env={...process.env,TBCLI_UPDATE_CHECK:'0'};
 const read=args=>{const r=spawnSync(tool.exe,[...tool.prefix,...args],{encoding:'utf8',timeout:30000,env});let data;try{data=JSON.parse(r.stdout);}catch{}return r.status===0?data:null;};
 const catalog=read(['dmp','catalog','--json']),capabilities=read(['capabilities','--json']);
 const snapshot=catalog?.snapshot;return {ok:snapshot?.version===2&&snapshot?.subjectMode==='target-only'&&capabilities?.itemSummary?.version===1,snapshotVersion:snapshot?.version??null,subjectMode:snapshot?.subjectMode??null,independentRoutes:snapshot?.independentRoutes??{},fullAnalysisAvailable:['metrics7','scenes','keywords','crowdRanges','crowdTable'].every(k=>snapshot?.independentRoutes?.[k]==='verified-saved-request'),itemSummaryVersion:capabilities?.itemSummary?.version??null};
}
export function configure(opts){
 const entry=path.resolve(opts.tbcliEntry??'');if(!opts.tbcliEntry||!fs.statSync(entry).isFile()||!entry.endsWith('.mjs'))throw Error('TBCLI_ENTRY_REQUIRED');
 if(!inspectProvider({exe:process.execPath,prefix:[entry]}).ok)throw Error('TBCLI_ITEM_SUMMARY_CAPABILITY_REQUIRED');
 const file=settingsPath(),data=settings();fs.mkdirSync(path.dirname(file),{recursive:true});let backup=null;
 if(fs.existsSync(file)){if(!fs.lstatSync(file).isFile())throw Error('CONFIG_FILE_REQUIRED');backup=file+'.backup-'+randomUUID();fs.copyFileSync(file,backup,fs.constants.COPYFILE_EXCL);}
 const temp=file+'.'+randomUUID();fs.writeFileSync(temp,JSON.stringify({...data,tbcliEntry:entry},null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(temp,file);
 return {ok:true,configuration:file,tbcliEntry:entry,backup};
}
