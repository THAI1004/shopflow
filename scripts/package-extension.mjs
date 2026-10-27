import {execFileSync} from 'node:child_process';import {mkdir} from 'node:fs/promises';await mkdir('public',{recursive:true});execFileSync('python',['-c',`import pathlib,zipfile
with zipfile.ZipFile('public/shopflow-extension.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in pathlib.Path('extension').rglob('*'):
  if p.is_file(): z.write(p,p.relative_to('extension'))`],{stdio:'inherit'});console.log('Extension ZIP updated.');
