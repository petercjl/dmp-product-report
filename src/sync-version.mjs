import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
let backupDirectory;
for(const name of ['capabilities.json','skill/dmp-product-report/package.json']){
 const file=path.join(root,name),text=fs.readFileSync(file,'utf8'),data=JSON.parse(text);
 if(data.version===pkg.version)continue;
 backupDirectory??=fs.mkdtempSync(path.join(os.tmpdir(),'dmp-release-manifests-'));
 const backup=path.join(backupDirectory,name.replaceAll('/','-'));
 fs.copyFileSync(file,backup,fs.constants.COPYFILE_EXCL);
 data.version=pkg.version;
 fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
 // Recovery copies stay outside the package tree and cannot enter the tarball.
}

if(backupDirectory)console.log(JSON.stringify({manifestBackupDirectory:backupDirectory}));
