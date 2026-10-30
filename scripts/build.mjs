import {mkdir,rm,copyFile,readdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
await rm('dist',{recursive:true,force:true});await mkdir('dist');
// Explicit public allowlist. Dashboard HTML, server code, tests and secrets never enter dist.
for(const name of ['index.html','account.css','premium.css','premium.js','kaibot.js','terminal-enhancements.js','btc-spot-chart.js','upgrade-status.js'])await copyFile(name,'dist/'+name);
await build({entryPoints:['src/account-client.js'],bundle:true,minify:true,platform:'browser',target:['safari16','chrome110','firefox115'],outfile:'dist/account-client.js'});
await build({entryPoints:['src/dashboard-session.js'],bundle:true,minify:true,platform:'browser',target:['safari16','chrome110','firefox115'],outfile:'dist/dashboard-session.js'});
await build({entryPoints:['src/learning-lab.js'],bundle:true,minify:true,platform:'browser',target:['safari16','chrome110','firefox115'],outfile:'dist/learning-lab.js'});
if((await readdir('dist')).some(n=>/dashboard\.html|private|\.env|package/.test(n)))throw Error('Private file in public output');

await writeFile('dist/build-version.json',JSON.stringify({version:process.env.COMMIT_REF||process.env.DEPLOY_ID||'local-build'}));
