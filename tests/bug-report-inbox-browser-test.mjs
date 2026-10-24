import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BUGS_PREVIEW_URL || 'http://127.0.0.1:5586';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
function fixture(isOwner) {
  return `
  export const supabase = window.fixture = {
    owner: ${isOwner}, reads: 0, fail: false, hold: false, release: null,
    listener: null, auth: {onAuthStateChange(callback){window.fixture.listener=callback;}},
    rpc: async name => ({data:name==='am_i_admin'?window.fixture.owner:1,error:null}),
    from(table) {
      let before=null,category='',limit=26;
      const query={ select(){return this;},eq(key,value){if(key==='category')category=value;return this;},
        order(){return this;},limit(value){limit=value;return this;},lt(key,value){before=value;return this;},
        maybeSingle:async()=>({data:{money:0},error:null}),
        then(resolve,reject){window.fixture.reads++;
          const run=()=>{const rows=Array.from({length:27},(_,i)=>({id:27-i,category:i%2?'account':'bug',
            body:'<img src=x onerror="window.injected=true">\\nReport '+(27-i),contact:'private@example.test',
            page:'javascript:alert(1)',status:'open',reporter:'reporter-id',created_at:'2026-10-22T10:00:00Z'}))
            .filter(r=>(before===null||r.id<before)&&(!category||r.category===category)).slice(0,limit);
            resolve({data:rows,error:window.fixture.fail?{message:'permission denied'}:null});};
          if(window.fixture.hold)window.fixture.release=run;else run();
        }};return query;
    }
  };`;
}
try {
 for (const owner of [false,true]) {
  for (const width of owner ? [390,1440] : [390]) {
    const context=await browser.newContext({viewport:{width,height:900}});
    const page=await context.newPage();
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==base)return route.abort();
      const js=body=>route.fulfill({contentType:'text/javascript',body});
      if(url.pathname==='/src/backend/supabase.js')return js(fixture(owner));
      if(url.pathname==='/src/backend/auth.js')return js('export async function ensurePlayerAuth(){return {id:"fixture"};}');
      if(url.pathname==='/src/ui/shell.js')return js('export function mountShell(){return {setWallet(){}};}');
      if(url.pathname==='/src/ui/toast.js')return js('export const notify={error(){},success(){}};');
      return route.continue();
    });
    await page.goto(base+'/bugs/',{waitUntil:'networkidle'});
    assert.equal(await page.locator('a[href="sms:96818819"]').textContent(),'Text 96818819');
    const inbox=page.locator('#reportInbox');
    if(!owner){assert.equal(await inbox.isVisible(),false);assert.equal(await page.evaluate(()=>fixture.reads),0);await context.close();continue;}
    await page.waitForFunction(()=>document.querySelectorAll('.report-entry').length===25);
    assert.equal(await page.locator('.report-entry img, .report-entry a').count(),0);
    assert.equal(await page.evaluate(()=>window.injected),undefined);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.getByRole('button',{name:'Load older reports'}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.report-entry').length===27);
    assert.equal(await page.locator('#reportMore').isVisible(),false);
    await page.selectOption('#reportCategory','account');
    await page.waitForFunction(()=>document.querySelectorAll('.report-entry').length===13);
    assert.ok((await page.locator('.report-entry h3').allTextContents()).every(x=>x.includes('Account')));
    await page.evaluate(()=>fixture.fail=true);
    await page.getByRole('button',{name:'Refresh reports'}).click();
    await page.waitForFunction(()=>document.querySelector('#reportInboxStatus').textContent.includes('Could not load'));
    await page.evaluate(()=>fixture.fail=false);
    await page.getByRole('button',{name:'Refresh reports'}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.report-entry').length===13);
    if (process.env.BUGS_SCREENSHOT_DIR) {
      await inbox.evaluate(el=>el.scrollIntoView({behavior:'instant',block:'start'}));
      await page.screenshot({path:`${process.env.BUGS_SCREENSHOT_DIR}/bug-inbox-${width}.png`});
    }
    // A request completing after sign-out must not put private reports back.
    await page.evaluate(()=>fixture.hold=true);
    await page.getByRole('button',{name:'Refresh reports'}).click();
    await page.waitForFunction(()=>fixture.release!==null);
    await page.evaluate(()=>{fixture.listener('SIGNED_OUT');fixture.release();});
    assert.equal(await inbox.isVisible(),false);
    assert.equal(await page.locator('.report-entry').count(),0);
    // Existing submission still works after viewing reports.
    await page.locator('#bugBody').fill('A report from the original form');
    await page.getByRole('button',{name:'Send report',exact:true}).click();
    await page.locator('#bugSuccess:not(.hidden)').waitFor();
    console.log('PASS owner '+width+'px: pagination, filters, XSS safety, errors/retry, sign-out clearing, submit');
    await context.close();
  }
 }
 console.log('PASS non-owner: inbox hidden; no report query');
} finally { await browser.close(); }
