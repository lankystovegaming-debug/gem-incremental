import { chromium } from "/Users/lanky/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, "assets", "captures");
const email = process.env.GEM_TRAILER_EMAIL;
const password = process.env.GEM_TRAILER_PASSWORD;

if (!email || !password) {
  throw new Error("Set GEM_TRAILER_EMAIL and GEM_TRAILER_PASSWORD before capturing.");
}

await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: "dark",
  reducedMotion: "no-preference",
});
const page = await context.newPage();

async function settle() {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2200);
}

async function suppressDialogs() {
  await page.locator("dialog").evaluateAll((nodes) => nodes.forEach((node) => node.remove())).catch(() => {});
}

async function dismissOverlays() {
  await page.keyboard.press("Escape").catch(() => {});
  await page.locator(".tour-root").evaluateAll((nodes) => nodes.forEach((node) => node.remove())).catch(() => {});
  await page.locator("dialog.dungeon-announcement[open]").evaluateAll((nodes) => nodes.forEach((node) => node.close())).catch(() => {});
  const later = page.getByRole("button", { name: /later/i });
  if (await later.isVisible().catch(() => false)) await later.click({ force: true }).catch(() => {});
  const close = page.getByRole("button", { name: /close|dismiss/i });
  for (const button of await close.all()) {
    if (await button.isVisible().catch(() => false)) await button.click({ force: true }).catch(() => {});
  }
  await page.waitForTimeout(250);
  await page.locator("dialog[open]").evaluateAll((nodes) => nodes.forEach((node) => node.remove())).catch(() => {});
}

await page.goto("https://gemincremental.com/account/", { waitUntil: "domcontentloaded" });
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill(password);
await page.getByRole("button", { name: /^Log In$/ }).click();
await page.waitForTimeout(1800);

const routes = [
  ["landing", "/"],
  ["roll", "/roll/"],
  ["inventory", "/inventory/"],
  ["crafting", "/crafting/"],
  ["gem-index", "/gem-index/"],
  ["dungeons", "/dungeons/"],
  ["workbench", "/workbench/"],
  ["season", "/seasons/"],
  ["guilds", "/guilds/"],
  ["market", "/auctions/"],
  ["lottery", "/lottery/"],
  ["bank", "/bank/"],
  ["leaderboards", "/leaderboards/"],
  ["minigames", "/minigames/"],
  ["gem-2048", "/minigames/gem-2048/"],
  ["gem-reels", "/minigames/gem-reels/"],
  ["gemdle", "/gemdle/"],
];
const only = new Set((process.env.GEM_CAPTURE_ONLY || "").split(",").filter(Boolean));

for (const [name, route] of routes) {
  if (only.size && !only.has(name)) continue;
  await page.goto(`https://gemincremental.com${route}`, { waitUntil: "domcontentloaded" });
  await settle();
  await dismissOverlays();
  await page.waitForTimeout(650);
  await suppressDialogs();
  await page.screenshot({ path: path.join(output, `${name}.png`), type: "png" });
  console.log(`${name}\t${await page.title()}\t${page.url()}`);
}

// A real roll supplies authentic motion/result material without fabricating UI.
await page.goto("https://gemincremental.com/roll/", { waitUntil: "domcontentloaded" });
await settle();
await dismissOverlays();
await page.waitForTimeout(350);
await suppressDialogs();
const rollButton = page.getByRole("button", { name: /^Roll$/ });
if (await rollButton.isEnabled().catch(() => false)) {
  await rollButton.click({ force: true });
  await page.waitForTimeout(220);
  await suppressDialogs();
  await page.screenshot({ path: path.join(output, "roll-impact.png"), type: "png" });
  await page.waitForTimeout(1450);
  await suppressDialogs();
  await page.screenshot({ path: path.join(output, "roll-result.png"), type: "png" });
}

await browser.close();
