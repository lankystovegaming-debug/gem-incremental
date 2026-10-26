import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.MAILBOX_PREVIEW_URL || 'http://127.0.0.1:5587';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
for(const width of [390,1440]) {
 const context=await browser.newContext({viewport:{width,height:900}}), page=await context.newPage();
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin!==base)return route.abort();
  if(url.pathname==='/mailbox-preview') return route.fulfill({contentType:'text/html',body:`<link rel="stylesheet" href="/src/styles/app.css"><button id="open">Open mailbox</button><script type="module">import {openMailbox} from '/src/ui/mailbox.js'; document.querySelector('#open').onclick=()=>openMailbox({onClaim(){window.refreshed=true;}});</script>`});
  if(url.pathname==='/src/backend/supabase.js') return route.fulfill({contentType:'text/javascript',body:`
   const rows=Array.from({length:27},(_,i)=>({id:27-i,subject:i===0?'Welcome <img src=x onerror=alert(1)>':'Mail '+(27-i),body:'Thanks for playing!\\nEnjoy your gift.',sender:'Gem Incremental',created_at:'2026-10-26T10:00:00Z',read_at:null,claimed_at:null,rewards:i===1?[]:[{type:'money',amount:1000}]}));
   export const supabase=window.fixture={fail:false,claimFail:false,claims:0,reads:0,empty:false,hold:false,release:null,auth:{onAuthStateChange(cb){window.authEvent=cb;return {data:{subscription:{unsubscribe(){}}}};}},
   from(){let before=Infinity,n=26;return {select(){return this},order(){return this},limit(v){n=v;return this},lt(k,v){before=v;return this},then(resolve){const run=()=>resolve({data:window.fixture.empty?[]:rows.filter(r=>r.id<before).slice(0,n),error:window.fixture.fail?{}:null}); if(window.fixture.hold) window.fixture.release=run;else run();}}},
   async rpc(name,args){const mail=rows.find(r=>r.id===args.p_mail_id);if(name==='read_mail'){this.reads++;mail.read_at='2026-10-26';return {data:{...mail},error:null};}this.claims++;await new Promise(r=>setTimeout(r,150));if(this.claimFail)return {error:{}};mail.claimed_at='2026-10-26';return {data:{claimedAt:mail.claimed_at},error:null};}};`});
  return route.continue();
 });
 await page.goto(base+'/mailbox-preview');
 await page.click('#open');
 await page.waitForFunction(()=>document.querySelectorAll('.mailbox-entry').length===25);
 await page.getByRole('button',{name:'Load older mail'}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.mailbox-entry').length===27);
 await page.locator('.mailbox-entry').first().click();
 const message=page.getByRole('dialog',{name:'Message',exact:true});await message.getByRole('button',{name:'Claim reward',exact:true}).waitFor();
 assert.equal(await message.locator('img').count(),0);
 await page.evaluate(()=>fixture.claimFail=true);
 await message.getByRole('button',{name:'Claim reward',exact:true}).click();
 await message.getByText('Could not claim the reward. Please try again.').waitFor();
 await page.evaluate(()=>fixture.claimFail=false);
 await message.getByRole('button',{name:'Claim reward',exact:true}).dblclick();
 await message.getByRole('button',{name:'Claimed',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>fixture.claims),2,'one failed attempt and one successful attempt');
 assert.equal(await page.evaluate(()=>window.refreshed),true);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 if(process.env.MAILBOX_SCREENSHOT_DIR) await page.screenshot({path:process.env.MAILBOX_SCREENSHOT_DIR+'/mailbox-'+width+'.png'});
 await page.keyboard.press('Escape');assert.equal(await message.count(),0);
 assert.equal(await page.getByRole('dialog',{name:'Mailbox',exact:true}).count(),1);
 await page.locator('.mailbox-entry').nth(1).click();await message.getByText('Thanks for playing!',{exact:false}).waitFor();
 assert.equal(await message.locator('[data-claim]').count(),0);
 await page.keyboard.press('Escape');
 await page.evaluate(()=>fixture.fail=true);
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.getByText('Could not load your mail. Please try Refresh.').waitFor();
 await page.evaluate(()=>{fixture.fail=false;fixture.empty=true;});
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.getByText('Your mailbox is empty.').waitFor();
 await page.evaluate(()=>{fixture.empty=false;fixture.hold=true;});
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.waitForFunction(()=>fixture.release!==null);
 await page.evaluate(()=>{authEvent('SIGNED_OUT');fixture.release();});
 assert.equal(await page.getByRole('dialog').count(),0);
 await page.evaluate(()=>fixture.hold=false);
 await page.click('#open');await page.locator('.mailbox-entry').first().waitFor();
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#open').evaluate(el=>el===document.activeElement),true);
 console.log('PASS mailbox '+width+'px: pagination, safe text, two popups, claim/retry, no-reward messages, empty/error states, keyboard, sign-out race');
 await context.close();
}
} finally {await browser.close();}
