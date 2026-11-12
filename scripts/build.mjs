import {mkdir,rm,copyFile,readdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
await rm('dist',{recursive:true,force:true});await mkdir('dist');
// Explicit public allowlist. Dashboard HTML, server code, tests and secrets never enter dist.
for(const name of ['index.html','account.css','premium.css','arcade-theme.css','arcade-crew.js','premium.js','kaibot.js','kaibot-command.js','kaibot-command.css','paper-monitor.js','paper-signal-status.js','command-layout.js','terminal-enhancements.js','btc-spot-chart.js','btc-lock-radar.js','upgrade-status.js','omega-status.js','service-worker.js','push-client.js','easy-mode.js','spot-timeframes.js','coinbase-direct.js','polymarket.css'])await copyFile(name,'dist/'+name);
await build({entryPoints:['src/account-client.js'],bundle:true,minify:true,platform:'browser',target:['safari16','chrome110','firefox115'],outfile:'dist/account-client.js'});
await build({entryPoints:['src/dashboard-session.js'],bundle:true,minify:true,platform:'browser',target:['safari16','chrome110','firefox115'],outfile:'dist/dashboard-session.js'});
await build({entryPoints:['src/learning-lab.js'],bundle:true,minify:true,platform:'browser',target:['safari16','chrome110','firefox115'],outfile:'dist/learning-lab.js'});
await build({entryPoints:['src/btc-predator.mjs'],bundle:true,minify:true,platform:'browser',format:'esm',target:'safari16',outfile:'dist/btc-predator.js'});
if((await readdir('dist')).some(n=>/dashboard\.html|private|\.env|package/.test(n)))throw Error('Private file in public output');

await writeFile('dist/build-version.json',JSON.stringify({version:process.env.COMMIT_REF||process.env.DEPLOY_ID||'local-build'}));

const commit = process.env.COMMIT_REF;
await writeFile('netlify/functions/lib/live-build-commit.json', JSON.stringify({commit: /^[a-f0-9]{40}$/.test(commit || '') ? commit : null}) + '\n');

await build({entryPoints:['polymarket.js'],bundle:true,platform:'browser',format:'esm',target:'safari16',outfile:'dist/polymarket.js'});
