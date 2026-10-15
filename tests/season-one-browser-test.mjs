import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.SEASON_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.SEASON_PREVIEW_URL||'http://127.0.0.1:5521';
const tiers=JSON.parse(await readFile(new URL('../docs/season-one-rewards.json',import.meta.url),'utf8'));
const sid='10000000-0000-4000-8000-000000000001',zero='20000000-0000-4000-8000-000000000001';
const one={id:sid,name:'Season 1 — The Interlude',starts_at:'2026-10-17T00:00:00Z',ends_at:'2026-11-16T00:00:00Z',tiers,metadata:{premiumPrice:10000000}},old={...one,id:zero,name:'Season Zero — First Light',starts_at:'2026-08-22T00:00:00Z',ends_at:'2026-09-21T00:00:00Z',metadata:{premiumPrice:5000000}};
const fixture=`const one=${JSON.stringify(one)},old=${JSON.stringify(old)};let premium=false,claimed=[];window.testNow='2026-10-18T00:00:00Z';window.calls=[];window.invokeSeason=async(action,body)=>{window.calls.push({action,...body});const season=body.seasonId===old.id?old:one;if(action==='purchase-premium')premium=true;if(action==='claim-tier')claimed.push(body.lane+':'+body.tier);return {data:action==='list'?{season,seasons:[one,old],progress:{xp:25000,premium,claimed_tiers:claimed,roll_xp_today:125},missions:season.id===one.id?[...Array(5)].map((_,i)=>({cadence:i<2?'daily':'weekly',slot:i<2?i+1:i-1,title:i%2?'Legendary Survey':'Persistent Miner',category:i%2?'legendary':'rolls',progress:0,awarded_tiers:0,thresholds:i<2?[75,200,400]:[750,1750,3500,6000],xp_rewards:i<2?[50,100,150]:[100,150,250,350],item_reward:{type:'consumable',id:'lucky-potion-2',quantity:1}})):[],rerolls:[],serverNow:window.testNow}:{claimed:0},error:null}};`;
const browser=await chromium.launch({headless:true,...(process.env.SEASON_CHROMIUM_PATH?{executablePath:process.env.SEASON_CHROMIUM_PATH}:{})});
await mkdir('/private/tmp/interlude-browser',{recursive:true});
try{
 for(const width of [320,360,390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
   if(url.pathname==='/src/ui/shell.js')return route.fulfill({contentType:'text/javascript',body:'export const mountShell=()=>{};'});
   if(url.pathname==='/src/backend/invoke.js')return route.fulfill({contentType:'text/javascript',body:fixture+'export const invokeFunction=async(_,body)=>window.invokeSeason(body.action,body);'});
   if(url.pathname==='/src/ui/toast.js')return route.fulfill({contentType:'text/javascript',body:'export const notify={success:()=>{},error:()=>{}};'});
   if(url.pathname==='/src/ui/dialog.js')return route.fulfill({contentType:'text/javascript',body:'export const confirmDialog=async x=>{window.confirmed=x;return "confirm";};'});
   return route.continue();
  });
  await page.goto(base+'/seasons/');await page.waitForFunction(()=>document.querySelectorAll('.tier-card').length===50);
  assert.equal(await page.locator('.reward').count(),100);assert.equal(await page.locator('[data-reroll]').count(),2);
  assert.match(await page.locator('#premiumPrice').textContent(),/10M|10,000,000/);
  assert.match(await page.locator('#seasonName').textContent(),/Interlude/);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page overflow '+width);
  const buttons=await page.locator('[data-claim], [data-reroll], #seasonSelect').evaluateAll(bs=>bs.every(b=>b.getBoundingClientRect().height>=44));assert(buttons,'touch targets');
  await page.screenshot({path:`/private/tmp/interlude-browser/live-${width}.png`,fullPage:true});
  await page.locator('#premium').click();await page.waitForFunction(()=>document.querySelector('#premium').textContent==='Premium owned');
  assert.match(await page.evaluate(()=>window.confirmed.body),/10M|10,000,000/);
  await page.locator('[data-claim="free"][data-tier="1"]').click();await page.waitForFunction(()=>document.querySelector('[data-claim="free"][data-tier="1"]').textContent.includes('Claimed'));
  await page.evaluate(()=>window.testNow='2026-11-16T00:00:00Z');await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='CLAIM PERIOD');
  assert(await page.locator('#premium').isDisabled());assert.equal(await page.locator('[data-reroll]:enabled').count(),0);assert(await page.locator('[data-claim="free"][data-tier="50"]').isEnabled());
  await page.evaluate(()=>window.testNow='2026-11-23T00:00:00Z');await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='ARCHIVED');assert.equal(await page.locator('[data-claim]:enabled').count(),0);assert(await page.locator('#claimAll').isDisabled());
  await page.locator('#seasonSelect').selectOption(zero);await page.waitForFunction(()=>document.querySelector('#seasonName').textContent.includes('Season Zero'));
  await page.evaluate(()=>window.testNow='2026-10-16T23:59:59Z');await page.locator('#seasonSelect').selectOption(sid);await page.waitForFunction(()=>document.querySelector('#status').textContent==='UPCOMING');assert(await page.locator('#premium').isDisabled());assert.equal(await page.locator('[data-claim]:enabled').count(),0);
  await page.screenshot({path:`/private/tmp/interlude-browser/season-${width}.png`,fullPage:true});
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Seasons browser: 320/360/390/768/1440px, 100 rewards, premium, claims, archives, UTC boundaries, touch targets and overflow passed.');
}finally{await browser.close();}
