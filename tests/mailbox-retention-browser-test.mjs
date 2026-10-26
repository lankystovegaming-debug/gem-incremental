import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.MAILBOX_PREVIEW_URL || 'http://127.0.0.1:5588';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
for(const width of [390,1440]) {
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
 await page.clock.install({time:new Date('2026-10-26T00:00:00Z')});
 await page.route('**/*',route=>{
 const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
 if(url.pathname==='/mailbox-retention-preview')return route.fulfill({contentType:'text/html',body:`<link rel="stylesheet" href="/src/styles/app.css"><button id="profile">Profile</button><button id="open">Open mailbox <span data-mailbox-badge="menu"></span></button><script type="module">import {openMailbox} from '/src/ui/mailbox.js';import {mountMailboxNotifications} from '/src/ui/mailboxNotifications.js';window.badges=mountMailboxNotifications(document.querySelector('#profile'));badges.setAccount({id:'player'},'Miner');document.querySelector('#open').onclick=()=>openMailbox({userId:'player'});</script>`});
 if(url.pathname==='/src/backend/supabase.js')return route.fulfill({contentType:'text/javascript',body:`
 const start=Date.now(),mins=n=>new Date(start+n*60000).toISOString();
 const rows=[{id:1,subject:'Unread plain',rewards:[],read_at:null,claimed_at:null,expires_at:null},{id:2,subject:'Unread reward',rewards:[{type:'money',amount:100}],read_at:null,claimed_at:null,expires_at:null},{id:3,subject:'Expiring plain',rewards:[],read_at:mins(-29),claimed_at:null,expires_at:mins(1)},{id:4,subject:'Expiring claimed',rewards:[{type:'money',amount:1}],read_at:mins(-40),claimed_at:mins(-28),expires_at:mins(2)},{id:5,subject:'Read unclaimed',rewards:[{type:'coins',amount:1}],read_at:mins(-120),claimed_at:null,expires_at:null}].map(r=>({...r,body:'Message body',sender:'System',created_at:mins(-120)}));
 const active=r=>!r.expires_at||Date.parse(r.expires_at)>Date.now();
 export const supabase=window.fixture={auth:{onAuthStateChange(cb){window.listeners ||= [];listeners.push(cb);return {data:{subscription:{unsubscribe(){}}}};}},countCalls:0,hold:false,release:null,
 from(){return {select(){return this},order(){return this},limit:async()=>({data:rows.filter(active).sort((a,b)=>b.id-a.id),error:null})}},
 async rpc(name,args){if(name==='mailbox_pending_count'){this.countCalls++;const result={data:rows.filter(r=>active(r)&&(!r.read_at||(r.rewards.length&&!r.claimed_at))).length,error:null};if(this.hold)return new Promise(resolve=>this.release=()=>resolve(result));return result;}
 const r=rows.find(r=>r.id===args.p_mail_id);if(name==='read_mail'){r.read_at ||= new Date().toISOString();if(!r.rewards.length)r.expires_at ||= new Date(Date.parse(r.read_at)+1800000).toISOString();return {data:{...r},error:null};}
 r.claimed_at ||= new Date().toISOString();r.read_at ||= r.claimed_at;r.expires_at ||= new Date(Math.max(Date.parse(r.read_at),Date.parse(r.claimed_at))+1800000).toISOString();return {data:{claimedAt:r.claimed_at,expiresAt:r.expires_at},error:null};}};`});
 return route.continue();
 });
 await page.goto(base+'/mailbox-retention-preview');
 const profile=page.locator('[data-mailbox-badge="profile"]'),menu=page.locator('[data-mailbox-badge="menu"]');
 await profile.filter({hasText:'3'}).waitFor();assert.equal(await menu.textContent(),'3');
 await page.click('#open');await page.locator('.mailbox-entry').filter({hasText:'Unread plain'}).click();
 await profile.filter({hasText:'2'}).waitFor();await page.keyboard.press('Escape');
 await page.locator('.mailbox-entry').filter({hasText:'Unread reward'}).click();
 await page.getByRole('button',{name:'Claim reward',exact:true}).waitFor();assert.equal(await profile.textContent(),'2','read/unclaimed mail keeps notification');
 await page.getByRole('button',{name:'Claim reward',exact:true}).click();await profile.filter({hasText:'1'}).waitFor();
 await page.clock.fastForward(30*60*1000+50);
 await page.waitForFunction(()=>document.querySelectorAll('.mailbox-entry').length===1);
 assert.equal(await page.getByRole('dialog',{name:'Message',exact:true}).count(),0,'expired open message closes itself');
 assert.ok((await page.locator('.mailbox-entry').textContent()).includes('Read unclaimed'));
 assert.equal(await profile.textContent(),'1','unclaimed reward remains pending beyond 30 minutes');
 await page.keyboard.press('Escape');
 // A badge response completing after sign-out must not restore old notifications.
 await page.evaluate(()=>{fixture.hold=true;badges.refresh();});await page.waitForFunction(()=>fixture.release!==null);
 await page.evaluate(()=>{listeners.forEach(fn=>fn('SIGNED_OUT'));fixture.release();});
 assert.equal(await profile.isVisible(),false);assert.equal(await menu.isVisible(),false);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('PASS retention/badge '+width+'px: read/claim notification counts, live 30-minute expiry, unclaimed protection, sign-out race');
 await context.close();
}
}finally{await browser.close();}
