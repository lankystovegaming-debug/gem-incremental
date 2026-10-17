import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {initialState,applyAction,publicSnapshot} from '../supabase/functions/_shared/christmasActions.js';
import {START,END} from '../supabase/functions/_shared/christmas2026.js';
import {recordQuestFacts} from '../supabase/functions/_shared/christmasQuests.js';
const {chromium}=await import(process.env.CHRISTMAS_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CHRISTMAS_PREVIEW_URL||'http://127.0.0.1:5517';
const browser=await chromium.launch({headless:true,...(process.env.CHRISTMAS_CHROME_EXECUTABLE?{executablePath:process.env.CHRISTMAS_CHROME_EXECUTABLE}:{})});
await mkdir(new URL('../artifacts/christmas-2026/',import.meta.url),{recursive:true});
try{
  for(const viewport of [{width:390,height:844},{width:768,height:1024},{width:1440,height:1000}]){
    const context=await browser.newContext({viewport});
    let now=START,state={...initialState(),tree:14,snowflakes:100000,ornaments:3000,lights:1000,shillings:1000000,inventory:{small:30,festive:15,large:2,golden:1,mysterious:2}};
    recordQuestFacts(state,now,{rolls:300,gems:20});
    const receipts=new Map();let loseResponse=false,commits=0;
    await context.route('**/src/ui/shell.js',r=>r.fulfill({contentType:'text/javascript',body:'export function mountShell(){}'}));
    await context.route('**/src/backend/auth.js',r=>r.fulfill({contentType:'text/javascript',body:`export async function ensurePlayerAuth(){return {id:'christmas-test-user'}}`}));
    await context.route('**/src/backend/cloudChristmas2026.js',r=>r.fulfill({contentType:'text/javascript',body:`export async function christmasRequest(command={action:'snapshot'},requestId=null){const r=await fetch('/__christmas-fixture',{method:'POST',body:JSON.stringify({command,requestId})});const d=await r.json();if(d.error){const e=new Error(d.error);e.code=d.error;throw e;}return d;}`}));
    await context.route('**/__christmas-fixture',async route=>{
      const {command,requestId}=route.request().postDataJSON();
      if(command.action==='snapshot')return route.fulfill({json:{...publicSnapshot(state,now),releaseEnabled:true}});
      if(receipts.has(requestId))return route.fulfill({json:receipts.get(requestId)});
      try{
        const changed=applyAction(state,command,now,()=>.5);state=changed.state;commits++;
        const data={rewards:changed.rewards,snapshot:publicSnapshot(state,now),releaseEnabled:true};receipts.set(requestId,data);
        if(loseResponse){loseResponse=false;return route.abort('failed');}
        return route.fulfill({json:data});
      }catch(e){return route.fulfill({json:{error:e.message},status:400});}
    });
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}/limited-events/christmas-2026/`);await page.locator('#hub').waitFor({state:'visible'});
    assert.equal(await page.locator('[role=tab]').count(),6);assert.equal(await page.locator('[aria-selected=true]').innerText(),'Tree');
    for(const tab of ['tree','presents','workshop','advent','story','collection']){
      await page.locator(`[data-tab=${tab}]`).click();await page.locator(`#panel-${tab}`).waitFor({state:'visible'});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${tab} overflow at ${viewport.width}`);
    }
    assert.equal(await page.locator('#panel-story [data-story-chapters] article').count(),5);assert(!await page.locator('#panel-story').innerText().then(s=>s.includes('VI —')));
    await page.locator('[data-tab=tree]').click();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('[aria-selected=true]').innerText(),'Presents');
    await page.locator('[data-tab=tree]').click();
    loseResponse=true;await page.getByRole('button',{name:'Decorate',exact:true}).click();await page.getByRole('button',{name:'Retry action'}).waitFor();
    await page.getByRole('button',{name:'Retry action'}).click();await page.getByRole('heading',{name:'Level 15 / 25'}).waitFor();assert.equal(commits,1,'retry must not repeat the committed upgrade');
    await page.screenshot({path:new URL(`../artifacts/christmas-2026/tree-${viewport.width}.png`,import.meta.url).pathname,fullPage:true});
    await page.locator('[data-tab=story]').click();
    const rolling=page.locator('#panel-story article').filter({has:page.getByRole('heading',{name:'Complete 300 genuine rolls',exact:true})});
    await rolling.getByRole('button',{name:'Claim reward',exact:true}).click();await rolling.getByText('Claimed',{exact:true}).waitFor();
    assert.equal(commits,2);assert.equal(state.shillings,1000150);
    now=END;await page.reload();await page.locator('#archive').waitFor({state:'visible'});
    assert.equal(await page.locator('#panel-tree [data-command]:not(:disabled)').count(),0);assert(await page.locator('#panel-collection').innerText().then(s=>s.includes('/ 28')));
    assert.equal(await page.locator('#panel-story [data-command]:not(:disabled)').count(),0);
    if(viewport.width===1440){
      for(const name of ['North Star',"Winter's Heart",'Aurora Borealis','Guiding Star','Yuletide','Eternal Christmas','Celestine Veil','Wish Upon a Star','Christmas Singularity']){
        await page.evaluate(async name=>{const {renderCutscene}=await import('/src/ui/cutsceneScenes.js');window.__scene=renderCutscene({gem:{name,rarity:300000000}},2000);},name);
        await page.locator('.cs-christmas-world').waitFor();
        await page.waitForFunction(()=>getComputedStyle(document.querySelector('.cutscene-v5')).opacity==='1');
        if(['Celestine Veil','Wish Upon a Star','Christmas Singularity'].includes(name))assert.equal(await page.locator('.cs-reveal__chance,.cs-reveal__rarity').count(),0);
        await page.screenshot({path:new URL(`../artifacts/christmas-2026/scene-${name.toLowerCase().replace(/[^a-z]+/g,'-')}.png`,import.meta.url).pathname});
        await page.evaluate(()=>{window.__scene.cleanup?.();window.__scene.overlay.remove();});
      }
    }
    assert.deepEqual(errors,[]);await context.close();
  }
  console.log('Christmas hub browser checks passed: three widths, six tabs, keyboard navigation, response-loss retry, archive and overflow.');
}finally{await browser.close();}
