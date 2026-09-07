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
  process.env.MINIGAMES_PREVIEW_URL || "http://127.0.0.1:5539/minigames/";
await page.goto(base);
await page.locator(".mg-card").first().waitFor();
assert.equal(await page.locator(".mg-card").count(), 13);
await page.getByRole("button", { name: "Arcade", exact: true }).click();
assert.equal(await page.locator(".mg-card:visible").count(), 4);
assert.equal(await page.getByRole("button", { name: "Arcade", exact: true }).getAttribute("aria-pressed"), "true");
await page.getByRole("searchbox").fill("strike");
assert.equal(await page.locator(".mg-card:visible").count(), 1);
await page.getByRole("searchbox").fill("no matching game");
assert.equal(await page.locator(".mg-card:visible").count(), 0);
assert.equal(await page.locator("#game-empty").isVisible(), true);
await page.getByRole("searchbox").fill("");
await page.getByRole("button", { name: "All", exact: true }).click();
assert.equal(await page.locator(".mg-card:visible").count(), 13);
await page.screenshot({
  path: fileURLToPath(new URL("minigames-hub-desktop.png", artifacts)),
  fullPage: true,
});
for (let game of [
  "gem-reels",
  "gem-catcher",
  "ore-slicer",
  "gem-2048",
  "mine-sweeper",
  "gem-stack",
  "prospector",
  "explosive-mining",
  "gem-tower",
  "crystal-bags",
  "price-is-right",
  "perfect-strike",
]) {
  await page.goto(base + game + "/");
  await page.locator('[data-start="practice"]').click();
  await page.locator(".mg-stat").waitFor();
  if (game === "prospector") await page.locator('[data-cell="0"]').click();
  if (game === "crystal-bags") {
    await page.locator('[data-action="bag"]').first().click();
    await page.waitForFunction(() =>
      document.querySelector(".mg-stat")?.textContent.includes("Round 2"),
    );
  }
  if (game === "gem-2048") await page.keyboard.press("ArrowLeft");
  if (game === "price-is-right") {
    await page.locator("#guess").fill("1");
    await page.locator("#guess-form button").click();
    await page.getByText(/Actual final value/).waitFor();
  }
}
// Gem Reels: holds toggle, refresh resumes server state, all 8 hands complete.
await page.goto(base+'gem-reels/');
await page.locator('[data-action="spin"]').click();
await page.locator('[data-action="respin"]').waitFor();
await page.locator('[data-reel="0"]').click();
assert.equal(await page.locator('[data-reel="0"]').getAttribute('aria-pressed'),'true');
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:'/tmp/gem-reels-mobile.png',fullPage:true});
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.reload();
await page.locator('[data-action="respin"]').waitFor();
for(let hand=0;hand<8;hand++) {
  if(hand) {await page.locator('[data-action="spin"]').click();await page.locator('[data-action="respin"]').waitFor();}
  await page.locator('[data-reel="0"]').click();
  await page.locator('[data-action="respin"]').click();
  if(hand<7) await page.locator('[data-action="spin"]').waitFor();
}
await page.getByRole('heading',{name:'Run complete',exact:true}).waitFor();
assert.equal(await page.locator('.mg-reels li').count(),8);
await page.screenshot({path:'/tmp/gem-reels-complete.png',fullPage:true});
await page.setViewportSize({width:1280,height:1000});
// No trailing slash, refresh, back link and old bookmarks all remain usable.
await page.goto(base + "gem-catcher");
assert.equal(new URL(page.url()).pathname, "/minigames/gem-catcher/");
await page.locator("#arena").waitFor();
await page.reload();
await page.locator("#arena").waitFor();
await page.getByRole("link", { name: "← All minigames" }).click();
await page.locator(".mg-card").first().waitFor();
await page.goto(base + "?game=gem-catcher");
await page.locator("#arena").waitFor();
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base);
await page.screenshot({
  path: fileURLToPath(new URL("minigames-hub-mobile.png", artifacts)),
  fullPage: true,
});
assert.ok(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
await page.goto(base + "mine-sweeper/");
await page.locator("#play .mg-stat").waitFor();
await page.screenshot({
  path: fileURLToPath(new URL("minigames-mine-mobile.png", artifacts)),
  fullPage: true,
});
assert.ok(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "PASS: twelve game screens, interactions, catalog, mobile sizing, no browser errors",
);
