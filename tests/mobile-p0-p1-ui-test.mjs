import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const base = process.env.MOBILE_PREVIEW_URL || "http://127.0.0.1:5500/";
const widths = [320, 375, 390, 430, 768, 1280];

const supabaseStub = String.raw`
const user={id:'mobile-test-player',is_anonymous:true,identities:[]};
const inventory=Array.from({length:92},(_,i)=>({id:i+1,gem_name:'Quartz '+(i+1),rarity:2+(i%10),base_weight:10,value_per_gram:1,final_weight:10+i,value:10+i,mutation_ids:[],mutation_multipliers:{},locked:false,created_at:new Date(Date.now()-i*1000).toISOString()}));
const raritySteps=[2,20,200,2000,20000,200000,2000000,20000000,200000000,2000000000,20000000000];
const catalog=Array.from({length:880},(_,i)=>{
 const rarity=raritySteps[i%raritySteps.length];
 const name='Catalog Gem '+String(i+1).padStart(4,'0');
 return {id:i+1,name,title:'',rarity,base_weight:10,value_per_gram:1,description:name+' specimen',metadata:{},hide_rarity_until_discovered:false,affected_by_luck:true,enabled:true,sort_order:i,availability_mode:'always'};
});
const settingsCatalog=inventory.map(g=>({name:g.gem_name,rarity:g.rarity}));
function tableResult(table){
 if(table==='inventory_gems')return {data:inventory,error:null};
 if(table==='players')return {data:{inventory_capacity:120,money:12345,total_rolls:1000,next_roll_at:null},error:null};
 if(table==='player_gem_mutation_combinations')return {data:catalog.slice(0,8).map((g,i)=>({id:i+1,gem_name:g.name,combination_key:'none',mutation_ids:[],mutation_multipliers:{},total_found:1,highest_value:10,first_discovered_at:new Date().toISOString()})),error:null};
 if(table==='player_settings')return {data:{settings:{autoRoll:false,batchSize:1,autoKeep:true,autoKeepEffectiveRarity:1000000,rollAnimations:true,cutsceneMinimumRarity:100000,globalCash:true,cashGraph:false,gemRealism:'classic'}},error:null};
 if(table==='announcements')return {data:[{id:1,body:'Community https://discord.gg/example',tone:'info',created_at:new Date().toISOString()}],error:null};
 return {data:[],error:null,count:0};
}
function chain(result){return new Proxy(function(){},{get(_t,key){if(key==='then')return (ok,fail)=>Promise.resolve(result).then(ok,fail);if(key==='subscribe')return ()=>({});return ()=>chain(result);},apply(){return chain(result);}})}
function rpcResult(name){
 if(name==='get_public_gem_catalog')return {data:catalog,error:null};
 if(name.includes('mutation_catalog'))return {data:[{id:'polished',name:'Polished',chance:20,multiplier:2,description:'',icon:'✦',color:'#ddd',enabled:true}],error:null};
 if(name==='get_qol_gem_catalog')return {data:settingsCatalog,error:null};
 if(name==='get_global_cash_feed')return {data:{total:100000,cash:50000,online:12,events:[{id:1,name:'Tester',gem:'Quartz',amount:20}]},error:null};
 return {data:null,error:null};
}
export const SUPABASE_URL='https://example.invalid';
export const SUPABASE_PUBLISHABLE_KEY='test';
export async function loadEnabledProviders(){return {}};
export const supabase={
 auth:{async getSession(){return {data:{session:{user}},error:null}},async getUser(){return {data:{user},error:null}},onAuthStateChange(cb){queueMicrotask(()=>cb('SIGNED_IN',{user}));return {data:{subscription:{unsubscribe(){}}}}},async signOut(){return {error:null}}},
 from(table){return chain(tableResult(table))},rpc(name){return chain(rpcResult(name))},
 functions:{async invoke(name){if(name==='features')return {data:{sections:[],isAdmin:false},error:null};return {data:null,error:null}}},
 channel(){return chain({data:null,error:null})},removeChannel(){}
};`;

