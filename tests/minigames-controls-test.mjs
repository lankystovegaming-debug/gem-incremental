import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const artifacts = new URL("../artifacts/", import.meta.url);
mkdirSync(artifacts, { recursive: true });
import {
  create,
  step,
  visible,
} from "../supabase/functions/minigames/engine.js";
const { chromium } = await import(
  process.env.MINIGAMES_PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  headless: true,
  channel: process.env.MINIGAMES_BROWSER_CHANNEL || "chrome",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
let requests = [], delayMs = 0, loseNextAction = false;
let runs = [],
  errors = [];
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.error(e.message);
});
page.on("console", (m) => {
  if (m.type() === "error") console.error(m.text());
});
await page.route("**/src/ui/shell.js", (r) =>
  r.fulfill({
    contentType: "text/javascript",
    body: "export function mountShell(){}",
  }),
);
await page.route("**/src/backend/supabase.js", (r) =>
  r.fulfill({
    contentType: "text/javascript",
    body: `export const supabase={auth:{onAuthStateChange(){}},functions:{async invoke(_, {body}){return {data:await (await fetch('/test-api',{method:'POST',body:JSON.stringify(body)})).json()}}}};`,
  }),
);
await page.route("**/test-api", async (route) => {
  let b = route.request().postDataJSON(),
    run = null;
  requests.push(b);
  if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  const pack = (r) => ({ ...r, state: visible(r.state) });
  if (b.action === "start") {
    run = {
      id: "test-" + runs.length,
      version: 0,
      game: b.game,
      mode: b.mode,
      state: create(
        b.game,
        b.mode,
        b.options,
        17,
        Date.now(),
        [
          {
            name: "Quartz",
            rarity: 2,
            base_weight: 100,
            value_per_gram: 0.0575,
          },
        ],
        [{ name: "Polished", multiplier: 2 }],
      ),
    };
    runs.push(run);
  }
  if (b.action === "act") {
    run = runs.find((r) => r.id === b.run_id);
    run.state = step(run.state, b.input, Date.now());
    run.version++;
    if (loseNextAction) {
      loseNextAction = false;
      await route.fulfill({ json: { error: "Connection interrupted. Retry to recover your saved run." } });
      return;
    }
  }
  await route.fulfill({
    json: {
      wallet: {
        mt: 0,
        tickets: 5,
        regen_at: new Date().toISOString(),
        lifetime_mt: 0,
      },
      server_now: Date.now(),
      run: run ? pack(run) : null,
      runs: runs.filter((r) => !r.state.done).map(pack),
      board: { entries: [], own_rank: null },
      stats: { games: 0, largest: 0 },
    },
  });
});
const base =
  process.env.MINIGAMES_PREVIEW_URL || "http://127.0.0.1:5539/minigames/";

