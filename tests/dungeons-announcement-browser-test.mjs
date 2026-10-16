import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.DUNGEON_NOTICE_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const original = JSON.parse(fs.readFileSync(path.join(root, 'updates/dungeons-announcement.json')));
let history = original;
let failHistory = false;
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Content-Type', 'text/javascript');
  if (pathname === '/src/ui/shell.js') return res.end('export function mountShell() {}');
  if (pathname === '/src/backend/auth.js') return res.end('export async function ensurePlayerAuth(){return window.fixtureUser}');
  if (pathname === '/src/backend/account.js') return res.end('export function onAccountChange(cb){window.fixtureAccountChange=cb;return ()=>{window.fixtureAccountChange=null}}');
  if (pathname === '/dungeon-announcement-test/') {
    res.setHeader('Content-Type', 'text/html');
    return res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles/app.css"></head><body>
      <button id="opener">Game</button><div class="maintenance-overlay" hidden></div>
      <script>const params=new URL(location.href).searchParams;window.fixtureUser=params.has('signedout')?null:{id:params.get('user')||'player-a'};</script>
      <script type="module">import { mountDungeonAnnouncement } from '/src/ui/dungeonAnnouncement.js';document.getElementById('opener').focus();mountDungeonAnnouncement('../');window.mountDungeonAnnouncement=mountDungeonAnnouncement;</script></body></html>`);
  }
  if (pathname === '/updates/dungeons-announcement.json') {
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
  ...(process.env.DUNGEON_NOTICE_CHROME_PATH ? { executablePath: process.env.DUNGEON_NOTICE_CHROME_PATH } : {}) });
const base = `http://127.0.0.1:${server.address().port}`;
const errors = [];
try {
  fs.mkdirSync(path.join(root, 'artifacts/dungeon-announcement'), { recursive: true });
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://**/*', (route) => route.abort());
    // Unmerged announcement: even an authenticated player sees no popup.
    history = original;
    await page.goto(`${base}/dungeon-announcement-test/`);
    await page.waitForTimeout(2800);
    assert.equal(await page.locator('dialog').count(), 0);
    history = { ...original, published: true, release_pr: 999, merged_at: '2026-10-15T00:00:00Z' };
    await page.goto(`${base}/dungeon-announcement-test/`);
    await page.locator('dialog[open]').waitFor();
    assert.match(await page.locator('dialog').innerText(), /Dungeons are here/);
    assert.equal(await page.locator('dialog a').getAttribute('href'), '../dungeons/');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Close');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), 'hidden');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.keyboard.press('Tab');
    assert(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement) || document.activeElement === document.body));
    await page.screenshot({ path: path.join(root, `artifacts/dungeon-announcement/popup-${width}.png`), fullPage: false });
    // A cinematic interrupts without acknowledging, and the notes return afterward.
    await page.evaluate(() => document.documentElement.classList.add('is-cinematic-active'));
    await page.locator('dialog[open]').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => localStorage.getItem('gemIncremental.dungeonsAnnouncement.player-a.999')), null);
    await page.evaluate(() => document.documentElement.classList.remove('is-cinematic-active'));
    await page.locator('dialog[open]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('dialog').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'opener');
    assert.equal(await page.evaluate(() => localStorage.getItem('gemIncremental.dungeonsAnnouncement.player-a.999')), 'seen');
    await page.reload();
    await page.waitForTimeout(2800);
    assert.equal(await page.locator('dialog').count(), 0);
    await page.goto(`${base}/dungeon-announcement-test/?user=player-b`);
    await page.locator('dialog[open]').waitFor();
    await page.getByRole('button', { name: 'Close' }).click();
    await page.locator('dialog').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => localStorage.getItem('gemIncremental.dungeonsAnnouncement.player-b.999')), 'seen');
    // Logging out while the notice is open dismisses it without acknowledgment.
    await page.goto(`${base}/dungeon-announcement-test/?user=player-c`);
    await page.locator('dialog[open]').waitFor();
    await page.evaluate(() => window.fixtureAccountChange('SIGNED_OUT', null));
    assert.equal(await page.locator('dialog').count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('gemIncremental.dungeonsAnnouncement.player-c.999')), null);
    await page.close();
  }
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://**/*', (route) => route.abort());
  await page.goto(`${base}/dungeon-announcement-test/?signedout`);
  await page.waitForTimeout(2800);
  assert.equal(await page.locator('dialog').count(), 0);
  await page.goto(`${base}/dungeon-announcement-test/`);
  await page.evaluate(() => {
    const blocker = document.createElement('div'); blocker.className = 'dialog-overlay'; blocker.id = 'blocker'; blocker.textContent = 'Daily reward'; document.body.appendChild(blocker);
  });
  await page.waitForTimeout(2800);
  assert.equal(await page.locator('dialog').count(), 0);
  await page.locator('#blocker').evaluate((element) => element.remove());
  await page.locator('dialog[open]').waitFor();
  await page.getByRole('button', { name: 'Close' }).click();
  failHistory = true;
  await page.goto(`${base}/dungeon-announcement-test/?user=failure-fixture`);
  await page.waitForTimeout(2800);
  assert.equal(await page.locator('dialog').count(), 0);
  await page.close();
  assert.deepEqual(errors, []);
  console.log('Dungeon announcement browser checks passed at phone and desktop widths.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
