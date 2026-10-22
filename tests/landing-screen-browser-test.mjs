import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
const { chromium } = await import(process.env.LANDING_PLAYWRIGHT_MODULE || 'playwright');
const port = 5584;
const server = spawn(process.execPath, ['dev-server.mjs'], { env: { ...process.env, PORT: String(port) } });
await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', reject); });
let browser;
const base = `http://127.0.0.1:${port}`;
const output = process.env.LANDING_SCREENSHOTS || '/private/tmp/gem-landing-screen';
mkdirSync(output, { recursive: true });
const entries = [
  { pr: 3, title: 'Newer hotfix', weekly: false, merged_at: '2026-01-03T00:00:00Z' },
  { pr: 2, title: 'Latest released weekly', weekly: true, merged_at: '2026-01-02T00:00:00Z' },
  { pr: 1, title: 'Older weekly', weekly: true, merged_at: '2026-01-01T00:00:00Z' },
  { pr: 4, title: 'Future weekly', weekly: true, merged_at: '2099-01-01T00:00:00Z' }
].map(entry => ({ ...entry, published_on: '2026-01-01', sections: [{heading:'Changes', bullets:['A weekly feature.']}] }));
const errors = [];
try {
  browser = await chromium.launch({ headless: true, ...(process.env.LANDING_BROWSER_CHANNEL ? {channel:process.env.LANDING_BROWSER_CHANNEL} : {}) });
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.route('**/src/backend/supabase.js', route => route.fulfill({contentType:'text/javascript', body: `
      export const supabase = {auth:{
        getSession: async () => {
          await new Promise(resolve => { window.finishLoading = resolve; });
          if (window.authError) throw new Error('Auth offline');
          return {data:{session: window.guest ? null : {user:{id:'player',is_anonymous: !!window.anonymous}}}};
        },
        onAuthStateChange: callback => { window.changeAuth = callback; }
      }};` }));
    await page.route('**/src/backend/playerCloud.js', route => route.fulfill({contentType:'text/javascript', body: `
      export async function ensureCloudPlayer() { window.playerLoads = (window.playerLoads || 0) + 1; return window.playerMissing ? null : {username:'Test <Miner>'}; }` }));
    await page.route('**/src/backend/cloudInventory.js', route => route.fulfill({contentType:'text/javascript', body: `
      export async function loadCloudPlayerState() { window.saveLoads = (window.saveLoads || 0) + 1; return window.saveMissing ? null : {total_rolls:42}; }` }));
    await page.route('**/src/backend/legacyMigration.js', route => route.fulfill({contentType:'text/javascript', body: `export async function runLegacyMigrationGate() {}` }));
    await page.route('**/src/ui/referralBootstrap.js', route => route.fulfill({contentType:'text/javascript', body: `
      export function captureCodeFromUrl() { window.referralCaptured = true; }
      export async function initReferral() { window.referralInitialised = true; }` }));
    let historyFails = false;
    await page.route('**/updates/history.json', route => route.fulfill(historyFails ? {status:503,body:'Offline'} : {json:entries}));
    const finish = async (state = {}) => {
      await page.waitForFunction(() => !!window.finishLoading);
      await page.evaluate(state => { Object.assign(window, state); window.finishLoading(); delete window.finishLoading; }, state);
      await page.waitForFunction(() => document.querySelector('.landing').getAttribute('aria-busy') === 'false');
    };
    await page.goto(base);
    assert.equal(await page.locator('#landingTitle').innerText(), 'Loading player data...');
    assert.equal(await page.locator('#landingActions').isVisible(), false);
    assert.equal(await page.locator('#landingRetry').isVisible(), false);
    await page.screenshot({path:`${output}/loading-${width}.png`});
    await finish();
    assert.equal(await page.locator('#landingTitle').innerText(), 'Loading complete! Welcome Test <Miner>');
    assert.equal(await page.locator('#landingTitle *').count(), 0, 'username is rendered as plain text');
    assert.equal(await page.locator('#landingPrimary').getAttribute('href'), './roll/');
    assert.equal(await page.locator('#landingRetry').isVisible(), false);
    assert.equal(await page.evaluate(() => window.saveLoads), 1);
    assert.equal(await page.evaluate(() => window.referralCaptured && window.referralInitialised), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({path:`${output}/welcome-${width}.png`});
    await page.locator('#changelogButton').click();
    await page.getByRole('heading', {name:'Latest released weekly'}).waitFor();
    assert.equal(await page.locator('.update-card').count(), 1);
    assert.doesNotMatch(await page.locator('#changelogContent').innerText(), /Newer hotfix|Older weekly|Future weekly/);
    await page.screenshot({path:`${output}/changelog-${width}.png`});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#changelogButton').evaluate(el => el === document.activeElement), true);
    await page.evaluate(() => window.changeAuth('SIGNED_OUT'));
    await finish({guest:true});
    assert.equal(await page.locator('#landingTitle').innerText(), 'Create an account to start playing!');
    assert.equal(await page.locator('#landingPrimary').innerText(), 'Create Account');
    assert.equal(await page.locator('#landingPrimary').getAttribute('href'), './account/?create=1');
    assert.equal(await page.locator('#landingLogin').isVisible(), true);
    await page.screenshot({path:`${output}/guest-${width}.png`});
    historyFails = true;
    // Reload to clear the successful history cache; an error must remain retryable.
    await page.reload();
    await finish({anonymous:true});
    assert.equal(await page.evaluate(() => window.playerLoads || 0), 0, 'anonymous visitors do not initialise a player');
    await page.locator('#changelogButton').click();
    await page.getByText('Could not load the weekly update.', {exact:false}).waitFor();
    await page.locator('#closeChangelog').click();
    historyFails = false;
    await page.locator('#changelogButton').click();
    await page.getByRole('heading', {name:'Latest released weekly'}).waitFor();
    await page.locator('#closeChangelog').click();
    for (const state of [{authError:true}, {playerMissing:true}, {saveMissing:true}]) {
      await page.reload();
      await finish(state);
      assert.equal(await page.locator('#landingTitle').innerText(), 'Could not load player data.');
      assert.equal(await page.locator('#landingActions').isVisible(), false);
      await page.locator('#landingRetry').click();
      await finish({authError:false,playerMissing:false,saveMissing:false});
      assert.equal(await page.locator('#landingPrimary').innerText(), 'Play');
    }
    await page.clock.install();
    await page.reload();
    await page.waitForFunction(() => !!window.finishLoading);
    await page.clock.fastForward(31000);
    await page.getByText('Could not load player data.', {exact:true}).waitFor();
    await page.close();
  }
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.abort());
  await page.route('**/main.js', route => route.fulfill({contentType:'text/javascript',body:''}));
  for (const path of ['/roll', '/roll/']) {
    const response = await page.goto(`${base}${path}`);
    assert.equal(response.status(), 200);
    assert.equal(new URL(page.url()).pathname, '/roll/');
    assert.equal(await page.locator('#rollButton').count(), 1);
    for (const href of await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => link.href))) {
      assert.equal((await page.request.get(href)).status(), 200, href);
    }
    assert.equal(new URL(await page.locator('a[href*="crafting"]').first().getAttribute('href'), page.url()).pathname, '/crafting/');
  }
  const shell = readFileSync(new URL('../src/ui/shell.js', import.meta.url), 'utf8');
  assert.match(shell, /id: "roll",[^\n]*href: "roll\/"/);
  await page.route('**/src/ui/shell.js', route => route.fulfill({contentType:'text/javascript',body:'export function mountShell() {}'}));
  await page.route('**/src/backend/cloudInventory.js', route => route.fulfill({contentType:'text/javascript',body:'export async function loadCloudPlayerState() { return null; }'}));
  await page.route('**/src/backend/supabase.js', route => route.fulfill({contentType:'text/javascript',body:`
    export const supabase = {auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}};`}));
  await page.goto(`${base}/account/?create=1`);
  await page.locator('#createAccountSubmitButton').waitFor();
  assert.equal(await page.locator('#createEmail').isVisible(), true);
  await page.locator('#backToLoginButton').click();
  await page.locator('#loginButton').waitFor();
  await page.goto(`${base}/account/`);
  await page.locator('#loginButton').waitFor();
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('Landing startup, guests, failures/retry, latest weekly dialog, responsive layouts and /roll routes passed.');
} finally {
  await browser?.close();
  server.kill();
}
