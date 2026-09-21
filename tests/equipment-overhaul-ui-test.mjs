import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
const {chromium}=await import(process.env.EQUIPMENT_PLAYWRIGHT_MODULE || 'playwright');
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
const page=await browser.newPage({viewport:{width:1280,height:1000}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser page error:',e.message)});page.on('requestfailed',request=>console.error('Browser request failed:',request.url(),request.failure()?.errorText));
const stubs={
 '/src/backend/auth.js':'export async function ensurePlayerAuth(){return {id:"test"}}',
 '/src/backend/supabase.js':'const result=Promise.resolve({data:[],error:null});const chain={select(){return chain},eq(){return chain},in(){return chain},then(resolve,reject){return result.then(resolve,reject)}};export const supabase={from(){return chain}};',
 '/src/ui/shell.js':'export function mountShell(){return {setWallet(){},setPlayer(){},refresh(){}}}',
 '/src/backend/cloudCrafting.js':"import recipes from '/src/data/recipes.js'; const progress={};const materials={selectedCount:1,common:1,legendary:0,mythic:0,exotic:0,exalted:0,cosmicPlus:0,multiplier10:0,multiplier15:0,multiplier25:0,value100m:0,weight5m:0,totalWeight:100,totalValue:20};const workspace=()=>({preview:{materials,history:{},highestValue:[]},requirements:{},autoCraft:false});export async function loadCloudCraftingState(){return {progress:{},activeAutoCraftRecipeId:null}};export async function loadCloudConsumables(){return []};export async function manuallyDepositCloudRequirement(id,index){window.__deposits??=[];window.__deposits.push({id,index});const r=recipes.find(r=>r.id===id).requirements[index];progress[id]??={};progress[id][r.id??r.gem]=r.amount;return {data:{progress:{...progress[id]}}};};export async function craftCloudRecipe(){};export async function craftCloudConsumableRecipe(){};export async function setCloudAutoCraft(id){window.__autoTarget=id;return {data:{},error:null}};export async function loadImpossiblePickaxeStatus(){return workspace()};export async function loadImpossibleDepositCandidates(){return {data:[{id:77,gem_name:'Quartz',rarity:1,base_weight:10,final_weight:25,value:20}],count:1,error:null}};export async function depositImpossiblePickaxeGems(ids){window.__impossibleDeposits=ids;materials.selectedCount+=ids.length;return {...workspace(),depositedCount:ids.length}};export async function prepareImpossiblePickaxeCraft(){return {...workspace(),ready:false,message:'Requirements are not yet complete.'}};export async function craftImpossiblePickaxe(){};",
 '/src/backend/cloudEquipment.js':'export async function loadCloudEquipment(){return []};export async function loadEquipmentOverhaulProgress(){return {genuineRolls:500000}};',
 '/src/backend/cloudInventory.js':'export async function loadCloudPlayerState(){return {money:1000000000,total_rolls:500000}};'
};
await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname!=='equipment.test')return route.abort();let path=url.pathname;if(stubs[path])return route.fulfill({contentType:'text/javascript',body:stubs[path]});if(path.endsWith('/'))path+='index.html';try{await route.fulfill({contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html':'application/octet-stream',body:readFileSync(root+path)})}catch{await route.fulfill({status:404,body:''})}});
await page.goto('http://equipment.test/crafting/');await page.locator('#recipeList').getByText('Celestial Pickaxe',{exact:true}).waitFor();
await page.locator('[data-category="clover"]').click();assert.equal(await page.locator('#recipeList').getByText('Celestial Clover',{exact:true}).count(),1);
await page.locator('[data-category="lantern"]').click();assert.equal(await page.locator('#recipeList').getByText('Singularity Lantern',{exact:true}).count(),1);
await page.locator('[data-category="toys"]').click();for(const name of ['Plastic Shopping Bag','Toy Shovel','Silly Fun Happy Pickaxe','All Rounder Toy','Jackpot Slot','Money Pickaxe','Reality Shifter'])assert.equal(await page.locator('#recipeList').getByText(name,{exact:true}).count(),1,name);
assert.ok((await page.locator('#recipeList').innerText()).includes('historical, not consumed'));
const impossibleCard=page.locator('[data-recipe="impossible-pickaxe"]');
await impossibleCard.getByRole('button',{name:'Review sacrifice plan'}).click();
const impossibleDialog=page.locator('#impossibleReviewDialog');
await impossibleDialog.getByText('Manual deposit',{exact:true}).waitFor();
assert.equal(await impossibleDialog.getByRole('button',{name:'Start Auto Craft'}).count(),1);
assert.equal(await impossibleDialog.getByText('Requirement: 500,000,000.00g',{exact:true}).count(),1);
assert.equal(await impossibleDialog.getByText('Requirement: $1,000,000,000',{exact:true}).count(),1);
await impossibleDialog.getByText('Manual deposit',{exact:true}).click();
await impossibleDialog.getByText('Quartz',{exact:true}).waitFor();
await impossibleDialog.locator('[data-impossible-gem-id]').check();
await impossibleDialog.locator('#impossibleDepositAcknowledge').check();
await impossibleDialog.getByRole('button',{name:'Deposit selected gems'}).click();
await page.waitForFunction(()=>window.__impossibleDeposits?.[0]==='77');
assert.equal(await page.locator('#impossibleReviewDialog').getByText('2 gems',{exact:true}).count(),1);
await page.locator('#impossibleReviewDialog').screenshot({path:tmpdir()+'/impossible-sacrifice-workspace.png'});
await page.setViewportSize({width:390,height:844});
assert.ok(await impossibleDialog.evaluate(dialog=>dialog.scrollWidth<=dialog.clientWidth),'Impossible workspace mobile horizontal overflow');
await impossibleDialog.screenshot({path:tmpdir()+'/impossible-sacrifice-workspace-mobile.png'});
await page.setViewportSize({width:1280,height:1000});
await page.locator('#impossibleReviewDialog').getByRole('button',{name:'Close'}).click();
await page.screenshot({path:tmpdir()+'/equipment-toys-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:tmpdir()+'/equipment-toys-mobile.png',fullPage:true});
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile horizontal overflow');await page.locator('[data-category="pickaxe"]').click();
for(const name of ['Fortune Pickaxe','All-In Pickaxe','Bedrock Pickaxe']) assert.equal(await page.locator('#recipeList').getByText(name,{exact:true}).count(),1);
assert.ok((await page.locator('#recipeList').innerText()).includes('Uncommon'));
for(const label of ['Raw rarity','Rarity bursts','Mutations','Huge specimens','Roll volume','Special Gems','Consumables','Foundation bursts','Generalist']) assert.equal(await page.getByText('Best for: '+label,{exact:true}).count(),1,label);
const bedrockCard=page.locator('article').filter({has:page.getByText('Bedrock Pickaxe',{exact:true})});
assert.equal(await bedrockCard.getByRole('button',{name:'Deposit all materials',exact:true}).count(),1);
await bedrockCard.getByRole('button',{name:'Deposit all materials',exact:true}).click();
await page.waitForFunction(()=>window.__deposits?.length===4);
assert.deepEqual(await page.evaluate(()=>window.__deposits.map(d=>[d.id,d.index])),[0,1,2,3].map(i=>['bedrock-pickaxe',i]));
await bedrockCard.screenshot({path:tmpdir()+'/bedrock-card-mobile.png'});
await page.screenshot({path:tmpdir()+'/bedrock-mobile.png',fullPage:true});

assert.equal(await page.locator('#recipeList').getByText('Reality Shifter',{exact:true}).count(),0);
assert.deepEqual(errors,[]);console.log('Crafting browser passed: Reality Shifter Toy, Bedrock Pickaxe, bulk deposit in four requests, desktop/mobile layout and no page errors.');
}finally{await browser.close()}
