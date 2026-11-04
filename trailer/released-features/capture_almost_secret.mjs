import {chromium} from '/Users/lanky/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';

const base=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(base,'../..');
const output=path.join(base,'assets/almost-secret');
await fs.mkdir(output,{recursive:true});
const mime={'.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/'){
    res.setHeader('Content-Type','text/html');
    res.end(`<!doctype html><html><head><link rel="stylesheet" href="/src/styles/app.css"><link rel="stylesheet" href="/src/ui/cutsceneScenes.css"></head><body style="margin:0;background:black"><script type="module">
      import {renderCutscene} from '/src/ui/cutsceneScenes.js';
      window.startAlmost=()=>renderCutscene({gem:{name:'almost secret',rarity:999999999},mutationIds:[],mutations:[],cutsceneEnvelope:{},actualChanceLabel:'1 in 999,999,999'},16000,{replay:true});
    </script></body></html>`);
    return;
  }
  // Offline capture: settings are irrelevant to this unmutated cinematic.
  if(pathname==='/src/ui/settings.js'){
    res.setHeader('Content-Type','text/javascript');res.end('export const getSettings=()=>({});');return;
  }
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(await fs.readFile(file));}
  catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>typeof window.startAlmost==='function');
  await page.evaluate(()=>document.fonts.ready);
  await page.clock.install({time:new Date('2026-10-28T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-10-28T00:00:01Z'));
  await page.evaluate(()=>window.startAlmost());
  const counters=[];
  for(let i=0;i<330;i++){
    if(i)await page.clock.runFor(1000/30);
    await page.evaluate(t=>{
      document.querySelector('#ultra-cutscene-overlay').style.opacity='1';
      for(const animation of document.getAnimations()){animation.pause();animation.currentTime=t;}
    },i*1000/30);
    const counter=await page.locator('.cs-counter').textContent();
    counters.push(counter);
    await page.screenshot({path:path.join(output,`frame-${String(i).padStart(4,'0')}.jpg`),type:'jpeg',quality:95});
    if(i%30===0)console.log(`cutscene ${i/30}s: ${counter}`);
    if(counter==='999,999,999')break;
  }
  if(counters.at(-1)!=='999,999,999')throw new Error('Counter endpoint not reached');
  await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({fps:30,frames:counters.length,counters,source:'src/ui/cutsceneScenes.js',durationMs:16000},null,2)+'\n');
  console.log(`Captured ${counters.length} frames, ending on ${counters.at(-1)}`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
