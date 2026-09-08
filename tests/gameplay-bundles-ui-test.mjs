import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.BUNDLES_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BUNDLES_BROWSER_CHANNEL||'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const catalog=JSON.parse(readFileSync(new URL('./fixtures/gameplay-bundles-catalog.json',import.meta.url),'utf8'));
const ids=['jewellers','spectrum','deep-earth','heavyweight','mutated','cosmic','master'];
const names=['Jeweller’s','Spectrum','Deep Earth','Heavyweight','Mutated','Cosmic','Master'];
const icons=['💎','🌈','⛏️','🏋️','✦','🌌','👑'];
const state={bundles:ids.map((id,i)=>({id,name:names[i]+' Collection',icon:icons[i],unlocked:i<6,requirements:i<6?catalog.filter(r=>r.bundle_id===id).map(r=>({...r,contributed:0,auto_contribute:false})):[]})),submissions:[]};
let submitted=[],enableCalls=0;
await page.route('**/src/ui/shell.js',r=>r.fulfill({contentType:'text/javascript',body:'export function mountShell(){}'}));
await page.route('**/src/backend/auth.js',r=>r.fulfill({contentType:'text/javascript',body:'export async function ensurePlayerAuth(){}'}));
await page.route('**/src/backend/cloudBundles.js',r=>r.fulfill({contentType:'text/javascript',body:`
const call=(action,body={})=>fetch('/test-bundles',{method:'POST',body:JSON.stringify({action,...body})}).then(r=>r.json());
export const loadBundles=()=>call('state');
export const loadBundleCandidates=(requirementId,offset)=>call('candidates',{requirementId,offset});
export const setBundleAuto=(requirementId,enabled)=>call('set_auto',{requirementId,enabled});
export const contributeBundle=(requirementId,specimenIds,confirmCrown)=>call('contribute',{requirementId,specimenIds,confirmCrown});
`}));
await page.route('**/test-bundles',async route=>{
 const body=route.request().postDataJSON();let data;
 if(body.action==='state')data=state;
 if(body.action==='set_auto'){enableCalls++;state.bundles.flatMap(b=>b.requirements).find(r=>r.id===body.requirementId).auto_contribute=body.enabled;data={ok:true};}
 if(body.action==='candidates')data={specimens:Array.from({length:body.requirementId==='master-crown'?1:2},(_,i)=>({id:String(101+i),gem_name:body.requirementId==='master-crown'?'Lanky Gem':'Amethyst',rarity:body.requirementId==='master-crown'?10000000:50,final_weight_multiplier:5,mutation_ids:['gilded','smooth'],value:123,serial_number:67}))};
 if(body.action==='contribute'){
  submitted.push(body);const r=state.bundles.flatMap(b=>b.requirements).find(r=>r.id===body.requirementId);r.contributed+=body.specimenIds.length;
  if(body.confirmCrown)state.submissions=[{requirement_id:'master-crown',submitted_at:new Date().toISOString(),specimen_snapshot:{gem_name:'Lanky Gem',rarity:10000000,final_weight_multiplier:5,mutation_ids:['gilded','smooth']}}];
  data={ok:true};
 }
 await route.fulfill({json:{data,error:null}});
});
const url=process.env.BUNDLES_PREVIEW_URL||'http://127.0.0.1:5573/collection-hall/';
await page.goto(url);await page.locator('#bundleCount').getByText('0 / 7').waitFor();
assert.equal(await page.locator('.bundle-card').count(),7);
assert.match(await page.locator('.locked').innerText(),/first six/);
await page.locator('[data-auto="jewellers-01"]').check();await page.waitForFunction(()=>!document.querySelector('#bundles').hasAttribute('aria-busy'));
assert.equal(enableCalls,1);
await page.screenshot({path:process.env.BUNDLES_DESKTOP_SCREENSHOT||'/tmp/gameplay-bundles-desktop.png',fullPage:true});
await page.locator('[data-contribute="jewellers-01"]').click();await page.locator('.bundle-candidate').first().waitFor();
await page.locator('#selectCandidates').click();assert.equal(await page.locator('#selectionCount').innerText(),'2 selected');
await page.locator('#reviewContribution').click();assert.match(await page.locator('#contributionReview').innerText(),/Final weight multiplier/);
await page.locator('#submitContribution').click();await page.waitForFunction(()=>!document.querySelector('dialog').open);
assert.equal(submitted.length,1);assert.deepEqual(submitted[0].specimenIds,['101','102']);
// Master becomes available after a refreshed server state; no auto toggle for Crown.
state.bundles.forEach((b,i)=>{b.unlocked=true;if(i<6){b.completed_at=new Date().toISOString();b.requirements.forEach(r=>r.contributed=r.required_amount);}else b.requirements=catalog.filter(r=>r.bundle_id==='master').map(r=>({...r,contributed:0,auto_contribute:false}));});
await page.locator('#refreshBundles').click();await page.getByText('6 / 7',{exact:true}).waitFor();
await page.locator('[data-bundle="master"] summary').click();assert.equal(await page.locator('[data-auto="master-crown"]').count(),0);
await page.locator('[data-contribute="master-crown"]').click();await page.locator('.bundle-candidate input').check();await page.locator('#reviewContribution').click();
assert.match(await page.locator('#contributionReview').innerText(),/Crown Jewel/);
assert.match(await page.locator('#contributionReview').innerText(),/10,000,000/);
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:process.env.BUNDLES_CROWN_SCREENSHOT||'/tmp/gameplay-bundles-crown.png',fullPage:false});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
assert.equal(await page.locator('dialog').evaluate(d=>d.scrollWidth>d.clientWidth),false);
await page.locator('#submitContribution').click();await page.waitForFunction(()=>!document.querySelector('dialog').open);
assert.equal(submitted[1].confirmCrown,true);await page.locator('#crownMemory').waitFor({state:'visible'});
await page.screenshot({path:process.env.BUNDLES_MOBILE_SCREENSHOT||'/tmp/gameplay-bundles-mobile.png',fullPage:true});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
assert.deepEqual(errors,[]);
await browser.close();console.log('Collections browser tests passed: toggles, manual batch, Master refresh, Crown confirmation and mobile overflow.');
