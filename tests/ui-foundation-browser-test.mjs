import assert from "node:assert/strict";

const { chromium } = await import(
  process.env.UI_FOUNDATION_PLAYWRIGHT_MODULE || "playwright"
);

const base = process.env.UI_FOUNDATION_PREVIEW_URL || "http://127.0.0.1:5500/";
const pages = ["", "settings/", "crafting/", "auctions/", "inventory/"];
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 }
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
          pageWidth: document.documentElement.scrollWidth,
          minWidth: getComputedStyle(document.documentElement).minWidth
        }));

        assert.ok(
          metrics.pageWidth <= metrics.viewportWidth + 1,
          `${viewport.name} ${path || "roll"} overflowed: ${JSON.stringify(metrics)}`
        );
        assert.equal(metrics.minWidth, "320px");

        if (path && path !== "") {
          const hero = page.locator(".page-hero");
          assert.equal(await hero.count(), 1, `${path} should expose one PageHero`);
          assert.ok(await hero.evaluate((element) => element.getBoundingClientRect().width <= innerWidth));
        }

        await page.close();
      }

      if (viewport.name === "mobile") {
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
        const tabs = await crafting.locator(".responsive-tabs").evaluate((element) => ({
          client: element.clientWidth,
          scroll: element.scrollWidth,
          overflow: getComputedStyle(element).overflowX
        }));
        assert.equal(tabs.overflow, "auto");
        assert.ok(tabs.scroll > tabs.client, JSON.stringify(tabs));
        await crafting.close();
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log("PASS: Phase 1 representative pages at 390px and 1280px without page overflow");
