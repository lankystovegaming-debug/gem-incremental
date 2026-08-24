import { supabase } from "../backend/supabase.js";
import { getSettings, onSettingsChange } from "./settings.js";

// =========================================================
// CASH COUNTERS
//
// An optional (off by default) small side panel showing two
// economy figures plus a live feed of what moves them:
//
//   • Global cash  — the sum of every player's LIFETIME earnings.
//                    Only ever rises (when someone sells to the game).
//   • Player cash  — the sum of every player's CURRENT money. Falls
//                    when players buy from the game; player-to-player
//                    trades just move money around, so they leave it
//                    unchanged. Assets (gems) are not counted.
//
// Both are polled together and eased toward the latest figure so
// they read as live, counting numbers rather than jumpy refreshes.
// =========================================================

const POLL_MS = 5000;
const MAX_FEED = 4;
const METRICS = ["total", "cash"];

let widget = null;
let valueEls = {};      // { total: el, cash: el }
let onlineEl = null;
let feedEl = null;
let pollTimer = null;
let rafId = null;
// The counter glides continuously between polls by extrapolating each metric's
// rate of change, instead of easing to the polled value and stopping. `anchor`
// is the server value at the last poll, `rate` its measured units/ms, and
// `displayed` eases toward a target that keeps advancing at that rate.
let displayed = { total: null, cash: null };
let anchor = { total: null, cash: null };
let anchorTime = { total: 0, cash: 0 };
let rate = { total: 0, cash: 0 };       // units per millisecond
let prevVal = { total: null, cash: null };
let prevTime = { total: 0, cash: 0 };
let lastTopId = 0;      // newest sale id already shown (to flash only new ones)

