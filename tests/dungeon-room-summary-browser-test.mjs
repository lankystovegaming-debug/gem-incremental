import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.DUNGEON_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261008000000_dungeon_workbench_full_rebalance.sql'), 'utf8');
const line = sql.split('\n').find((line) => line.startsWith('insert into public.dungeon_catalog_rooms('));
const marker = "from jsonb_to_recordset('";
const rooms = JSON.parse(line.slice(line.indexOf(marker) + marker.length, line.lastIndexOf("'::jsonb) as x(")).replaceAll("''", "'"));
const room = (n) => {
  const r = rooms[n - 1];
  return { ...r, room_number: r.room, room_type: r.title, room_key_chance: r.key_chance, mutation_summary: r.mutation_line };
};
// Preview only: stub auth/shell services so tests cannot mutate live accounts.
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/src/ui/shell.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end('export function mountShell() {}'); return;
  }
  if (pathname === '/src/backend/supabase.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(`export const supabase={functions:{async invoke(name,{body}){return {data:body.action==='room'?await(await fetch('/fixture/'+body.roomNumber)).json():{current:null}}}}};`); return;
  }
  if (pathname.startsWith('/fixture/')) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ room: room(Number(pathname.split('/').at(-1))), boss: null })); return;
  }
  const target = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' })[path.extname(target)] || 'application/octet-stream');
  res.end(fs.readFileSync(target));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true,
  ...(process.env.DUNGEON_CHROME_PATH ? { executablePath: process.env.DUNGEON_CHROME_PATH } : {}) });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/dungeons/`);
    await page.locator('[data-room="1"]').click();
    await page.locator('#roomSummary table').waitFor();
    assert.match(await page.locator('#roomSummary').innerText(), /Zombie/);
    assert.equal(await page.locator('#pageOne,#pageTwo,.catalog-pages,.global-cash').count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow');
    for (const n of [25, 50]) {
      await page.locator(`[data-room="${n}"]`).click();
      await page.getByRole('caption').filter({ hasText: `Room ${n} at a glance` }).waitFor();
      assert.match(await page.locator('#roomSummary').innerText(), n === 25 ? /drop \/ chest/ : /drop \/ boss/);
    }
    assert.deepEqual(errors, []);
    if (process.env.DUNGEON_PREVIEW_DIRECTORY) {
      await page.locator('#roomDetail').screenshot({ path: path.join(process.env.DUNGEON_PREVIEW_DIRECTORY, `dungeon-summary-${viewport.width}.png`) });
    }
    await page.close();
  }
  console.log('Dungeon browser checks passed: desktop/mobile room selection, boss/treasure summaries and overflow.');
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
