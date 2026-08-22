import { supabase } from "../backend/supabase.js";
import { getSettings, onSettingsChange } from "./settings.js";

// =========================================================
// GLOBAL CASH COUNTER
//
// An optional (off by default) small side counter showing the
// sum of every player's lifetime earnings. It rises whenever
// anyone sells to the game; trading between players only moves
// money around, so it leaves the total untouched.
//
// The server sum is polled on an interval; between polls the
// displayed value eases toward the latest figure so it reads as
// a live, counting-up number rather than a jumpy refresh.
// =========================================================

const POLL_MS = 5000;
const MAX_FEED = 4;

let widget = null;
let valueEl = null;
let feedEl = null;
let pollTimer = null;
let rafId = null;
let displayed = null; // currently shown (tweened) value
let target = null;    // latest value from the server
let lastTopId = 0;    // newest sale id already shown (to flash only new ones)

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
  if (valueEl) valueEl.textContent = formatCash(displayed ?? 0);
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// Renders the most recent sales that pushed the total up. New entries
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

  const next = Number(data.total);
  if (Number.isFinite(next)) {
    target = next;
    // Snap (and paint immediately) on first load, while hidden — where rAF is
    // paused — or with reduced motion. Otherwise ease toward the new figure.
    if (displayed === null || document.hidden || prefersReducedMotion()) {
      displayed = next;
      paint();
    } else {
      ensureAnimating();
    }
  }

  renderFeed(data.events);
}

function ensureAnimating() {
  if (rafId != null || !widget) return;
  const step = () => {
    rafId = null;
    if (!widget || target === null || displayed === null) return;

    const diff = target - displayed;
    if (Math.abs(diff) < 0.005) {
      displayed = target;
    } else {
      // Exponential ease-in so a new figure counts up over ~1s.
      displayed += diff * 0.08;
      rafId = requestAnimationFrame(step);
    }
    if (valueEl) valueEl.textContent = formatCash(displayed);
  };
  rafId = requestAnimationFrame(step);
}

function mount() {
  if (widget) return;

  widget = document.createElement("div");
  widget.className = "global-cash";
  widget.setAttribute("role", "status");
  widget.setAttribute("aria-live", "off");
  widget.title = "Total lifetime earnings across every player";
  widget.innerHTML = `
    <span class="global-cash__label">Global cash</span>
    <span class="global-cash__value">—</span>
    <div class="global-cash__feed"></div>
  `;
  document.body.appendChild(widget);
  valueEl = widget.querySelector(".global-cash__value");
  feedEl = widget.querySelector(".global-cash__feed");

  displayed = null;
  target = null;
  lastTopId = 0;
  poll();
  pollTimer = setInterval(poll, POLL_MS);
}

function unmount() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
  widget?.remove();
  widget = null;
  valueEl = null;
  feedEl = null;
  displayed = null;
  target = null;
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
