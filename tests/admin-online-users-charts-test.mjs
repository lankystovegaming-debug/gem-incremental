import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/migrations/20260905000000_admin_analytics_daily_online_series.sql");
const adminJs = read("admin/admin.js");
const adminCss = read("admin/admin.css");

// ── Migration: analytics RPC exposes a per-day online-users series ─────────

// The daily graph needs a real series, not just the single dailyOnline count.
assert.match(migration, /create or replace function public\.get_admin_analytics\(\)/,
  "migration must redefine get_admin_analytics()");
assert.match(migration, /'dailyOnlineSeries'\s*,\s*v_daily_series/,
  "analytics payload must include dailyOnlineSeries");
assert.match(migration, /generate_series\(0,\s*13\)/,
  "daily series must span 14 day buckets");
assert.match(migration, /date_trunc\('day'/,
  "daily series must bucket presence events by day");
// The hourly series must survive the redefinition unchanged.
assert.match(migration, /'hourlyOnline'\s*,\s*v_hourly/,
  "redefined analytics must still return hourlyOnline");

// ── Client: shared renderer drives both hourly and daily charts ───────────

assert.match(adminJs, /function renderPresenceChart\(/,
  "admin.js must define the shared presence chart renderer");
assert.match(adminJs, /data\.dailyOnlineSeries/,
  "admin.js must read the new dailyOnlineSeries payload");
assert.match(adminJs, /chartId:\s*"analyticsHourlyChart"/,
  "admin.js must render the hourly chart");
assert.match(adminJs, /chartId:\s*"analyticsDailyChart"/,
  "admin.js must render the daily chart");
// Hover behaviour is a custom floating tooltip, wired after each render.
assert.match(adminJs, /function wirePresenceTooltips\(/,
  "admin.js must define the hover tooltip wiring");
assert.match(adminJs, /wirePresenceTooltips\(analyticsContent\)/,
  "admin.js must wire tooltips after rendering analytics");
assert.match(adminJs, /data-tooltip=/,
  "chart bars must carry a data-tooltip hook for the hover tooltip");

// The old single-chart markup must be gone so the two coexist cleanly.
assert.doesNotMatch(adminJs, /class="analytics-bars"/,
  "the legacy analytics-bars container must be replaced");

// ── Client: Hourly/Daily toggle swaps which chart is shown ────────────────
assert.match(adminJs, /function wirePresenceToggle\(/,
  "admin.js must define the hourly/daily toggle wiring");
assert.match(adminJs, /wirePresenceToggle\(analyticsContent\)/,
  "admin.js must wire the toggle after rendering analytics");
assert.match(adminJs, /data-presence-view="hourly"/,
  "admin.js must render the Hourly toggle button");
assert.match(adminJs, /data-presence-view="daily"/,
  "admin.js must render the Daily toggle button");
assert.match(adminJs, /data-presence-block="daily" hidden/,
  "the daily chart must start hidden so one view shows at a time");

// ── CSS: hoverable, styled charts ─────────────────────────────────────────

assert.match(adminCss, /\.analytics-chart\s*\{/,
  "admin.css must style the chart container");
assert.match(adminCss, /\.analytics-bar-wrap:hover/,
  "admin.css must define a hover state for chart bars");
assert.match(adminCss, /\.analytics-tooltip\s*\{/,
  "admin.css must style the floating tooltip");
assert.match(adminCss, /\.analytics-bar-wrap\.is-peak/,
  "admin.css must highlight the peak bar");
assert.match(adminCss, /\.analytics-toggle__btn/,
  "admin.css must style the hourly/daily toggle");
assert.match(adminCss, /\.analytics-toggle__btn\.is-active/,
  "admin.css must style the active toggle button");

console.log("admin-online-users-charts-test passed");
