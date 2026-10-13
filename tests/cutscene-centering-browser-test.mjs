import assert from "node:assert/strict";
import { BESPOKE_CUTSCENES } from "../src/ui/cutsceneConfig.js";
import { DEEP_SEA_GEMS } from "../src/data/deepSea.js";

const { chromium } = await import(process.env.CUTSCENE_PLAYWRIGHT_MODULE || "playwright");
const base = process.env.CUTSCENE_PREVIEW_URL || "http://127.0.0.1:5500";
const gems = DEEP_SEA_GEMS.filter(gem => BESPOKE_CUTSCENES[gem.name.toLowerCase()])
  .map(gem => ({ name: gem.name, rarity: gem.rarity }));
gems.push({ name: "Quartz", rarity: 100_000 }, { name: "First Light", rarity: 100_000_000 });
const browser = await chromium.launch({ headless: true });
let checks = 0;
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    for (const rollStyles of [false, true]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/__cutscene-centering", route => route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head><link rel="stylesheet" href="/src/styles/app.css">
          ${rollStyles ? '<link rel="stylesheet" href="/style.css">' : ''}
          <link rel="stylesheet" href="/src/ui/cutsceneScenes.css" data-cutscene-v5-styles>
          <style>body{min-height:240vh}.cs-reveal{transition:none!important}</style>
          </head><body></body></html>`
      }));
      await page.goto(`${base}/__cutscene-centering`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      for (const gem of gems) {
        const metrics = await page.evaluate(async gem => {
          const { renderCutscene } = await import("/src/ui/cutsceneScenes.js");
          window.centeringScene?.cleanup({ interrupted: true });
          document.querySelector("#ultra-cutscene-overlay")?.remove();
          const scene = renderCutscene({ gem, mutationIds: ["polished", "gilded", "prismatic", "celestial", "corrupted"] }, 60_000, { replay: true });
          window.centeringScene = scene;
          scene.overlay.dataset.phase = "reveal";
          scene.overlay.querySelector(".cs-camera-stage").classList.add("is-exiting");
          const reveal = scene.overlay.querySelector(".cs-reveal");
          reveal.classList.add("is-visible");
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const children = [...reveal.children].map(child => {
            const r = child.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, x: r.left + r.width / 2 };
          });
          const r = reveal.getBoundingClientRect();
          return {
            viewport: { width: innerWidth, height: innerHeight },
            reveal: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
            content: {
              x: (Math.min(...children.map(c => c.left)) + Math.max(...children.map(c => c.right))) / 2,
              y: (Math.min(...children.map(c => c.top)) + Math.max(...children.map(c => c.bottom))) / 2
            }, children
          };
        }, gem);
        const label = `${gem.name}, ${viewport.width}x${viewport.height}, ${rollStyles ? "Roll" : "shared/replay"} styles`;
        for (const block of [metrics.reveal, metrics.content]) {
          assert.ok(Math.abs(block.x - viewport.width / 2) <= 1, `${label}: horizontal offset ${block.x - viewport.width / 2}`);
          assert.ok(Math.abs(block.y - viewport.height / 2) <= 1, `${label}: vertical offset ${block.y - viewport.height / 2}`);
        }
        for (const child of metrics.children) {
          assert.ok(Math.abs(child.x - viewport.width / 2) <= 1, `${label}: reveal child is off-centre`);
          assert.ok(child.left >= -1 && child.right <= viewport.width + 1, `${label}: reveal child exceeds viewport width`);
        }
        checks++;
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
console.log(`PASS: ${checks} final reveal layouts centered, including mutations, scrollbar gutters and shared/Roll styles.`);
