import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.UPDATE_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const original = JSON.parse(fs.readFileSync(path.join(root, 'updates/history.json')));
let history = original;
let failHistory = false;
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Content-Type', 'text/javascript');
  if (pathname === '/src/ui/shell.js') return res.end('export function mountShell() {}');
  if (pathname === '/src/backend/auth.js') return res.end('export async function ensurePlayerAuth(){return window.fixtureUser}');
  if (pathname === '/src/backend/account.js') return res.end('export function onAccountChange(cb){window.fixtureAccountChange=cb;return ()=>{window.fixtureAccountChange=null}}');
  if (pathname === '/weekly-test/') {
    res.setHeader('Content-Type', 'text/html');
    return res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles/app.css"></head><body>
      <button id="opener">Game</button><div class="maintenance-overlay" hidden></div>
      <script>const params=new URL(location.href).searchParams;window.fixtureUser=params.has('signedout')?null:{id:params.get('user')||'player-a'};</script>
      <script type="module">import { mountWeeklyUpdate } from '/src/ui/weeklyUpdate.js';document.getElementById('opener').focus();mountWeeklyUpdate('../');window.mountWeeklyUpdate=mountWeeklyUpdate;</script></body></html>`);
  }
  if (pathname === '/updates/history.json') {
    res.setHeader('Content-Type', 'application/json');
    if (failHistory) { res.writeHead(503); return res.end('{}'); }
    return res.end(JSON.stringify(history));
  }
  const target = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' })[path.extname(target)] || 'application/octet-stream');
  res.end(fs.readFileSync(target));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true,
  ...(process.env.UPDATE_CHROME_PATH ? { executablePath: process.env.UPDATE_CHROME_PATH } : {}) });
const base = `http://127.0.0.1:${server.address().port}`;
const errors = [];
try {
  fs.mkdirSync(path.join(root, 'artifacts/update-logs'), { recursive: true });
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://**/*', (route) => route.abort());
    await page.goto(`${base}/updates/`);
    await page.locator('.update-card').first().waitFor();
    assert.equal(await page.locator('.update-card').count(), 20);
    assert.equal(await page.locator('.update-card--latest').count(), 1);
    assert.equal(await page.locator('.update-card__badge--version').count(), 0);
    await page.locator('#moreUpdates').click();
    assert.equal(await page.locator('.update-card').count(), 40);
    await page.locator('#updateSearch').fill('Convergence');
    assert.ok(await page.locator('.update-card').count() > 0);
    assert.match(await page.locator('#publishedUpdates').innerText(), /Convergence/);
    await page.locator('#updateSearch').fill('no-such-gem-abcdef');
    assert.equal(await page.locator('.update-card').count(), 0);
    assert.match(await page.locator('#updateStatus').innerText(), /No updates found/);
    await page.locator('#updateSearch').fill('');
    assert.equal(await page.locator('.update-card').count(), 20);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(root, `artifacts/update-logs/history-${width}.png`), fullPage: false });

    await page.goto(`${base}/weekly-test/`);
    await page.locator('dialog[open]').waitFor();
    assert.match(await page.locator('dialog').innerText(), /Convergence/);
    assert.equal(await page.locator('dialog a').getAttribute('href'), '../updates/');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), "Let's play");
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), 'hidden');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.keyboard.press('Tab');
    assert(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement) || document.activeElement === document.body));
    await page.screenshot({ path: path.join(root, `artifacts/update-logs/popup-${width}.png`), fullPage: false });
    // A cinematic interrupts without acknowledging, and the notes return afterward.
    await page.evaluate(() => document.documentElement.classList.add('is-cinematic-active'));
    await page.locator('dialog[open]').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => localStorage.getItem('gemIncremental.weeklyUpdate.player-a.496')), null);
    await page.evaluate(() => document.documentElement.classList.remove('is-cinematic-active'));
    await page.locator('dialog[open]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('dialog').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'opener');
    assert.equal(await page.evaluate(() => localStorage.getItem('gemIncremental.weeklyUpdate.player-a.496')), 'seen');
    await page.reload();
    await page.waitForTimeout(2800);
    assert.equal(await page.locator('dialog').count(), 0);
    await page.goto(`${base}/weekly-test/?user=player-b`);
    await page.locator('dialog[open]').waitFor();
    await page.getByRole('button', { name: "Let's play" }).click();
    await page.locator('dialog').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => localStorage.getItem('gemIncremental.weeklyUpdate.player-b.496')), 'seen');
    // A new release prompts the same account, not just new accounts.
    history = [{ ...original.find((entry) => entry.pr === 496), pr: 999, title: 'Weekly update 6', merged_at: '2026-10-15T00:00:00Z' }, ...original];
    await page.goto(`${base}/weekly-test/`);
    await page.locator('dialog[open]').waitFor();
    assert.match(await page.locator('dialog').innerText(), /Weekly update 6/);
    await page.evaluate(() => window.fixtureAccountChange('SIGNED_OUT', null));
    assert.equal(await page.locator('dialog').count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('gemIncremental.weeklyUpdate.player-a.999')), null);
    history = original;
    await page.close();
  }
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://**/*', (route) => route.abort());
  await page.goto(`${base}/weekly-test/?signedout`);
  await page.waitForTimeout(2800);
  assert.equal(await page.locator('dialog').count(), 0);
  await page.goto(`${base}/weekly-test/`);
  await page.evaluate(() => {
    const blocker = document.createElement('div'); blocker.className = 'dialog-overlay'; blocker.id = 'blocker'; blocker.textContent = 'Daily reward'; document.body.appendChild(blocker);
  });
  await page.waitForTimeout(2800);
  assert.equal(await page.locator('dialog').count(), 0);
  await page.locator('#blocker').evaluate((element) => element.remove());
  await page.locator('dialog[open]').waitFor();
  await page.getByRole('button', { name: "Let's play" }).click();
  failHistory = true;
  await page.goto(`${base}/updates/`);
  await page.getByRole('status').filter({ hasText: 'could not be loaded' }).waitFor();
  await page.close();
  assert.deepEqual(errors, []);
  console.log('Update history and weekly popup browser checks passed at phone and desktop widths.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
