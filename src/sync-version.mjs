import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
for(const name of ['capabilities.json','skill/dmp-product-report/package.json']){
 const file=path.join(root,name),text=fs.readFileSync(file,'utf8'),data=JSON.parse(text);
 if(data.version===pkg.version)continue;
 const backup=file+'.before-'+data.version;
 fs.writeFileSync(backup,text,{flag:'wx'});
 data.version=pkg.version;
 fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
 // The original is retained in Git; omit ephemeral release backups from the package.
}
