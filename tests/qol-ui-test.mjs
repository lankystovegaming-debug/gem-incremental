import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
const {chromium}=await import(process.env.QOL_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const root=new URL('../',import.meta.url);
const artifacts=new URL('../artifacts/qol/',import.meta.url);mkdirSync(artifacts,{recursive:true});
let settings={enableBuffs:true,discoveryKeep:true,discoveryKeepRarity:10000,gemFilter:{},legacyAutoSell:true,legacyAutoSellTier:'common'};
const gems=Array.from({length:1105},(_,i)=>({name:`Gem ${String(i).padStart(4,'0')}`,rarity:i+1}));
const errors=[];
const backend=`
const request=(name,args)=>fetch('/mock',{method:'POST',body:JSON.stringify({name,args})}).then(r=>r.json());
export const supabase={
 auth:{async getSession(){return {data:{session:{user:{id:'test'}}}}}},
 from(name){return {select(){return this},eq(){return this},order(){return this},async maybeSingle(){return request(name)},then(a,b){return request(name).then(a,b)}}},
 rpc(name,args){const p=request(name,args);p.range=(start,end)=>request(name,{start,end});return p;}
};`;
const stubs={
 '/src/ui/shell.js':'export function mountShell(){}',
 '/src/backend/auth.js':'export async function ensurePlayerAuth(){return {id:"test"}}',
 '/src/backend/supabase.js':backend,
 '/src/backend/account.js':`export function describeAccount(){return {name:'Tester',detail:'Test account',initials:'T',guest:false}};export async function isGoogleEnabled(){return false};export async function signInWithGoogle(){};export function onAccountChange(){};export async function loadUsername(){return 'Tester'};`
};
let loadouts=[],equipment=[{id:1,name:'Test pickaxe',category:'pickaxe'}],calls=[];
try {
 const page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.hostname!=='qol.test')return route.abort();let path=url.pathname;
  if(path==='/mock'){
   const {name,args}=route.request().postDataJSON();let data;
   if(name==='player_settings')data={settings};
   if(name==='get_qol_gem_catalog')data=args?gems.slice(args.start,args.end+1):gems;
   if(name==='update_qol_settings'){settings={...settings,...args.p_patch,gemFilter:{...settings.gemFilter,...args.p_patch.gemFilter}};if(args.p_patch.clearLegacyAutoSell)settings.legacyAutoSell=false;data=settings;}
   if(name==='player_equipment_loadouts')data=loadouts;
   if(name==='player_equipment')data=equipment;
   if(name==='equipment_loadout'){
    calls.push(args);data={success:true,unavailable:args.p_action==='equip'?['boots']:[]};
    if(args.p_action==='save')loadouts=[...loadouts.filter(p=>p.slot!==args.p_slot),{slot:args.p_slot,name:args.p_name,selections:{pickaxe:'1',boots:'99',bag:null,clover:null,lantern:null}}];
    if(args.p_action==='delete')loadouts=loadouts.filter(p=>p.slot!==args.p_slot);
   }
   return route.fulfill({json:{data,error:null}});
  }
  if(path==='/loadout-test')return route.fulfill({contentType:'text/html',body:`<link rel="stylesheet" href="/src/styles/app.css"><main style="max-width:900px;margin:auto"><div id="loadouts"></div></main><script type="module">import {mountEquipmentLoadouts} from '/src/ui/equipmentLoadouts.js';mountEquipmentLoadouts(document.getElementById('loadouts'),async()=>{});</script>`});
  if(stubs[path])return route.fulfill({contentType:'text/javascript',body:stubs[path]});
  if(path.endsWith('/'))path+='index.html';
  try {return route.fulfill({contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html':'application/octet-stream',body:readFileSync(new URL('.'+path,root))});}catch{return route.fulfill({status:404,body:''});}
 });
 await page.goto('http://qol.test/settings/');await page.getByText('1105 matching discovered gems',{exact:false}).waitFor();
 assert.equal(await page.locator('.qol-filter-row').count(),50);
 assert.equal(await page.locator('#maxLuck').inputValue(),'');
 await page.locator('#maxLuck').fill('7.5');await page.locator('#maxLuck').dispatchEvent('change');
 await page.waitForFunction(()=>!document.getElementById('maxLuck').disabled);assert.equal(settings.maxLuck,7.5);
 await page.reload();await page.getByText('1105 matching discovered gems',{exact:false}).waitFor();assert.equal(await page.locator('#maxLuck').inputValue(),'7.5');
 await page.locator('#maxLuck').fill('-1');await page.locator('#maxLuck').dispatchEvent('change');assert.equal(settings.maxLuck,7.5);
 await page.locator('#maxLuck').fill('');await page.locator('#maxLuck').dispatchEvent('change');
 await page.waitForFunction(()=>!document.getElementById('maxLuck').disabled);assert.equal(settings.maxLuck,null);

 await page.getByText('Enable Buffs',{exact:true}).click();await page.waitForFunction(()=>!document.getElementById('enableBuffs').disabled);assert.equal(settings.enableBuffs,false);
 await page.locator('#gemFilterSearch').fill('Gem 10');await page.locator('#gemFilterSelectAll').check();
 await page.locator('#gemFilterBulk').selectOption('KEEP');await page.locator('#gemFilterApply').click();await page.waitForFunction(()=>!document.getElementById('gemFilterApply').disabled);
 assert.equal(Object.values(settings.gemFilter).filter(x=>x==='KEEP').length,100,'bulk edit includes matches beyond the visible page');
 await page.locator('#gemFilterSearch').fill('');await page.locator('#gemFilterState').selectOption('KEEP');assert.match(await page.locator('#gemFilterStatus').innerText(),/^100 matching/);
 await page.locator('#gemFilterNext').click();assert.match(await page.locator('#gemFilterStatus').innerText(),/Page 2/);
 await page.locator('#gemFilterClearSelection').click();assert.match(await page.locator('#gemFilterStatus').innerText(),/0 selected/);
 await page.locator('#clearLegacyFilter').click();await page.locator('#clearLegacyFilter').waitFor({state:'hidden'});assert.equal(settings.legacyAutoSell,false);assert.equal(Object.values(settings.gemFilter).filter(v=>v==='KEEP').length,100);
 await page.locator('#qolChatLayout').selectOption('side-left');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('gem.chat.layout.v1')).layout),'side-left');
 await page.locator('#gemFilterState').selectOption('ALL');await page.locator('#gemFilterSearch').fill('Gem 000');await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:new URL('settings-desktop.png',artifacts).pathname,fullPage:true,style:"* { content-visibility:visible!important; }"});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:new URL('settings-mobile.png',artifacts).pathname,fullPage:true,style:"* { content-visibility:visible!important; }"});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'settings mobile overflow');
 await page.goto('http://qol.test/loadout-test');await page.locator('[data-name="1"]').waitFor();
 assert.equal(await page.locator('[data-action="save"]').count(),5);
 await page.locator('[data-name="1"]').fill('Luck <build>');await page.locator('[data-action="save"][data-slot="1"]').click();await page.locator('[data-action="equip"]').waitFor();assert.equal(loadouts[0].name,'Luck <build>');
 await page.locator('[data-action="equip"]').click();await page.getByText('boots left unchanged.',{exact:false}).waitFor();assert.equal(calls.filter(c=>c.p_action==='equip').length,1);
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:new URL('loadouts-mobile.png',artifacts).pathname,fullPage:true,style:"* { content-visibility:visible!important; }"});
 await page.locator('[data-name="1"]').fill('Speed');await page.locator('[data-action="save"][data-slot="1"]').click();await page.waitForFunction(()=>!document.querySelector('[data-action="save"]').disabled);assert.equal(loadouts[0].name,'Speed');
 await page.locator('[data-action="delete"]').click();await page.getByRole('button',{name:'Delete',exact:true}).last().click();await page.waitForFunction(()=>document.querySelectorAll('[data-action="equip"]').length===0);assert.equal(loadouts.length,0);
 assert.deepEqual(errors,[]);console.log('QoL browser: 1105-gem pagination, 100-row bulk edit, rules, buffs, chat, mobile layout, escaped loadout names, save/update/equip/delete and missing-item feedback passed.');
} finally {await browser.close();}
