import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
const { chromium } = await import(process.env.ROUTING_PLAYWRIGHT_MODULE || 'playwright');
const port = 5579;
const server = spawn(process.execPath, ['dev-server.mjs'], { env: { ...process.env, PORT: String(port) } });
await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(new Error(`Preview server exited: ${code}`))); });
const browser = await chromium.launch({ headless: true });
const base = `http://127.0.0.1:${port}`;
const id = '11111111-1111-4111-8111-111111111111';
const errors = [];
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.route('**/src/backend/auth.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export async function ensurePlayerAuth() { return null; }' }));
    await page.route('**/src/ui/shell.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export function mountShell() {}' }));
    await page.route('**/src/backend/supabase.js', route => route.fulfill({ contentType: 'text/javascript', body: `
      export const supabase = {
        auth: { getSession: async () => ({data:{session:{user:{id:'${id}'}}}}),
          onAuthStateChange: () => ({data:{subscription:{unsubscribe(){}}}}) },
        rpc: async (name, args) => {
          window.rpcCalls = [...(window.rpcCalls || []), {name,args}];
          if (name === 'get_profile_ids_for_usernames') return {data: args.p_usernames[0] === 'Test_Player' ? {Test_Player:'${id}'} : {}};
          if (name === 'get_public_profile') return {data:{id:'${id}',username:'Test_Player',total_rolls:123,showcase:[],cosmetics:{}}};
          return {data:{status:'final',global:{},asOf:'2026-10-08T00:00:00Z',period:{},personal:{username:'Test_Player'}}};
        }
      };` }));
    await page.route('**/recap/month-*/render.js', route => route.fulfill({ contentType: 'text/javascript', body: `
      export const globalRecap = () => '<section>Global fixture records</section>';
      export const personalRecap = () => '<section>Personal fixture records</section>';
      export const shareSummary = () => 'Summary'; export const summarySvg = () => '';` }));
    for (const month of [1, 2]) {
      for (const suffix of ['', '/']) {
        const response = await page.goto(`${base}/recap/month${month}${suffix}`);
        assert.equal(response.status(), 200);
        await page.locator('#recap-content section').waitFor({timeout:5000}).catch(async error => { console.error(page.url(), await page.locator('body').innerText(), errors); throw error; });
        assert.match(await page.title(), month === 1 ? /Month One/ : /Month Two/);
        const calls = await page.evaluate(() => window.rpcCalls);
        assert.equal(calls.at(-1).name, month === 1 ? 'get_month_one_recap' : 'get_recap_period');
        if (month === 2) assert.equal(calls.at(-1).args.p_period, 'month-2');
        await page.locator('#personal-tab').click();
        assert.equal(await page.locator('#recap-content').innerText(), 'Personal fixture records');
        assert.ok(page.url().endsWith('#you'));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      await page.goto(`${base}/recap/month-${month}/?source=old#you`);
      await page.waitForURL(`**/recap/month${month}/?source=old#you`);
      await page.locator('#recap-content section').waitFor();
      assert.equal(await page.locator('#recap-content').innerText(), 'Personal fixture records');
    }
    await page.goto(`${base}/recap/month3/`);
    assert.match(await page.locator('#month-experience').innerText(), /Recap unavailable/);
    for (const profilePath of ['/user/Test_Player', '/user/Test%5FPlayer/', `/user/${id}/`, `/user/?id=${id}`, '/user/', '/user/index.html']) {
      const response = await page.goto(base + profilePath);
      assert.equal(response.status(), 200);
      await page.locator('#profileName').waitFor();
      assert.match(page.url(), /\/user\/Test_Player\//);
      assert.match(await page.locator('#profileStats').innerText(), /123/);
      assert.equal(await page.locator('#customizeProfile').isVisible(), true);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.goto(`${base}/user/NoSuchPlayer/`);
    await page.getByText('That player does not exist.').waitFor();

    // GitHub Pages serves the 404 shell for otherwise valid dynamic URLs.
    for (const routePath of ['/user/Test_Player/', '/recap/month1/']) {
      const fallback = async route => route.fulfill({status:404, contentType:'text/html', body:fs.readFileSync(new URL('../404.html', import.meta.url), 'utf8')});
      await page.route(base + routePath, fallback);
      await page.goto(base + routePath);
      await page.locator(routePath.startsWith('/user') ? '#profileName' : '#recap-content section').waitFor();
      assert.equal(new URL(page.url()).pathname, routePath);
      await page.unroute(base + routePath, fallback);
    }

    // Render the actual account-menu template with signed-in/signed-out fixtures.
    const shell = fs.readFileSync(new URL('../src/ui/shell.js', import.meta.url), 'utf8');
    const start = shell.indexOf('    menu.innerHTML = `', shell.indexOf('function renderAccountMenu'));
    const end = shell.indexOf('\n    menu.querySelector', start);
    const template = shell.slice(start, end);
    for (const guest of [false, true]) {
      await page.evaluate(({ template, guest }) => {
        const menu = document.createElement('div');
        new Function('menu', 'account', 'icons', 'escapeHtml', 'base', 'currentUsername', 'googleEnabled', template)(
          menu, {guest, signedOut:guest, initials:'T', name:'Test', detail:''}, {user:'',logout:''}, s => String(s || ''), '/', 'Test_Player', false);
        document.body.replaceChildren(menu);
      }, { template, guest });
      assert.equal(await page.getByRole('menuitem', {name:'View profile', exact:true}).count(), guest ? 0 : 1);
      if (!guest) {
        assert.equal(await page.getByRole('menuitem', {name:'View profile', exact:true}).getAttribute('href'), '/user/Test_Player/');
        assert.equal(await page.getByRole('menuitem', {name:'Manage account', exact:true}).count(), 1);
        assert.equal(await page.getByRole('menuitem', {name:'Sign out', exact:true}).count(), 1);
      }
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: recap routing/month selection/legacy redirects, username and own profiles, account menu, desktop/mobile layouts.');
} finally {
  await browser.close();
  server.kill();
}
