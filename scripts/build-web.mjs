import { build } from 'esbuild';
import { mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
await rm('build/web', { recursive: true, force: true });
await mkdir('build/web', { recursive: true });
const result = await build({entryPoints:['web/main.tsx'],outdir:'build/web',bundle:true,minify:true,metafile:true,format:'iife',target:'safari16',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff2':'file','.woff':'file','.ttf':'file'},legalComments:'linked'});
await writeFile('build/metafile.json',JSON.stringify(result.metafile,null,2));
await copyFile('web/index.html','build/web/index.html');