const authStub = `
export async function ensurePlayerAuth(){return {id:'mobile-test-player',is_anonymous:true,identities:[]}}
export function getLastAuthError(){return null}
export async function waitForAuthReady(){return ensurePlayerAuth()}
`;

async function prepare(page) {
  await page.route("**/src/backend/supabase.js", route => route.fulfill({ contentType: "text/javascript", body: supabaseStub }));
  await page.route("**/src/backend/auth.js", route => route.fulfill({ contentType: "text/javascript", body: authStub }));
  await page.route("**/src/ui/dailyLogin.js", route => route.fulfill({ contentType: "text/javascript", body: "export async function mountDailyLogin(){}" }));
  await page.route("**/src/ui/referralPromo.js", route => route.fulfill({ contentType: "text/javascript", body: "export async function mountReferralPromo(){}" }));
  await page.route("**/src/ui/tour.js", route => route.fulfill({ contentType: "text/javascript", body: "export function mountTour(){} export function startTour(){} export function startAccountPrompt(){}" }));
}

async function noPageOverflow(page, label) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
  assert.ok(size.page <= size.viewport + 1, `${label} overflowed horizontally: ${JSON.stringify(size)}`);
}

async function testResponsiveShell(browserType) {
  const browser = await browserType.launch({ headless: true });
  try {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await prepare(page);
      await page.goto(`${base}inventory/`);
      await page.locator(".topbar").waitFor();
      await noPageOverflow(page, `${browserType.name()} inventory ${width}`);
      const targets = await page.locator(".topbar button:visible, .topbar a:visible, .topbar [role=button]:visible").evaluateAll(nodes => nodes.map(node => ({ w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height })));
      if (width <= 780) assert.ok(targets.every(box => box.w >= 43 && box.h >= 43), `small shell target at ${width}: ${JSON.stringify(targets)}`);
      if (width <= 720) {
        await page.locator("#inventoryFilterToggle").click();
        assert.equal(await page.locator("#inventoryFilterSheet").isVisible(), true);
        assert.ok(await page.locator("#inventoryFilterSheet .btn").first().evaluate(node => node.getBoundingClientRect().height >= 43));
        await page.locator("#inventoryFilterClose").click();
      }
      assert.equal(errors.length, 0, `${browserType.name()} inventory errors: ${errors.join(" | ")}`);
      await page.close();
    }
  } finally { await browser.close(); }
}

async function testGemIndex(browserType) {
  const browser = await browserType.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await prepare(page);
    await page.goto(`${base}gem-index/`);
    await page.locator(".index-band").first().waitFor();
    await noPageOverflow(page, `${browserType.name()} gem index`);
    const bands = page.locator(".index-band");
    assert.ok(await bands.count() >= 4, "expected multiple rarity bands");
    for (let i = 0; i < await bands.count(); i += 1) {
      const band = bands.nth(i);
      if (await band.evaluate(node => node.open)) await band.locator("summary").evaluate(node => node.click());
      assert.equal(await band.locator(".index-card").count(), 0, "collapsed band retained cards");
      await band.locator("summary").evaluate(node => node.click());
      assert.ok(await band.locator(".index-card").count() > 0, "expanded band did not lazy render");
      await band.locator("summary").evaluate(node => node.click());
      assert.equal(await band.locator(".index-card").count(), 0, "collapsed band did not unmount cards");
    }
    await page.locator("#gemSearch").fill("Catalog Gem 0880");
    await page.waitForFunction(() => document.querySelectorAll(".index-card").length === 1);
    const matchingBand = page.locator(".index-band").first();
    assert.equal(await matchingBand.evaluate(node => node.open), true, "search did not reveal the matching rarity band");
    assert.equal(await page.locator(".index-card").count(), 1, "search rendered unrelated catalog cards");
    assert.equal(errors.length, 0, `${browserType.name()} gem index errors: ${errors.join(" | ")}`);
  } finally { await browser.close(); }
}

await testResponsiveShell(chromium);
await testGemIndex(chromium);
await testGemIndex(webkit);
console.log("PASS: mobile shell 320–1280px, Inventory sheet, no page overflow, and Chromium/WebKit lazy Gem Index bands");
