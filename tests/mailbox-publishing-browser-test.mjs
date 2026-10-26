import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.MAILBOX_PREVIEW_URL || 'http://127.0.0.1:5587';
const source=readFileSync(new URL('../admin/admin.js',import.meta.url),'utf8');
assert.match(source,/if \(whoami.access === "owner"\) mountMailPublisher\(\)/);
assert.match(source,/content: \["#mailPublisherPanel"/);
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 for(const width of [390,1440]) {
 const context=await browser.newContext({viewport:{width,height:950}}), page=await context.newPage();
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
  const js=body=>route.fulfill({contentType:'text/javascript',body});
  if(url.pathname==='/admin/admin.js')return js(`import {mountMailPublisher} from './mailPublisher.js';mountMailPublisher();`);
  if(url.pathname==='/src/backend/supabase.js')return js(`const publications=[];export const supabase=window.fixture={calls:[],fail:false,historyFail:false,
   from(){return {select(){return this},order(){return this},limit:async()=>({data:publications,error:window.fixture.historyFail?{}:null})}},
   async rpc(name,args){this.calls.push({name,args:{...args}});await new Promise(r=>setTimeout(r,80));const exists=publications.find(p=>p.id===args.p_request_id);if(!exists)publications.unshift({id:args.p_request_id,source:'owner',subject:args.p_subject,sender:args.p_sender,audience:args.p_audience,recipient:args.p_recipient,recipient_count:args.p_audience==='all'?42:1,created_at:new Date().toISOString()});if(this.fail)return {error:{message:'network timeout'}};return {data:{recipientCount:args.p_audience==='all'?42:1,alreadyPublished:!!exists}};}};`);
  return route.continue();
 });
 await page.goto(base+'/admin/',{waitUntil:'networkidle'});
 const form=page.locator('#mailPublisherForm');await form.waitFor();
 await page.locator('#mailRecipient').fill('Miner');await page.locator('#mailSubject').fill('Gift <img src=x onerror=alert(1)>');
 await page.locator('#mailBody').fill('Thanks for playing!\nHere is your reward.');await page.locator('#mailCash').fill('1000');
 await page.locator('#mailCoins').fill('5');await page.locator('#mailPotion').selectOption({index:1});await page.locator('#mailPotionQuantity').fill('2');
 await page.getByRole('button',{name:'Add another potion'}).click();
 await page.locator('[data-potion-id]').nth(1).selectOption({index:2});await page.locator('[data-potion-quantity]').nth(1).fill('3');
 await page.getByRole('button',{name:'Add another potion'}).click();
 await page.locator('[data-potion-id]').nth(2).selectOption({index:1});await page.locator('[data-potion-quantity]').nth(2).fill('4');
 await page.locator('#mailExpiry').selectOption('custom');await page.locator('#mailExpiryCustom').fill('2000-01-01T12:00');
 await page.getByRole('button',{name:'Review mail',exact:true}).click();
 await page.locator('#mailPublishStatus').filter({hasText:'Choose an expiry time in the future.'}).waitFor();
 await page.locator('#mailExpiryCustom').fill('2030-01-01T12:00');
 await page.getByRole('button',{name:'Review mail',exact:true}).click();
 const preview=page.locator('#mailPreview');await preview.waitFor();assert.equal(await preview.locator('img').count(),0);
 if(process.env.MAILBOX_SCREENSHOT_DIR) await page.locator('#mailPublisherPanel').screenshot({path:process.env.MAILBOX_SCREENSHOT_DIR+'/mail-publisher-'+width+'.png'});
 assert.equal(await page.evaluate(()=>fixture.calls.length),0,'review must not send');
 await page.evaluate(()=>fixture.fail=true);
 await preview.getByRole('button',{name:'Publish mail',exact:true}).click();
 await page.locator('#mailPublishStatus').filter({hasText:'Publishing could not be confirmed'}).waitFor();
 await page.evaluate(()=>fixture.fail=false);
 await preview.getByRole('button',{name:'Publish mail',exact:true}).dblclick();
 await page.locator('#mailPublishStatus').filter({hasText:'Already published to 1 player.'}).waitFor();
 const calls=await page.evaluate(()=>fixture.calls);assert.equal(calls.length,2);assert.equal(calls[0].args.p_request_id,calls[1].args.p_request_id);
 assert.equal(calls[0].args.p_rewards.length,4);assert.equal(calls[0].args.p_rewards[2].amount,6);assert.equal(calls[0].args.p_rewards[3].amount,3);assert.ok(Date.parse(calls[0].args.p_expires_at)>Date.now());assert.equal(calls[0].args.p_expires_at,calls[1].args.p_expires_at);assert.equal(calls[0].args.p_recipient,'Miner');
 await page.locator('#mailPublicationHistory strong').waitFor();assert.equal(await page.locator('#mailPublicationHistory img').count(),0);
 await page.locator('#mailAudience').selectOption('all');assert.equal(await page.locator('#mailRecipient').isVisible(),false);
 await page.locator('#mailSubject').fill('Server update');await page.locator('#mailBody').fill('A system update is ready.');
 await page.getByRole('button',{name:'Review mail',exact:true}).click();
 await preview.getByRole('button',{name:'Publish to all current players'}).click();
 await page.locator('#mailPublishStatus').filter({hasText:'Published to 42 players.'}).waitFor();
 const all=await page.evaluate(()=>fixture.calls.at(-1).args);assert.equal(all.p_audience,'all');assert.equal(all.p_recipient,null);assert.deepEqual(all.p_rewards,[]);assert.ok(Math.abs(Date.parse(all.p_expires_at)-Date.now()-604800000)<5000,'reset restores seven-day expiry');assert.equal(await page.locator('[data-potion-row]').count(),1);
 await page.evaluate(()=>fixture.historyFail=true);await page.getByRole('button',{name:'Refresh history',exact:true}).click();
 await page.locator('#mailPublicationHistory').filter({hasText:'Could not load'}).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('PASS mail publisher '+width+'px: preview, plain text, attachments, single/broadcast, multiple/combined potions, custom/default expiry, duplicate-safe retry, history/error states');await context.close();
 }
}finally{await browser.close();}
