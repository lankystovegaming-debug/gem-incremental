import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
const {chromium}=await import(process.env.ECONOMY_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const root=new URL('../',import.meta.url);
const artifacts=new URL('../artifacts/economy/',import.meta.url);mkdirSync(artifacts,{recursive:true});
const panel=readFileSync(new URL('admin/index.html',root),'utf8').match(/    <section class="card admin-economy"[\s\S]*?<\/section>/)[0];
const fixture={period:'24H',trackingSince:'2026-09-09T10:00:00Z',generatedAt:'2026-09-09T11:00:00Z',cashCreated:1234000,cashDestroyed:800000,netCreation:434000,walletToBank:400000,bankToWallet:250000,totalMoneySupply:981000000,walletCash:681000000,bankDeposits:300000000,transferNet:-2500,balanceChange:431500,balanceEvents:45,unattributedEntries:0,unattributedNet:0,breakdown:[
 {direction:'source',category:'gem_sales',subcategory:'sell_inventory_gem',amount:1200000,entries:35,credited:1200000,debited:0},
 {direction:'source',category:'bank_interest',subcategory:'bank_touch',amount:34000,entries:5,credited:34000,debited:0},
 {direction:'sink',category:'equipment_crafting',subcategory:'craft_equipment_recipe',amount:-650000,entries:2,credited:0,debited:650000},
 {direction:'sink',category:'market_fees',subcategory:'listing',amount:-150000,entries:3,credited:0,debited:150000}
]};
let mode='normal';const calls=[];const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1400,height:1100}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.hostname!=='economy.test')return route.abort();
  if(url.pathname==='/mock'){
   const body=route.request().postDataJSON();calls.push(body);const period=body.args.p_period;
   if(mode==='race' && period==='1H')await new Promise(r=>setTimeout(r,150));
   if(mode==='missing')return route.fulfill({json:{error:{code:'PGRST202'}}});
   if(mode==='error')return route.fulfill({json:{error:{message:'<img src=x onerror="alert(1)"> network error'}}});
   const data={...fixture,period};
   if(mode==='empty'){Object.assign(data,{breakdown:[],balanceEvents:0,cashCreated:0,cashDestroyed:0,netCreation:0,walletToBank:0,bankToWallet:0,transferNet:0,balanceChange:0});}
   return route.fulfill({json:{data}});
  }
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles/app.css"><link rel="stylesheet" href="/admin/admin.css"></head><body><main style="max-width:1200px;margin:24px auto;padding:16px"><h1>Admin · Economy</h1>${panel}</main><script type="module">import {mountEconomy} from '/admin/economy.js';window.controller=mountEconomy({panel:document.getElementById('economyPanel'),content:document.getElementById('economyContent'),summary:document.getElementById('economySummary'),filters:document.getElementById('economyFilters'),refresh:document.getElementById('economyRefresh'),rpc:(name,args)=>fetch('/mock',{method:'POST',body:JSON.stringify({name,args})}).then(r=>r.json())});window.controller.load();</script></body></html>`});
  try{return route.fulfill({contentType:url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'application/octet-stream',body:readFileSync(new URL('.'+url.pathname,root))});}catch{return route.fulfill({status:404,body:''});}
 });
 await page.goto('http://economy.test');await page.locator('.economy-stat').first().waitFor();
 assert.equal(await page.locator('.economy-stat').count(),5);
 assert.match(await page.locator('#economyContent').innerText(),/Detailed tracking since/);
 assert.match(await page.locator('#economyContent').innerText(),/Total Money Supply/);
 await page.getByText('Gem sales',{exact:true}).click();assert.ok(await page.getByText('sell inventory gem',{exact:true}).isVisible());
 await page.screenshot({path:new URL('desktop.png',artifacts).pathname,fullPage:true});
 for(const period of ['1H','6H','24H','7D','All']){
  await page.locator(`[data-economy-period="${period}"]`).click();
  await page.waitForFunction(p=>document.getElementById('economySummary').textContent.startsWith(p+' · Updated'),period);
  assert.equal(calls.at(-1).args.p_period,period);
  assert.equal(await page.locator(`[data-economy-period="${period}"]`).getAttribute('aria-pressed'),'true');
 }
 mode='race';await page.locator('[data-economy-period="1H"]').click();await page.locator('[data-economy-period="7D"]').click();
 await page.waitForTimeout(250);assert.match(await page.locator('#economySummary').innerText(),/^7D/);
 mode='empty';await page.locator('#economyRefresh').click();await page.getByText('No cash movements recorded in this period.').waitFor();
 await page.screenshot({path:new URL('empty.png',artifacts).pathname,fullPage:true});
 mode='missing';await page.locator('#economyRefresh').click();await page.getByText('Detailed tracking is not deployed yet.').waitFor();
 mode='error';await page.locator('#economyRefresh').click();await page.getByText('Could not load economy breakdown.').waitFor();assert.equal(await page.locator('#economyContent img').count(),0);
 mode='normal';await page.locator('#economyRefresh').click();await page.locator('.economy-stat').first().waitFor();
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 assert.ok(await page.evaluate(()=>[...document.querySelectorAll('.shareholders-table-wrap')].every(el=>el.scrollWidth<=el.clientWidth)));
 await page.screenshot({path:new URL('mobile.png',artifacts).pathname,fullPage:true});
 assert.deepEqual(errors,[]);console.log('Economy UI tests passed: filters, stale requests, empty, missing deployment, error, retry, XSS, mobile.');
}finally{await browser.close();}
