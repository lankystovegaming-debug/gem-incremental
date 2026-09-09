import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
const {chromium}=await import(process.env.EQUIPMENT_PLAYWRIGHT_MODULE || 'playwright');
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
const page=await browser.newPage({viewport:{width:1280,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const stubs={
 '/src/backend/auth.js':'export async function ensurePlayerAuth(){return {id:"test"}}',
 '/src/ui/shell.js':'export function mountShell(){return {setWallet(){},setPlayer(){},refresh(){}}}',
 '/src/backend/cloudCrafting.js':'export async function loadCloudCraftingState(){return {progress:{},activeAutoCraftRecipeId:null}};export async function loadCloudConsumables(){return []};export async function manuallyDepositCloudRequirement(){};export async function craftCloudRecipe(){};export async function craftCloudConsumableRecipe(){};export async function setCloudAutoCraft(){};',
 '/src/backend/cloudEquipment.js':'export async function loadCloudEquipment(){return []};export async function loadEquipmentOverhaulProgress(){return {genuineRolls:500000}};',
 '/src/backend/cloudInventory.js':'export async function loadCloudPlayerState(){return {money:1000000000,total_rolls:500000}};'
};
await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname!=='equipment.test')return route.abort();let path=url.pathname;if(stubs[path])return route.fulfill({contentType:'text/javascript',body:stubs[path]});if(path.endsWith('/'))path+='index.html';try{await route.fulfill({contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html':'application/octet-stream',body:readFileSync(root+path)})}catch{await route.fulfill({status:404,body:''})}});
await page.goto('http://equipment.test/crafting/');await page.locator('#recipeList').getByText('Celestial Pickaxe',{exact:true}).waitFor();
await page.locator('[data-category="clover"]').click();assert.equal(await page.locator('#recipeList').getByText('Celestial Clover',{exact:true}).count(),1);
await page.locator('[data-category="lantern"]').click();assert.equal(await page.locator('#recipeList').getByText('Singularity Lantern',{exact:true}).count(),1);
await page.locator('[data-category="toys"]').click();for(const name of ['Plastic Shopping Bag','Toy Shovel','Silly Fun Happy Pickaxe','All Rounder Toy','Jackpot Slot','Money Pickaxe'])assert.equal(await page.locator('#recipeList').getByText(name,{exact:true}).count(),1,name);
assert.ok((await page.locator('#recipeList').innerText()).includes('historical, not consumed'));
await page.screenshot({path:tmpdir()+'/equipment-toys-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:tmpdir()+'/equipment-toys-mobile.png',fullPage:true});
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile horizontal overflow');await page.locator('[data-category="pickaxe"]').click();
for(const name of ['Fortune Pickaxe','All-In Pickaxe']) assert.equal(await page.locator('#recipeList').getByText(name,{exact:true}).count(),1);
assert.deepEqual(errors,[]);console.log('Crafting browser smoke passed: Clover, Lantern, six Toys, Fortune and All-In, mobile width, no page errors.');
}finally{await browser.close()}