const settled = () => page.waitForFunction(() => document.querySelector("#play")?.getAttribute("aria-busy") === "false");
const actionCount = () => requests.filter((request) => request.action === "act").length;
try {
  // Slow initial loading cannot race a newly started run.
  delayMs = 250;
  await page.goto(base + "crystal-bags/");
  await page.locator("[data-start=practice]").waitFor();
  assert.equal(await page.locator("[data-start=practice]").isDisabled(), true);
  await settled();
  delayMs = 150;
  await page.locator("[data-start=practice]").click();
  await page.locator(".mg-bag").first().waitFor();
  await settled();
  assert.equal(await page.locator(".mg-game-panel > .mg-howto").getAttribute("open"), null);
  let before = actionCount();
  await page.locator(".mg-bag").first().evaluate((button) => { button.click(); button.click(); });
  assert.equal(await page.locator(".mg-bag").first().isDisabled(), true);
  await settled();
  assert.equal(actionCount() - before, 1, "Double taps must send one action");
  assert.match(await page.locator(".mg-stat").textContent(), /Round 2/);

  // The server commits, but the response is lost. Retry reloads rather than replays.
  loseNextAction = true;
  before = actionCount();
  await page.locator(".mg-bag").first().click();
  await page.locator("#retry-connection").waitFor();
  assert.equal(await page.locator(".mg-bag").first().isDisabled(), true);
  await page.locator("#retry-connection").click();
  await settled();
  assert.equal(actionCount() - before, 1);
  assert.match(await page.locator(".mg-stat").textContent(), /Round 3/);
  assert.equal(await page.locator("#status").textContent(), "");
  delayMs = 0;

  // Expert boards remain legible, scroll within the panel, and support keyboard navigation.
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(base + "mine-sweeper/");
  await settled();
  await page.locator("#difficulty").selectOption("easy");
  assert.equal(await page.locator("[data-start=rewarded]").isDisabled(), true);
  await page.locator("#difficulty").selectOption("expert");
  assert.equal(await page.locator("[data-start=rewarded]").isDisabled(), false);
  await page.locator("[data-start=practice]").click();
  await page.locator("[data-cell='0']").waitFor();
  await settled();
  assert.equal(await page.locator('.mg-cell[tabindex="0"]').count(), 1);
  await page.locator('[data-cell="0"]').focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator(':focus').getAttribute("data-cell"), "1");
  await page.keyboard.press("Enter");
  await settled();
  assert.equal(await page.locator('[data-cell="1"]').getAttribute("data-open"), "true");
  assert.match(await page.locator('[data-cell="1"]').getAttribute("aria-label"), /empty/);
  const boardSize = await page.locator('.mg-board-scroll').evaluate((node) => ({ scroll: node.scrollWidth, width: node.clientWidth, cell: node.firstElementChild.firstElementChild.offsetWidth }));
  assert.ok(boardSize.scroll > boardSize.width);
  assert.ok(boardSize.cell >= 24, JSON.stringify(boardSize));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({path: fileURLToPath(new URL("controls-mine-320.png", artifacts)), fullPage: true});

  // Pointer cancellation cannot turn the next release into an unintended move.
  await page.goto(base + "gem-2048/");
  await page.locator('[data-start="practice"]').click();
  await page.locator('.mg-2048').waitFor();
  await settled();
  assert.equal(await page.locator('.mg-2048').evaluate((node) => getComputedStyle(node).touchAction), "none");
  const area = await page.locator('.mg-2048').boundingBox();
  before = actionCount();
  await page.mouse.move(area.x + 40, area.y + 40);
  await page.mouse.down();
  await page.mouse.move(area.x + 120, area.y + 40);
  await page.locator('.mg-2048').dispatchEvent('pointercancel');
  await page.mouse.up();
  assert.equal(actionCount(), before);
  await page.getByRole('button', {name: 'Move left', exact: true}).focus();
  await page.keyboard.press('Space');
  await settled();
  assert.equal(actionCount() - before, 1, "A focused control must activate once");

  // A real touch gesture moves tiles without scrolling the document.
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', {enabled:true});
  const touchBoard = await page.locator('.mg-2048').boundingBox();
  const scrollBefore = await page.evaluate(() => scrollY);
  before = actionCount();
  await touch.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x:touchBoard.x+70,y:touchBoard.y+70}]});
  await touch.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[{x:touchBoard.x+70,y:touchBoard.y+160}]});
  await touch.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
  await settled();
  assert.equal(actionCount() - before, 1);
  assert.equal(await page.evaluate(() => scrollY), scrollBefore);
  await touch.detach();

  // Starting on a phone brings the board and its controls into view together.
  await page.setViewportSize({width:390, height:844});
  await page.goto(base + 'gem-stack/');
  await page.locator('[data-start="practice"]').click();
  await page.locator('.mg-stack-controls').waitFor();
  await settled();
  const stackControls = await page.locator('.mg-stack-controls').boundingBox();
  assert.ok(stackControls.y >= 0 && stackControls.y + stackControls.height <= 844, JSON.stringify({stackControls, layout: await page.evaluate(() => ({scroll:scrollY, play:document.querySelector("#play").getBoundingClientRect().toJSON(),board:document.querySelector(".mg-stack").getBoundingClientRect().toJSON(),rows:getComputedStyle(document.querySelector(".mg-stack")).gridTemplateRows}))}));

  // A held/early Space never freezes the marker or submits an invalid strike.
  await page.goto(base + 'perfect-strike/');
  await page.locator('[data-start="practice"]').click();
  await page.locator('[data-action="strike"]').waitFor();
  before = actionCount();
  await page.keyboard.press('Space');
  assert.equal(actionCount(), before);
  await page.waitForFunction(() => !document.querySelector('[data-action="strike"]').disabled);
  await page.locator('[data-action="strike"]').focus();
  await page.keyboard.press('Space');
  await settled();
  assert.equal(actionCount() - before, 1);

  // Responsive, themed screens retain usable controls and contain all content.
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({width, height: 900});
    for (const game of ['gem-stack', 'gem-reels', 'gem-2048', 'perfect-strike']) {
      await page.goto(base + game + '/');
      await settled();
      if (await page.locator('[data-start="practice"]').isVisible()) await page.locator('[data-start="practice"]').click();
      await page.locator('.mg-stat').waitFor();
      await settled();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${game} overflows at ${width}`);
      const heights = await page.locator('#play .mg-controls .btn').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
      assert.ok(heights.every((height) => height >= 44), `${game} needs touch-size buttons`);
    }
  }
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await page.screenshot({path: fileURLToPath(new URL('controls-strike-dark.png', artifacts)), fullPage: true});
  await page.setViewportSize({width:390, height:844});
  await page.goto(base + 'gem-stack/');
  await settled();
  await page.screenshot({path: fileURLToPath(new URL('controls-stack-mobile.png', artifacts)), fullPage: true});
  assert.deepEqual(errors, []);
  console.log('PASS: loading, duplicate actions, lost-response recovery, keyboard, cancelled gestures, 320–1280px layouts and touch targets');
} finally {
  await browser.close();
}
