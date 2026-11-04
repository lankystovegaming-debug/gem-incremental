import assert from "node:assert/strict";

const { chromium } = await import(
  process.env.UI_FOUNDATION_PLAYWRIGHT_MODULE || "playwright"
);

const base = process.env.UI_FOUNDATION_PREVIEW_URL || "http://127.0.0.1:5500/";
const pages = ["", "settings/", "crafting/", "auctions/", "inventory/"];
const viewports = [
  { name: "small-mobile", width: 360, height: 800 },
  { name: "mobile", width: 390, height: 844 },
  { name: "large-mobile", width: 430, height: 932 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1366, height: 768 },
  { name: "large-desktop", width: 1600, height: 1000 }
];

const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: viewport.width, height: viewport.height }
    });

    try {
      for (const path of pages) {
        const page = await context.newPage();
        await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded" });

        const metrics = await page.evaluate(() => ({
          viewportWidth: innerWidth,
          pageWidth: document.documentElement.scrollWidth
        }));

        assert.ok(
          metrics.pageWidth <= metrics.viewportWidth + 1,
          `${viewport.name} ${path || "roll"} overflowed: ${JSON.stringify(metrics)}`
        );
        if (path && path !== "") {
          const hero = page.locator(".page-hero");
          assert.equal(await hero.count(), 1, `${path} should expose one PageHero`);
          assert.ok(await hero.evaluate((element) => element.getBoundingClientRect().width <= innerWidth));
        }

        await page.close();
      }

      if (viewport.width === 390) {
        const settings = await context.newPage();
        await settings.goto(new URL("settings/", base).href, { waitUntil: "domcontentloaded" });
        const formWidths = await settings.locator(".form-row").first().evaluate((row) => ({
          row: row.getBoundingClientRect().width,
          control: row.querySelector(".form-row__control").getBoundingClientRect().width,
          direction: getComputedStyle(row).flexDirection
        }));
        assert.equal(formWidths.direction, "column");
        assert.ok(Math.abs(formWidths.row - formWidths.control) <= 1, JSON.stringify(formWidths));
        await settings.close();

        const crafting = await context.newPage();
        await crafting.goto(new URL("crafting/", base).href, { waitUntil: "domcontentloaded" });
        const picker = crafting.locator('#craftingCategory');
        assert.ok(await picker.isVisible(), 'compact native category picker at 390px');
        assert.ok(await picker.evaluate(el => el.getBoundingClientRect().height >= 44));
        assert.equal(await crafting.locator('.crafting-tabs').isVisible(), false);
        await crafting.close();
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log("PASS: Phase 1 representative pages at 360, 390, 430, 768, 1366, and 1600px without page overflow");
