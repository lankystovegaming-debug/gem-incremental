import assert from "node:assert/strict";

const { chromium } = await import(
  process.env.NAVIGATION_PLAYWRIGHT_MODULE || "playwright"
);

const base = process.env.NAVIGATION_PREVIEW_URL || "http://127.0.0.1:5500/";
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 }
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator(".tabbar").waitFor();

    const mobile = await page.evaluate(() => ({
      viewport: innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      labels: [...document.querySelectorAll(".tabbar__link")].map((item) => item.textContent.trim()),
      topbarExplore: getComputedStyle(document.querySelector(".topbar-explore")).display,
      topbarUtilities: getComputedStyle(document.querySelector(".topbar-more")).display,
      topbarSettings: getComputedStyle(document.querySelector(".topbar-settings")).display
    }));
    assert.ok(mobile.pageWidth <= mobile.viewport + 1, JSON.stringify(mobile));
    assert.deepEqual(mobile.labels, ["Roll", "Items", "Craft", "Shop", "More"]);
    assert.equal(mobile.topbarExplore, "none");
    assert.equal(mobile.topbarUtilities, "none");
    assert.equal(mobile.topbarSettings, "none");

    await page.locator("#mobileNavigationTrigger").click();
    const sheet = page.locator("#mobileNavigationSheet");
    await sheet.waitFor();
    const sheetMetrics = await sheet.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      right: element.getBoundingClientRect().right,
      viewport: innerWidth,
      maxTarget: Math.min(...[...element.querySelectorAll("a, button, input")]
        .filter((node) => getComputedStyle(node).display !== "none" && node.getBoundingClientRect().height > 0)
        .map((node) => node.getBoundingClientRect().height))
    }));
    assert.ok(sheetMetrics.width <= sheetMetrics.viewport, JSON.stringify(sheetMetrics));
    assert.ok(sheetMetrics.right <= sheetMetrics.viewport + 1, JSON.stringify(sheetMetrics));
    assert.ok(sheetMetrics.maxTarget >= 44, JSON.stringify(sheetMetrics));

    await page.locator("#mobileNavigationSearch").fill("gem index");
    assert.equal(await page.locator('[data-mobile-navigation-row]:not([hidden])').count(), 1);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#mobileNavigationTrigger").getAttribute("aria-expanded"), "false");
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => {
      localStorage.setItem("gemIncremental.settings", JSON.stringify({
        topBarMain: ["auctions", "expeditions", "gem-index", "mutation-index", "leaderboards", "roll-counts", "gemdle"]
      }));
    });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator(".tabbar").waitFor();
    assert.deepEqual(
      await page.locator(".tabbar__link").allTextContents().then((labels) => labels.map((label) => label.trim())),
      ["Market", "Exped.", "Index", "Mutations", "More"]
    );
    await page.locator("#mobileNavigationTrigger").click();
    assert.equal(await page.locator('.mobile-navigation-row[href="./"]').count(), 1, "Roll remains reachable in More");
    await context.close();
  }

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1600, height: 1000 }
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator("#shellExploreButton").waitFor();
    assert.ok(await page.locator(".nav > .nav__link").count() <= 7);
    assert.equal(await page.locator(".tabbar").evaluate((element) => getComputedStyle(element).display), "none");

    await page.locator("#shellExploreButton").focus();
    await page.keyboard.press("Enter");
    const menu = page.locator("#shellExploreMenu");
    assert.ok((await menu.boundingBox()).width >= 600);
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "shellExploreButton");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await context.close();
  }


  {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await context.addInitScript(() => {
      localStorage.setItem("gemIncremental.settings", JSON.stringify({
        topBarMain: ["roll", "inventory", "crafting", "boosts", "auctions", "expeditions", "gem-index", "mutation-index", "leaderboards", "roll-counts", "minigames"]
      }));
    });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator(".topbar").waitFor();
    await page.evaluate(() => {
      document.querySelector("#shellWalletValue").textContent = "$999,999,999,999,999";
      document.querySelector("#shellWallet")?.classList.add("wallet--expanded");
      document.querySelector("#shellAccountName").textContent = "A_very_long_player_username_for_shell_testing";
      window.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(100);
    const stress = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
      primaryCount: document.querySelectorAll(".nav > .nav__link").length,
      headerRight: document.querySelector(".topbar__inner").getBoundingClientRect().right
    }));
    assert.ok(stress.pageWidth <= stress.viewport + 1, JSON.stringify(stress));
    assert.ok(stress.headerRight <= stress.viewport + 1, JSON.stringify(stress));
    assert.equal(stress.primaryCount, 7);
    await page.locator("#shellExploreButton").click();
    assert.ok(await page.locator('#shellExploreMenu a[href="./mutation-index/"]').count() >= 1);
    await context.close();
  }
} finally {
  await browser.close();
}

console.log("PASS: Phase 2 navigation at phone, tablet, and desktop widths");
