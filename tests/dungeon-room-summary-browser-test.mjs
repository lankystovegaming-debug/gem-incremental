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
let completed = [];
// Preview only: stub auth/shell services so tests cannot mutate live accounts.
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/src/ui/shell.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end('export function mountShell() {}'); return;
  }
  if (pathname === '/src/backend/supabase.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(`export const supabase={functions:{async invoke(name,{body}){
      if(name==='workbench')return {data:body.action==='catalog'?{recipes:[]}:{materials:Array.from({length:130},(_,i)=>({material_name:'Bone '+i,quantity:i+1})),essence:[{essence_tier:'TE',quantity:7}],gear:[{stats:{name:'Fine <weapon>'},quality:'75%',mutation_name:'Chocolate',gem_power:104560875,combat_gem_power:3216578},{stats:{recipe:'Shark Scale Armor'},quality:'Workbench',gem_power:1144000,combat_gem_power:1144000}]}};
      if(body.action==='progress')return {data:await(await fetch('/progress-fixture')).json()};
      if(body.action==='start')return {data:{run:{id:'fixture',room_number:body.roomNumber,status:'won',player_attack:331,player_health:743,room_state:{startingHealth:743,combatGemPower:3216578,balanceVersion:'2026-10-17'}},combatant:null}};
      if(body.action==='claim')return {data:await(await fetch('/claim-fixture')).json()};
      return {data:body.action==='room'?await(await fetch('/fixture/'+body.roomNumber)).json():{current:null}};
    }}};`); return;
  }
  if (pathname === '/progress-fixture') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ progress: completed.map((room_number) => ({ room_number })) })); return;
  }
  if (pathname === '/claim-fixture') {
    completed = [1];
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, materials: [], essence: [], gear: [] })); return;
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
    completed = [];
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/dungeons/`);
    await page.locator('[data-room="1"]:not([disabled])').waitFor();
    assert(await page.locator('[data-room="2"]').isDisabled());
    assert(await page.locator('[data-region="Jungle"]').isDisabled());
    assert.match(await page.locator('[data-region="Jungle"]').innerText(), /Locked/);
    const layout = await page.locator('.room-row').evaluateAll((rows) => rows.slice(0, 2).map((row) => {
      const r = row.getBoundingClientRect(); return { left: r.left, top: r.top };
    }));
    assert.equal(layout[0].left, layout[1].left);
    assert(layout[1].top > layout[0].top, 'Exactly one room per row');
    await page.locator('[data-room="1"]').click();
    await page.locator('#roomSummary table').waitFor();
    assert.match(await page.locator('#roomSummary').innerText(), /Zombie/);
    assert.equal(await page.locator('#pageOne,#pageTwo,.catalog-pages,.global-cash').count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow');
    await page.locator('#startRoom').click();
    await page.getByText('Attack 331 · Health 743 / 743 · 3,216,578 combat GP',{exact:true}).waitFor();
    await page.locator('#claim').click();
    await page.locator('[data-room="2"]:not([disabled])').waitFor();
    assert(await page.locator('[data-room="3"]').isDisabled());
    assert.match(await page.locator('[data-room="1"]').innerText(), /Completed/);
    // Claiming room 200 opens Jungle; region membership/order stays intact.
    completed = Array.from({ length: 200 }, (_, i) => i + 1);
    await page.reload();
    await page.locator('[data-region="Jungle"]:not([disabled])').waitFor();
    await page.locator('[data-region="Jungle"]').click();
    assert(await page.locator('[data-room="201"]').isEnabled());
    assert(await page.locator('[data-room="202"]').isDisabled());
    await page.locator('[data-region="Entrance"]').click();
    for (const n of [25, 50]) {
      await page.locator(`[data-room="${n}"]`).click();
      await page.getByRole('caption').filter({ hasText: `Room ${n} at a glance` }).waitFor();
      assert.match(await page.locator('#roomSummary').innerText(), n === 25 ? /drop \/ chest/ : /drop \/ boss/);
    }
    assert.deepEqual(errors, []);
    if (process.env.DUNGEON_PREVIEW_DIRECTORY) {
      await page.locator('#roomDetail').screenshot({ path: path.join(process.env.DUNGEON_PREVIEW_DIRECTORY, `dungeon-summary-${viewport.width}.png`) });
    }
    await page.goto(`http://127.0.0.1:${server.address().port}/workbench/`);
    await page.locator('.inv-row').first().waitFor();
    assert.equal(await page.locator('.inv-row').count(), 130);
    assert(await page.getByRole('heading', { name: 'Your Dungeon Materials' }).isVisible());
    assert.match(await page.locator('#essenceBar').innerText(), /TE: 7/);
    assert.match(await page.locator('#history').innerText(), /104,560,875 raw GP · 3,216,578 combat GP/);
    assert.match(await page.locator('#history').innerText(), /1,144,000 raw GP · 1,144,000 combat GP/);
    assert.match(await page.locator('#history').innerText(), /Fine <weapon>/);
    assert.equal(await page.locator('#history weapon').count(),0,'gear names remain escaped');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Workbench must fit mobile');
    await page.close();
  }
  console.log('Dungeon browser checks passed: desktop/mobile room selection, boss/treasure summaries and overflow.');
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