function formatCash(value) {
  return "$" + Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Compact money for the feed lines (+$5K, +$2.3M).
function compact(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e9) return "+$" + (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (abs >= 1e6) return "+$" + (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1e3) return "+$" + (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return "+$" + Math.round(n).toLocaleString("en-US");
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function paint() {
  for (const key of METRICS) {
    if (valueEls[key]) valueEls[key].textContent = formatCash(displayed[key] ?? 0);
  }
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// Renders the most recent sales that pushed global cash up. New entries
// (ids past the last one shown) animate in so the feed reads as live.
function renderFeed(events) {
  if (!feedEl || !Array.isArray(events)) return;
  const list = events.slice(0, MAX_FEED);
  const topId = Number(list[0]?.id ?? lastTopId);
  feedEl.innerHTML = list.map((e) => {
    const fresh = Number(e.id) > lastTopId ? " global-cash__event--new" : "";
    return `<div class="global-cash__event${fresh}">`
      + `<span class="global-cash__event-who">${esc(e.name || "Someone")}</span> sold `
      + `${esc(e.gem || "a gem")} <b>${compact(e.amount)}</b></div>`;
  }).join("");
  lastTopId = Math.max(lastTopId, topId);
}

async function poll() {
  const { data, error } = await supabase.rpc("get_global_cash_feed");
  if (error || !data) return;

  const still = document.hidden || prefersReducedMotion();
  const now = performance.now();
  for (const key of METRICS) {
    const next = Number(data[key]);
    if (!Number.isFinite(next)) continue; // e.g. a metric the server hasn't sent yet

    if (displayed[key] === null || still) {
      // Snap on the first value (so a late/missing field can't leave it stuck
      // at $0.00), or when motion is off/hidden.
      displayed[key] = next;
      anchor[key] = next;
      anchorTime[key] = now;
      rate[key] = 0;
    } else {
      // Measure how fast this metric moved over the last interval and keep
      // advancing at that rate between polls. Damp slightly so a rising counter
      // stays a hair behind reality and always eases upward, never backward.
      const dt = Math.max(1, now - prevTime[key]);
      const observed = (next - prevVal[key]) / dt;
      rate[key] = (rate[key] * 0.35 + observed * 0.65) * 0.9;
      anchor[key] = next;
      anchorTime[key] = now;
    }
    prevVal[key] = next;
    prevTime[key] = now;
  }
  paint();
  if (!still) ensureAnimating();

  if (onlineEl && Number.isFinite(Number(data.online))) {
    onlineEl.textContent = Number(data.online).toLocaleString("en-US");
  }

  renderFeed(data.events);
}

function ensureAnimating() {
  if (rafId != null || !widget) return;
  const EASE = 0.12;
  const step = () => {
    rafId = null;
    if (!widget) return;
    const now = performance.now();
    let active = false;
    for (const key of METRICS) {
      if (displayed[key] === null || anchor[key] === null) continue;
      // Predict where the metric is now by extrapolating its measured rate.
      // Cap the horizon so a missed poll can't let the prediction run away.
      const elapsed = Math.min(now - anchorTime[key], POLL_MS * 1.5);
      const predicted = anchor[key] + rate[key] * elapsed;
      const diff = predicted - displayed[key];
      displayed[key] += diff * EASE;
      // Keep the loop alive while the metric is still moving or catching up, so
      // the number glides continuously instead of stopping between polls.
      if ((Math.abs(rate[key]) > 1e-9 && elapsed < POLL_MS * 1.5) || Math.abs(diff) > 0.005) {
        active = true;
      }
    }
    paint();
    if (active) rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
}

function mount() {
  if (widget) return;

  widget = document.createElement("div");
  widget.className = "global-cash";
  widget.setAttribute("role", "status");
  widget.setAttribute("aria-live", "off");
  widget.innerHTML = `
    <div class="global-cash__online" title="Players active in the last couple of minutes">
      <span class="global-cash__dot" aria-hidden="true"></span>
      <span class="global-cash__online-num">—</span>&nbsp;online now
    </div>
    <div class="global-cash__stat">
      <span class="global-cash__label">Global cash</span>
      <span class="global-cash__value" data-metric="total"
            title="Total lifetime earnings across every player">—</span>
    </div>
    <div class="global-cash__stat">
      <span class="global-cash__label">Player cash</span>
      <span class="global-cash__value global-cash__value--cash" data-metric="cash"
            title="Total money in every player's wallet right now (assets not counted)">—</span>
    </div>
    <div class="global-cash__feed"></div>
  `;
  document.body.appendChild(widget);
  valueEls = {
    total: widget.querySelector('[data-metric="total"]'),
    cash: widget.querySelector('[data-metric="cash"]')
  };
  onlineEl = widget.querySelector(".global-cash__online-num");
  feedEl = widget.querySelector(".global-cash__feed");

  displayed = { total: null, cash: null };
  anchor = { total: null, cash: null };
  anchorTime = { total: 0, cash: 0 };
  rate = { total: 0, cash: 0 };
  prevVal = { total: null, cash: null };
  prevTime = { total: 0, cash: 0 };
  lastTopId = 0;
  poll();
  pollTimer = setInterval(poll, POLL_MS);
}

function unmount() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
  widget?.remove();
  widget = null;
  valueEls = {};
  onlineEl = null;
  feedEl = null;
  displayed = { total: null, cash: null };
  anchor = { total: null, cash: null };
  anchorTime = { total: 0, cash: 0 };
  rate = { total: 0, cash: 0 };
  prevVal = { total: null, cash: null };
  prevTime = { total: 0, cash: 0 };
  lastTopId = 0;
}

export function initGlobalCash() {
  if (getSettings().globalCash) mount();
  onSettingsChange((settings) => {
    if (settings.globalCash) mount();
    else unmount();
  });

  // Pause polling while the tab is hidden to save requests.
  document.addEventListener("visibilitychange", () => {
    if (!widget) return;
    if (document.hidden) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    } else if (!pollTimer) {
      poll();
      pollTimer = setInterval(poll, POLL_MS);
    }
  });
}
