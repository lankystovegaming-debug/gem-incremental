import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.MINING_PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.MINING_PREVIEW_URL || 'http://127.0.0.1:5517';
const output = process.env.MINING_PREVIEW_OUTPUT || '/private/tmp/mining-roll-card';
await mkdir(output, { recursive: true });
const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../roll/index.html', import.meta.url), 'utf8');
function section(start, end) { return main.slice(main.indexOf(start), main.indexOf(end, main.indexOf(start))); }
const renderers = [section('function impossibleWorldFirstBrand()', '// =========================================================\n// GEM REVEAL'), section('function mutationNamesHtml(', 'function addHistory('), section('function historyMutationNamesHtml(', 'function renderHistory(')].join('\n');
const fixture = `
import { mountMiningScene } from '/src/ui/miningScene.js';
import { gemIconHtml, gemNameHtml } from '/src/ui/gemStyle.js';
import * as format from '/src/ui/format.js';
import { getGemMutation } from '/src/data/mutations.js';
import { chanceLabelForRollResult } from '/src/logic/chances.js';
import gems from '/src/data/gems.js';
const {rarityTier,rarityLabel,formatCount,formatWeight,formatGemValue,formatMultiplier,escapeHtml}=format;
const gemStage=document.querySelector('#gemStage');
let animations=true;
const getSettings=()=>({rollAnimations:animations,cutsceneMinimumRarity:1e12});
const isCutsceneEligible=()=>false;
${renderers}
mountMiningScene(gemStage);
const names=['Amethyst','Ruby','Sapphire','Emerald','Diamond'];
window.previewRoll=(count=5, animated=true, special=false)=>{
  animations=animated;
  const results=names.slice(0,count).map((name,i)=>({gem:{...gems.find(g=>g.name===name)},finalWeight:120+i*31,value:240+i*190,mutationIds:[],mutations:[],equipmentPassives:{genuineRoll:1001+i}}));
  if(special) { results[0]={houseEdge:true}; results[1]={pet:{name:'Rock Cat',quantity:1}}; }
  const outcomes=new Map(results.map(r=>[r,{icon:'',text:'Stored in inventory'}]));
  const featured=results.find(r=>r.gem);
  renderRoll(featured,outcomes.get(featured),results);
  appendBatchResults(results,outcomes);
};
const button=document.querySelector('#rollButton');button.disabled=false;document.querySelector('#rollButtonLabel').textContent='Roll ×5';
button.addEventListener('click',()=>window.previewRoll());
window.fixtureReady=true;
`;
const card = index.match(/<section class="stage card"[\s\S]*?<\/section>/)[0];
const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles/app.css"><link rel="stylesheet" href="/style.css"><style>body{padding:24px 12px;margin:0;min-height:100vh;box-sizing:border-box}main{width:min(760px,100%);margin:auto}.stage{margin:0}h1.preview-title{font-size:15px;letter-spacing:.04em;margin:0 0 14px;color:var(--text-muted)}</style></head><body><main><h1 class="preview-title">GEM INCREMENTAL · MINING</h1>${card}</main><script type="module" src="/mining-fixture.js"></script></body></html>`;
const browser = await chromium.launch({headless:true, ...(process.env.MINING_CHROMIUM_PATH ? {executablePath:process.env.MINING_CHROMIUM_PATH} : {})});
async function setup(options={}) {
  const context=await browser.newContext(options);
  const page=await context.newPage();
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base) return route.abort();
    if(url.pathname==='/') return route.fulfill({contentType:'text/html',body:html});
    if(url.pathname==='/mining-fixture.js') return route.fulfill({contentType:'application/javascript',body:fixture});
    if(url.pathname==='/src/ui/settings.js') return route.fulfill({contentType:'application/javascript',body:'export const getSettings=()=>({gemRealism:"classic"});'});
    return route.continue();
  });
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.waitForFunction(()=>window.fixtureReady);
  return {context,page,errors};
}
try {
  for(const width of [320,360,390,768,1440]) {
    const {context,page,errors}=await setup({viewport:{width,height:1000}});
    assert.equal(await page.locator('.mining-scene').count(),1);
    await page.evaluate(()=>window.previewRoll());
    assert.equal(await page.locator('.batch-result').count(),5);
    assert.equal(await page.locator('.mining-find').count(),5);
    assert.equal(await page.locator('.gem-reveal__name').textContent(),'Amethyst');
    assert.match(await page.locator('.batch-results__heading').textContent(),/All 5 batch results/);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.waitForTimeout(650);
    assert.ok(await page.locator('.mining-finds').evaluate(el=>Number(getComputedStyle(el).opacity))>.9);
    await page.screenshot({path:`${output}/card-${width}.png`,fullPage:true});
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.mining-finds').evaluate(el=>getComputedStyle(el).opacity),'0');
    await page.evaluate(()=>window.previewRoll(1,false));
    assert.equal(await page.locator('.batch-result').count(),0);
    assert.equal(await page.locator('.is-mining').count(),1,'Mining feedback remains enabled when optional roll animations are off');
    assert.equal(await page.locator('.mining-pickaxe').evaluate(el=>getComputedStyle(el).animationName),'mining-swing');
    const before=await page.locator('.mining-pickaxe').evaluate(el=>getComputedStyle(el).transform);
    await page.waitForTimeout(250);
    assert.notEqual(await page.locator('.mining-pickaxe').evaluate(el=>getComputedStyle(el).transform),before,'Pickaxe actually swings with roll animations off');
    await page.waitForTimeout(400);
    assert.ok(await page.locator('.mining-finds').evaluate(el=>Number(getComputedStyle(el).opacity))>.9,'Returned gem still appears on impact');
    await page.evaluate(()=>window.previewRoll(5,true,true));
    assert.equal(await page.locator('.mining-find').count(),4,'No gem fabricated for House Edge; pet shown');
    assert.equal(await page.locator('.batch-result--house-edge').count(),1);
    assert.equal(await page.locator('.batch-result--pet').count(),1);
    // Rapid re-renders retain only the current scene and returned icons.
    await page.evaluate(()=>{window.previewRoll();window.previewRoll(1);});
    assert.equal(await page.locator('.mining-scene').count(),1);
    assert.equal(await page.locator('.mining-find').count(),1);
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.mining-pickaxe').evaluate(el=>getComputedStyle(el).animationName),'none');
    assert.deepEqual(errors,[]);
    await context.close();
  }
  {
    const {context,page,errors}=await setup({viewport:{width:390,height:1000}});
    await page.evaluate(()=>document.documentElement.dataset.theme='dark');
    for(const skin of ['glitched','celestial','overgrown','prismatic','retro-desktop']) {
      await page.evaluate(skin=>{document.querySelector('.stage').dataset.rollCard=skin;window.previewRoll();},skin);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),skin+' must fit');
      assert.equal(await page.locator('.batch-result').count(),5);
      assert.equal(await page.locator('.mining-scene').count(),1);
    }
    assert.deepEqual(errors,[]);await context.close();
  }
  if(process.env.MINING_RECORD_VIDEO==='1') {
    const {context,page,errors}=await setup({viewport:{width:900,height:1320},recordVideo:{dir:output,size:{width:900,height:1320}}});
    await page.waitForTimeout(800);
    await page.locator('#rollButton').click();await page.waitForTimeout(2700);
    await page.locator('#rollButton').click();await page.waitForTimeout(2700);
    await page.locator('#rollButton').click();await page.waitForTimeout(2400);
    assert.deepEqual(errors,[]);
    const video=page.video();await context.close();await video.saveAs(`${output}/mining-roll-card-preview.webm`);
  }
  console.log('Mining card: 320/360/390/768/1440px, five results, single roll, animation off, reduced motion, House Edge/pet and rapid re-render checks passed.');
} finally { await browser.close(); }
