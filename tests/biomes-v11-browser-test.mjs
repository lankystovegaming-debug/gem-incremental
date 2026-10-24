import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.BIOMES_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.BIOMES_CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const output='/private/tmp/biomes-v11-preview';await mkdir(output,{recursive:true});
try {
 for(const width of [360,390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  await page.route('**/__biomes_preview',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/src/styles/app.css"><link rel="stylesheet" href="/gem-index/index.css"></head><body><main style="max-width:1200px;margin:auto;padding:16px"><section class="card biome-index" id="preview"></section><aside id="compact" class="biome-status"></aside></main><script type="module">
 import {mountBiomeIndex} from '/src/ui/biomeIndex.js';
 window.data={serverTime:new Date().toISOString(),active:null,entries:Array.from({length:9},(_,slot)=>({slot,discovered:false}))};
 window.client={rpc:async()=>({data:window.data,error:null})};
 mountBiomeIndex(document.querySelector('#preview'),client);
 mountBiomeIndex(document.querySelector('#compact'),client,{compact:true});
 window.ready=true;
 </script></body></html>`}));
  await page.goto('http://127.0.0.1:5518/__biomes_preview');await page.waitForFunction(()=>window.ready);
  await page.getByText('0 / 9 biomes discovered').waitFor();
  assert.equal(await page.getByText('Phenomena',{exact:true}).count(),0);
  assert.equal(await page.getByText('Undiscovered biome',{exact:true}).count(),9);
  await page.evaluate(()=>{
   const names=['Volcanic','Oceanic','Deep Earth','Frozen','Nightfall','Cosmic','Void','Heavenly','Infernal','Distortion'];
   window.data={serverTime:new Date().toISOString(),active:{id:'test',key:'Distortion',startsAt:new Date(Date.now()-30000).toISOString(),endsAt:new Date(Date.now()+90000).toISOString()},tournament:true,entries:names.map((key,slot)=>({key,slot,discovered:true,phenomenon:slot===9,durationMinutes:2,meanIntervalMinutes:20160,gems:[{name:'A'.repeat(120),denominator:750000000,exclusive:true}]}))};
   document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByText('9 / 9 biomes discovered').waitFor();
  await page.getByText('Phenomena',{exact:true}).waitFor();
  await page.evaluate(()=>document.querySelector('#compact').dispatchEvent(new CustomEvent('biome-batch-period',{detail:{periodMs:250000}})));
  await page.getByText(/Your last accepted batch period/).waitFor();
  const summary=page.locator('#preview summary').first();await summary.focus();await page.keyboard.press('Enter');
  assert.equal(await summary.evaluate(e=>e.parentElement.open),true);
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  assert.equal(await summary.evaluate(e=>e.parentElement.open),true,'poll does not reset disclosure');
  const geometry=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert.ok(geometry.scroll<=geometry.viewport,`${width}px overflow`);
  assert.equal(await page.emulateMedia({reducedMotion:'reduce'}),undefined);
  await page.screenshot({path:`${output}/${width}.png`,fullPage:true});
  await page.close();
 }
} finally {await browser.close();}
console.log('Biome Index browser checks: 360/390/768/1440px, masking, hidden phenomenon, keyboard details, polling persistence, long names, compact Tournament Mode and no horizontal overflow pass.');
