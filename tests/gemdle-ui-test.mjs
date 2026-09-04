// Set GEMDLE_PLAYWRIGHT_MODULE if Playwright is installed outside this checkout.
import assert from 'node:assert/strict';
import { generateResult } from '../supabase/functions/gemdle/rules.ts';
const { chromium } = await import(process.env.GEMDLE_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true, ...(process.env.GEMDLE_BROWSER_CHANNEL ? {channel:process.env.GEMDLE_BROWSER_CHANNEL} : {})});
const page = await browser.newPage({viewport:{width:1280,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const specimen=generateResult([{name:'Mythril',rarity:6500,base_weight:200}],[],null,new Date(),()=>.9);
const row={gemdle_date:'2026-09-04',rolled_at:'2026-09-04T12:00:00Z',specimen};
await page.route('**/src/ui/shell.js',r=>r.fulfill({contentType:'text/javascript',body:'export function mountShell(){}'}));
await page.route('**/src/backend/supabase.js',r=>r.fulfill({contentType:'text/javascript',body:`
let rolled = sessionStorage.getItem('gemdle-test-rolled') === 'yes';
export const supabase={auth:{onAuthStateChange(fn){setTimeout(()=>fn('INITIAL_SESSION',{user:{id:'test'}}),0);window.testSignOut=()=>fn('SIGNED_OUT',null);}},functions:{async invoke(_, {body}){
window.testCalls=(window.testCalls||[]).concat(body);
if(body.action==='roll'){rolled=true;sessionStorage.setItem('gemdle-test-rolled','yes');}
const row=${JSON.stringify(row)};
return {data:body.action==='history'?{history:rolled?[row]:[],next_cursor:null}:{gemdle_date:row.gemdle_date,server_now:new Date().toISOString(),resets_at:new Date(Date.now()+3600000).toISOString(),result:rolled?row:null,created:body.action==='roll',board:{entries:rolled?[{rank:1,username:'<img src=x onerror=alert(1)>',specimen:row.specimen,is_you:true}]:[],own_rank:rolled?1:null,participants:rolled?1:0}}};
}}};` }));
await page.goto(process.env.GEMDLE_PREVIEW_URL || 'http://127.0.0.1:5527/gemdle/');
await page.getByRole('button',{name:"Roll today's Gemdle",exact:true}).waitFor();
await page.locator('#roll').click();
await page.locator('#share').waitFor({state:'visible'});
assert.equal(await page.locator('#result .specimen-name').textContent(),'Mythril');
assert.equal(await page.locator('#leaderboard img').count(),0);
assert.match(await page.locator('#own-rank').textContent(),/#1/);
await page.screenshot({path:'/tmp/gemdle-desktop.png',fullPage:true});
await page.locator('[data-history="0"]').click();
assert.equal(await page.locator('#past').evaluate(el=>el.open),true);
await page.locator('#close-past').click();
await page.reload();await page.locator('#share').waitFor({state:'visible'});
assert.equal(await page.locator('#roll').isVisible(),false);
assert.ok(!(await page.evaluate(()=>window.testCalls)).some(c=>c.action==='roll'));
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:'/tmp/gemdle-mobile.png',fullPage:true});
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
assert.deepEqual(errors,[]);
await browser.close();console.log('PASS: reveal, reload persistence, rank, history dialog, escaped usernames, mobile layout');
