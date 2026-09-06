import assert from "node:assert/strict";
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
  process.env.MINIGAMES_PREVIEW_URL || "http://127.0.0.1:5540/minigames/";
await page.addInitScript(() => {
  window.frameCount = 0;
  const original = window.requestAnimationFrame;
  window.requestAnimationFrame = (fn) =>
    original.call(window, (t) => {
      window.frameCount++;
      fn(t);
    });
});
await page.goto(base + "gem-catcher/");
await page.locator('[data-start="practice"]').click();
await page.locator(".mg-object").first().waitFor();
await page.evaluate(() => {
  window.churn = { added: 0, removed: 0 };
  window.observer = new MutationObserver((ms) => {
    for (const m of ms) {
      window.churn.added += m.addedNodes.length;
      window.churn.removed += m.removedNodes.length;
    }
  });
  window.observer.observe(document.querySelector("#arena"), {
    childList: true,
  });
});
await page.waitForTimeout(1200);
const arcade = await page.evaluate(() => {
  observer.disconnect();
  return churn;
});
await page.goto(base + "gem-stack/");
await page.locator('[data-start="practice"]').click();
await page.locator(".mg-stack").waitFor();
await page.evaluate(() => {
  window.oldCell = document.querySelector(".mg-stack").firstChild;
  window.stackChurn = 0;
  window.observer = new MutationObserver((ms) => {
    for (const m of ms)
      window.stackChurn += m.addedNodes.length + m.removedNodes.length;
  });
  observer.observe(document.querySelector("#play"), {
    subtree: true,
    childList: true,
  });
});
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(200);
const stack = await page.evaluate(() => {
  observer.disconnect();
  return {
    cellRetained: oldCell === document.querySelector(".mg-stack").firstChild,
    mutations: stackChurn,
  };
});
await page.goto(base + "gem-tower/");
await page.locator('[data-start="practice"]').click();
await page.locator(".mg-tower").waitFor();
const before = await page.evaluate(() => frameCount);
await page.waitForTimeout(1200);
const idleFrames = (await page.evaluate(() => frameCount)) - before;
console.log(JSON.stringify({ arcade, stack, idleFrames }));
assert.ok(
  arcade.added < 15 && arcade.removed < 15,
  "Sprites must persist between frames",
);
assert.equal(stack.cellRetained, true, "Stack must retain its existing cells");
assert.equal(idleFrames, 0, "Untimed games must not animate while idle");
await page.goto(base + "mine-sweeper/");
await page.locator('[data-start="practice"]').click();
await page.locator('[data-cell="0"]').waitFor();
await page.evaluate(
  () => (window.mineCell = document.querySelector('[data-cell="0"]')),
);
await page.locator('[data-cell="0"]').click();
await page.waitForFunction(() =>
  document.querySelector("#mine-timer")?.textContent.includes("seconds"),
);
assert.equal(
  await page.evaluate(
    () => mineCell === document.querySelector('[data-cell="0"]'),
  ),
  true,
);
assert.equal(
  await page.locator('[data-cell="0"]').getAttribute("data-open"),
  "true",
);
assert.deepEqual(errors, []);
await browser.close();
