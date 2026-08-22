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

let widget = null;
let valueEl = null;
let pollTimer = null;
let rafId = null;
let displayed = null; // currently shown (tweened) value
let target = null;    // latest value from the server

function formatCash(value) {
  return "$" + Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function paint() {
  if (valueEl) valueEl.textContent = formatCash(displayed ?? 0);
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

async function poll() {
  const { data, error } = await supabase.rpc("get_global_cash");
  const next = Number(data);
  if (error || !Number.isFinite(next)) return;

  target = next;

  // Snap (and paint immediately) on first load, while hidden — where rAF is
  // paused — or when the viewer asked for reduced motion. Otherwise ease the
  // displayed value toward the new figure for a live count-up.
  if (displayed === null || document.hidden || prefersReducedMotion()) {
    displayed = next;
    paint();
  } else {
    ensureAnimating();
  }
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
  `;
  document.body.appendChild(widget);
  valueEl = widget.querySelector(".global-cash__value");

  displayed = null;
  target = null;
  poll();
  pollTimer = setInterval(poll, POLL_MS);
}

function unmount() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
  widget?.remove();
  widget = null;
  valueEl = null;
  displayed = null;
  target = null;
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
