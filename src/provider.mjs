import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
export const settingsPath=()=>path.join(os.homedir(),'.config','dmp-product-report','config.json');
export function settings(){try{return JSON.parse(fs.readFileSync(settingsPath(),'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw Error('INVALID_REPORT_CONFIG');}}
export function provider(){const entry=process.env.DMP_REPORT_TBCLI_ENTRY??settings().tbcliEntry;return entry?{exe:process.execPath,prefix:[entry]}:{exe:'tbcli',prefix:[]};}
export function configure(opts){
 const entry=path.resolve(opts.tbcliEntry??'');if(!opts.tbcliEntry||!fs.statSync(entry).isFile()||!entry.endsWith('.mjs'))throw Error('TBCLI_ENTRY_REQUIRED');
 const r=spawnSync(process.execPath,[entry,'dmp','catalog','--json'],{encoding:'utf8',timeout:30000,env:{...process.env,TBCLI_UPDATE_CHECK:'0'}});let c;try{c=JSON.parse(r.stdout);}catch{}
 if(r.status!==0||c?.itemInfo?.version!==1||c?.snapshot?.version!==1)throw Error('TBCLI_IDENTITY_CAPABILITY_REQUIRED');
 const file=settingsPath(),data=settings();fs.mkdirSync(path.dirname(file),{recursive:true});let backup=null;
 if(fs.existsSync(file)){if(!fs.lstatSync(file).isFile())throw Error('CONFIG_FILE_REQUIRED');backup=file+'.backup-'+randomUUID();fs.copyFileSync(file,backup,fs.constants.COPYFILE_EXCL);}
 const temp=file+'.'+randomUUID();fs.writeFileSync(temp,JSON.stringify({...data,tbcliEntry:entry},null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(temp,file);
 return {ok:true,configuration:file,tbcliEntry:entry,backup};
}
