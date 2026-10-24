import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
const {chromium}=await import(process.env.ROLL_PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.ROLL_PREVIEW_URL || 'http://127.0.0.1:5500';
const output=process.env.ROLL_PREVIEW_OUTPUT || '/private/tmp/gem-phase-2-restored';
await mkdir(output,{recursive:true});
const main=await readFile(new URL('../main.js',import.meta.url),'utf8');
const settings=`const listeners=[];let state={autoRoll:false,autoKeep:true,autoKeepEffectiveRarity:1000000,batchSize:1,rollPool:'normal',gemRealism:'classic',rollAnimations:true};export const getSettings=()=>state;export const hydrateSettingsFromCloud=async()=>state;export const isSignedOutError=()=>false;export const shouldAutoKeep=()=>false;export const onSettingsChange=fn=>listeners.push(fn);export async function updateSettings(patch){Object.assign(state,patch);listeners.forEach(fn=>fn(state));return state;}`;
const stubs={
 '/src/backend/auth.js':`export const ensurePlayerAuth=async()=>({id:'fixture'});export const getLastAuthError=()=>null;export const isSignInRequired=()=>false;export const SIGN_IN_REQUIRED_MESSAGE='Sign in';`,
 '/src/backend/playerCloud.js':`export const ensureCloudPlayer=async()=>({id:'fixture'});`,
 '/src/backend/legacyMigration.js':`export const runLegacyMigrationGate=async()=>{};`,
 '/src/backend/supabase.js':`const chain=new Proxy({}, {get:(_,key)=>key==='then'?(resolve=>resolve({data:[],count:0,error:null})):(()=>chain)});export const supabase={from:()=>chain,rpc:async()=>({data:[]})};`,
 '/src/backend/cloudInventory.js':`export const loadCloudPlayerState=async()=>({money:999999999999999,total_rolls:999999999999,inventory_capacity:100,next_roll_at:null});export const sellCloudGem=async()=>({});`,
 '/src/backend/cloudConsumables.js':`export const loadActiveBoosts=async()=>[{family:'luck',effect_value:1,expires_at:new Date(Date.now()+60000).toISOString()}];`,
 '/src/backend/cloudCrafting.js':`export const loadCloudCraftingState=async()=>window.craftingFixture??{progress:{}};export const loadCloudConsumables=async()=>[];`,
 '/src/backend/cloudEquipment.js':`export const loadCloudEquipment=async()=>['celestial-pickaxe','fortune-pickaxe','all-in-pickaxe','bedrock-pickaxe'].map(equipment_id=>({equipment_id}));export const loadEquipmentOverhaulProgress=async()=>({});`,
 '/src/backend/invoke.js':`import gems from '/src/data/gems.js';export async function invokeFunction(name,body){window.rollCalls=(window.rollCalls??0)+1;if(window.rollError)return {error:window.rollError};const results=Array.from({length:body.batchSize},(_,i)=>({gem:{...gems.find(g=>g.name==='Amethyst'),name:window.longNames?'ExtraordinarilyLongGemName'.repeat(5):'Amethyst'},inventory:{count:i+1,capacity:100},finalWeight:120,value:240,effectiveRarity:1000000,mutationIds:[],mutations:window.longNames?[{id:'golden',name:'ExtraordinarilyLongMutation'.repeat(4)}]:[]}));return {data:{results,cooldown:{nextRollAt:new Date(Date.now()+2500*body.batchSize).toISOString(),durationMs:2500*body.batchSize}}};}`,
 '/src/ui/settings.js':settings,
 '/src/ui/shell.js':`export const mountShell=()=>({setWallet(){},setPlayer(){}});`,
 '/src/ui/referralBootstrap.js':`export const initReferral=()=>{};`,
 '/src/ui/equippedCosmetics.js':`export const mountEquippedRollCard=()=>{};`,
 '/src/ui/cutsceneController.js':`export const isCutsceneEligible=()=>false;`,
 '/src/ui/globalCutscenes.js':`export const globalCutsceneQueue={get isBusy(){return window.cinematicBusy??false},enqueueBatch(){},whenIdle:async()=>{}};`,
 '/src/backend/rareRolls.js':`export const loadRareRolls=async()=>window.rareFixture??[];export const subscribeToRareRolls=fn=>window.refreshRareFixture=fn;export const unsubscribeFromRareRolls=()=>{};`
};
const browser=await chromium.launch({headless:true,...(process.env.ROLL_CHROMIUM_PATH?{executablePath:process.env.ROLL_CHROMIUM_PATH}:{})});
try {
 for(const width of [360,390,430,768,1366,2560]) {
  const context=await browser.newContext({viewport:{width,height:width===1366?768:width<1000?900:1440}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
   if(stubs[url.pathname])return route.fulfill({contentType:'text/javascript',body:stubs[url.pathname]});
   if(url.pathname==='/main.js')return route.fulfill({contentType:'text/javascript',body:main+`\nwindow.rollFixture={ready:showReady,refreshCraftingProgressPreview,refreshPlayerState,view,renderSessionInsights};`});
   return route.continue();
  });
  await page.goto(`${base}/roll/`);await page.waitForFunction(()=>window.rollFixture?.view.ready);
  const overflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`page overflow ${width}`);
  await overflow();
  const stage=await page.locator('#section-roll-stage').boundingBox();
  const feed=await page.locator('#rareRollsCard').boundingBox();
  if(width>=1180)assert.ok(feed.x>=stage.x+stage.width,'Phase 2 discovery sidebar');
  else assert.ok(feed.y<stage.y,'Phase 2 discoveries precede gameplay');
  assert.equal(await page.locator('.roll-workspace, #rollSession').count(),0);
  assert.equal(await page.locator('#section-session-history').isVisible(),true);
  assert.equal(await page.locator('#sessionInsightsPanel').isVisible(),true);
  assert.equal(await page.locator('#biomeStatus').count(),1,'Retain newer biome status');
  assert.match(await page.locator('#craftingProgressList').textContent(),/No recipes/);
  assert.match(await page.locator('#historyList').textContent(),/Your rolls/);
  assert.match(await page.locator('#sessionBreakdown').textContent(),/No rolls/);
  await page.locator('#rollButton').click();
  await page.locator('.gem-reveal__name').waitFor();
  assert.match(await page.locator('#rollButtonLabel').textContent(),/Ready in/);
  assert.equal(await page.locator('#rollButton').isDisabled(),true);
  assert.equal(await page.locator('.history__row').count(),1);
  await page.evaluate(()=>window.rollFixture.ready());
  await page.locator('#batchSize').selectOption('5');
  await page.evaluate(()=>window.longNames=true);
  await page.locator('#rollButton').click();
  await page.waitForFunction(()=>document.querySelectorAll('.batch-result').length===5);
  assert.equal(await page.locator('.history__row').count(),6);
  await overflow();
  await page.screenshot({path:`${output}/roll-populated-${width}.png`,fullPage:true});
  await page.locator('#clearHistory').click();assert.equal(await page.locator('.history__row').count(),0);
  await page.locator('#clearSessionInsights').click();assert.match(await page.locator('#sessionBreakdown').textContent(),/No rolls/);
  await page.evaluate(()=>{window.rollFixture.view.inventoryCount=100;window.rollFixture.ready();});
  assert.match(await page.locator('#rollButtonLabel').textContent(),/Inventory full/);
  assert.equal(await page.locator('#rollButton').isDisabled(),true);
  await page.evaluate(async()=>{
    const recipes=(await import('/src/data/recipes.js')).default;
    window.craftingFixture={progress:{[recipes[0].id]:{fixture:1}},activeAutoCraftRecipeId:recipes[0].id};
    await window.rollFixture.refreshCraftingProgressPreview();
    window.rollFixture.view.inventoryCount=0;window.rollFixture.ready();
  });
  assert.ok(await page.locator('.crafting-preview__recipe').count()>0);
  await page.locator('#batchSize').selectOption('1');
  const calls=await page.evaluate(()=>window.rollCalls);
  await page.locator('label').filter({has:page.locator('#autoRollToggle')}).click();
  await page.waitForFunction(before=>window.rollCalls>before,calls);
  await page.locator('label').filter({has:page.locator('#autoRollToggle')}).click();
  assert.equal(await page.locator('#autoRollToggle').isChecked(),false);
  // Queue lock remains authoritative while a cinematic is active.
  await page.evaluate(()=>{window.cinematicBusy=true;window.rollFixture.ready();});
  const lockedCalls=await page.evaluate(()=>window.rollCalls);
  await page.locator('#rollButton').click();
  assert.equal(await page.evaluate(()=>window.rollCalls),lockedCalls);
  // Exercise the actual live feed renderer with representative announcements.
  await page.evaluate(async()=>{
    window.rareFixture=Array.from({length:10},(_,i)=>({kind:i<5?'base':'mutation',gemName:'Amethyst',username:'Long_player_name_'.repeat(5),rarity:1e9,effectiveRarity:1e12,mutations:[],createdAt:new Date().toISOString()}));
    window.refreshRareFixture();
  });
  await page.waitForFunction(()=>document.querySelectorAll('.rare-roll').length===10);
  if(width<1180) {
    assert.equal(await page.locator('.rare-roll:visible').count(),2);
    await page.locator('#rareRollsToggle').click();assert.equal(await page.locator('.rare-roll:visible').count(),10);
    await page.locator('#rareRollsToggle').click();assert.equal(await page.locator('.rare-roll:visible').count(),2);
  } else {
    assert.equal(await page.locator('.rare-roll:visible').count(),10);
  }
  await overflow();
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.mining-pickaxe').evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.deepEqual(errors,[]);
  await context.close();
 }
 console.log('PASS: Restored Phase 2 real Roll controller with isolated backend fixtures, 360/390/430/768/1366/2560px; batch 1/5, cooldown, full inventory, auto-roll, session, crafting, rare feeds, long labels, cinematic lock and reduced motion');
} finally {await browser.close();}
