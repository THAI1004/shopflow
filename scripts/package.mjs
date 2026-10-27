import {mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
await mkdir('outputs',{recursive:true});
const python=`import pathlib,zipfile
root=pathlib.Path('.')
common=['app.js','package.json','package-lock.json','.env.example','README.md','HUONG-DAN-CPANEL.md','KET-QUA-KIEM-THU.md']
for target,files,folders in [('shopflow-node-cpanel.zip',common,['dist','server','lib','extension']),('shopflow-source.zip',common+['index.html','vite.config.mjs','tsconfig.json'],['src','server','lib','extension','public','scripts','tests'])]:
 with zipfile.ZipFile('outputs/'+target,'w',zipfile.ZIP_DEFLATED) as z:
  for name in files: z.write(root/name,name)
  for folder in folders:
   for p in (root/folder).rglob('*'):
    if p.is_file() and (target.endswith('source.zip') or not p.name.startswith('qa-')): z.write(p,p.as_posix())
  if target.endswith('source.zip'):
   z.write('outputs/media-qa.json','outputs/media-qa.json')
`;
execFileSync('python',['-c',python],{stdio:'inherit'});
console.log('Packaged deployment and full source ZIPs.');
