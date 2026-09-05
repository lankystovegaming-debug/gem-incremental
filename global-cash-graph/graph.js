import { supabase } from "../src/backend/supabase.js";
import { burnMoney, loadFurnaceState } from "../src/backend/cloudFurnace.js";
import { confirmDialog } from "../src/ui/dialog.js";

// =========================================================
// CASH MARKET
//
// A stock-style chart of the whole economy over time. Two series
// (global cash = lifetime earnings, player cash = current wallets)
// are drawn as a smooth line + gradient area over a chosen time
// range, with a live ticker, hover readout and auto-refresh.
//
// The SVG is drawn in real pixel coordinates (viewBox tracks the
// container size) so stroke widths stay uniform at any width.
// =========================================================

const SVGNS = "http://www.w3.org/2000/svg";
const POLL_MS = 60000;

const chart = document.querySelector("[data-chart]");
const wrap = chart.parentElement;
const tooltip = document.querySelector("[data-tooltip]");
const statusEl = document.querySelector("[data-status]");
const priceEl = document.querySelector("[data-price]");
const changeEl = document.querySelector("[data-change]");
const changeAbsEl = document.querySelector("[data-change-abs]");
const changePctEl = document.querySelector("[data-change-pct]");
const changeRangeEl = document.querySelector("[data-change-range]");
const metricNameEl = document.querySelector("[data-metric-name]");
const metricButtons = [...document.querySelectorAll("[data-metric]")];
const rangeButtons = [...document.querySelectorAll("[data-range]")];
const furnaceForm = document.querySelector("[data-furnace-form]");
const furnaceInput = document.querySelector("[data-furnace-amount]");
const furnaceLifetime = document.querySelector("[data-furnace-lifetime]");
const furnaceStatus = document.querySelector("[data-furnace-status]");
const furnaceLeaderboard = document.querySelector("[data-furnace-leaderboard]");

const PAD = { left: 62, right: 14, top: 16, bottom: 26 };

const METRIC_LABELS = { lifetime: "Global cash", money: "Player cash", bank: "Bank deposits" };
const RANGE_LABELS = {
  1: "past hour", 6: "past 6 hours", 24: "past 24 hours",
  168: "past 7 days", 100000: "all time"
};

let metric = "lifetime";
let hours = 24;
let rows = [];       // [{ t: ms, lifetime, money }]
let layout = null;   // last-drawn geometry, for hover mapping
let pollTimer = null;
let furnaceMoney = 0;
let furnaceBusy = false;

// ---------------------------------------------------------
// FORMATTING
// ---------------------------------------------------------

function compact(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return sign + "$" + (abs / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return sign + "$" + (abs / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return sign + "$" + (abs / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return sign + "$" + (abs / 1e3).toFixed(1) + "K";
  return sign + "$" + Math.round(abs).toLocaleString("en-US");
}

function fullMoney(value) {
  return "$" + Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

function friendlyBurnError(error) {
  const message = String(error?.message ?? "");
  if (message.includes("insufficient_money")) return "You don't have enough money to burn that amount.";
  if (message.includes("not_authenticated")) return "Sign in to use the Furnace.";
  if (message.includes("invalid_burn_amount")) return "Enter an amount of at least $0.01.";
  return "The Furnace didn't light. Please try again.";
}

async function refreshFurnace() {
  const { data, error } = await loadFurnaceState();
  if (error) { furnaceStatus.textContent = "Couldn't load Furnace data."; return; }
  furnaceMoney = data.money;
  furnaceLifetime.textContent = fullMoney(data.lifetimeMoneyBurned);
  furnaceInput.disabled = !data.authenticated;
  furnaceForm.querySelectorAll("button").forEach((button) => { button.disabled = !data.authenticated; });
  furnaceStatus.textContent = data.authenticated ? "" : "Sign in to burn money.";
  furnaceLeaderboard.innerHTML = data.leaderboard.length
    ? data.leaderboard.map((row) => `<li><span>${escapeHtml(row.username)}</span><strong>${fullMoney(row.lifetime_money_burned)}</strong></li>`).join("")
    : '<li class="furnace__empty">No money has been burned yet. Be the first.</li>';
}

async function requestBurn({ amount = null, burnAll = false }) {
  if (furnaceBusy) return;
  const requested = burnAll ? furnaceMoney : Number(amount);
  if (!Number.isFinite(requested) || requested <= 0) {
    furnaceStatus.textContent = "Enter an amount of at least $0.01.";
    furnaceInput.focus();
    return;
  }
  const choice = await confirmDialog({
    title: `Burn ${fullMoney(requested)}?`,
    body: "<p>This money will be permanently destroyed. This cannot be undone.</p>",
    confirmLabel: burnAll ? "Burn everything" : "Burn money",
    tone: "danger"
  });
  if (choice !== "confirm") return;
  furnaceBusy = true;
  furnaceForm.querySelectorAll("button, input").forEach((control) => { control.disabled = true; });
  furnaceStatus.textContent = "Burning…";
  const { data, error } = await burnMoney({ amount: requested, burnAll });
  furnaceBusy = false;
  if (error) {
    furnaceStatus.textContent = friendlyBurnError(error);
    await refreshFurnace();
    return;
  }
  furnaceMoney = Number(data.money ?? 0);
  furnaceInput.value = "";
  window.cashMarketShell?.setWallet(furnaceMoney);
  await Promise.all([refreshFurnace(), refresh()]);
  furnaceStatus.textContent = `${fullMoney(data.burned)} permanently burned.`;
}

function axisMoney(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e12) return "$" + (n / 1e12).toFixed(1) + "T";
  if (abs >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + Math.round(n);
}

function timeLabel(ms) {
  const d = new Date(ms);
  if (hours <= 24) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function el(name, attrs = {}) {
  const node = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// ---------------------------------------------------------
// DATA
// ---------------------------------------------------------

async function fetchHistory() {
  const { data, error } = await supabase.rpc("get_global_cash_history", { p_hours: hours });
  if (error) throw error;
  const list = Array.isArray(data) ? data : [];
  return list
    .map((r) => ({
      t: new Date(r.at).getTime(),
      lifetime: Number(r.lifetime) || 0,
      money: Number(r.money) || 0,
      bank: Number(r.bank) || 0
    }))
    .filter((r) => Number.isFinite(r.t))
    .sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------
// TICKER
// ---------------------------------------------------------

function paintTicker() {
  metricNameEl.textContent = METRIC_LABELS[metric];

  if (rows.length === 0) {
    priceEl.textContent = "—";
    changeAbsEl.textContent = "—";
    changePctEl.textContent = "";
    changeRangeEl.textContent = "";
    changeEl.classList.remove("market__change--up", "market__change--down");
    return;
  }

  const first = rows[0][metric];
  const last = rows[rows.length - 1][metric];
  const diff = last - first;
  const pct = first > 0 ? (diff / first) * 100 : 0;
  const up = diff >= 0;

  priceEl.textContent = fullMoney(last);
  changeAbsEl.textContent = (up ? "+" : "−") + compact(Math.abs(diff)).replace("-", "");
  changePctEl.textContent = (up ? "▲ " : "▼ ") + Math.abs(pct).toFixed(2) + "%";
  changeRangeEl.textContent = RANGE_LABELS[hours] || "";
  changeEl.classList.toggle("market__change--up", up);
  changeEl.classList.toggle("market__change--down", !up);
}

// ---------------------------------------------------------
// CHART
// ---------------------------------------------------------

function niceTicks(min, max, count) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(v);
  return ticks;
}

function draw() {
  chart.textContent = "";
  const w = wrap.clientWidth || 640;
  const h = wrap.clientHeight || 340;
  chart.setAttribute("viewBox", `0 0 ${w} ${h}`);
  chart.setAttribute("preserveAspectRatio", "none");

  if (rows.length === 0) {
    statusEl.hidden = false;
    statusEl.textContent = "No market data yet — check back soon.";
    layout = null;
    return;
  }
  statusEl.hidden = true;

  const plotW = w - PAD.left - PAD.right;
  const plotH = h - PAD.top - PAD.bottom;

  const values = rows.map((r) => r[metric]);
  let vMin = Math.min(...values);
  let vMax = Math.max(...values);
  if (vMin === vMax) { vMin -= 1; vMax += 1; }        // flat line -> give it room
  const headroom = (vMax - vMin) * 0.08;
  vMin -= headroom; vMax += headroom;

  const tMin = rows[0].t;
  const tMax = rows[rows.length - 1].t;
  const tSpan = tMax - tMin || 1;

  const xOf = (t) => PAD.left + ((t - tMin) / tSpan) * plotW;
  const yOf = (v) => PAD.top + (1 - (v - vMin) / (vMax - vMin)) * plotH;

  // --- horizontal grid + y labels ---
  for (const tick of niceTicks(vMin, vMax, 4)) {
    const y = yOf(tick);
    if (y < PAD.top - 1 || y > PAD.top + plotH + 1) continue;
    chart.appendChild(el("line", {
      x1: PAD.left, y1: y, x2: PAD.left + plotW, y2: y,
      class: "market__grid"
    }));
    const label = el("text", { x: PAD.left - 8, y: y + 4, class: "market__ylabel" });
    label.textContent = axisMoney(tick);
    chart.appendChild(label);
  }

  // --- x labels ---
  const xTickCount = Math.max(2, Math.min(5, Math.floor(plotW / 90)));
  for (let i = 0; i < xTickCount; i++) {
    const t = tMin + (tSpan * i) / (xTickCount - 1);
    const x = xOf(t);
    const label = el("text", { x, y: h - 8, class: "market__xlabel" });
    label.textContent = timeLabel(t);
    if (i === 0) label.setAttribute("text-anchor", "start");
    else if (i === xTickCount - 1) label.setAttribute("text-anchor", "end");
    else label.setAttribute("text-anchor", "middle");
    chart.appendChild(label);
  }

  // --- area + line paths ---
  const pts = rows.map((r) => [xOf(r.t), yOf(r[metric])]);
  const linePath = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const baseY = PAD.top + plotH;
  const areaPath = `M ${pts[0][0].toFixed(1)} ${baseY.toFixed(1)} `
    + pts.map((p) => "L" + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ")
    + ` L ${pts[pts.length - 1][0].toFixed(1)} ${baseY.toFixed(1)} Z`;

  const up = rows[rows.length - 1][metric] >= rows[0][metric];
  const trend = up ? "up" : "down";

  // gradient fill
  const gradId = "market-fill";
  const defs = el("defs");
  const grad = el("linearGradient", { id: gradId, x1: "0", y1: "0", x2: "0", y2: "1" });
  grad.appendChild(el("stop", { offset: "0%", class: `market__fill-top market__fill-top--${trend}` }));
  grad.appendChild(el("stop", { offset: "100%", class: "market__fill-bottom" }));
  defs.appendChild(grad);
  chart.appendChild(defs);

  chart.appendChild(el("path", { d: areaPath, fill: `url(#${gradId})`, stroke: "none" }));
  chart.appendChild(el("path", { d: linePath, class: `market__line market__line--${trend}`, fill: "none" }));

  // last-point marker
  const lastPt = pts[pts.length - 1];
  chart.appendChild(el("circle", { cx: lastPt[0], cy: lastPt[1], r: 3.5, class: `market__dot market__dot--${trend}` }));

  // hover elements (hidden until pointer moves)
  const hoverLine = el("line", { class: "market__crosshair", y1: PAD.top, y2: PAD.top + plotH, x1: 0, x2: 0 });
  hoverLine.style.opacity = "0";
  const hoverDot = el("circle", { r: 4.5, class: "market__hoverdot" });
  hoverDot.style.opacity = "0";
  chart.appendChild(hoverLine);
  chart.appendChild(hoverDot);

  layout = { w, h, plotW, plotH, xOf, yOf, tMin, tSpan, pts, hoverLine, hoverDot, trend };
}

// ---------------------------------------------------------
// HOVER
// ---------------------------------------------------------

function onMove(event) {
  if (!layout || rows.length === 0) return;
  const rect = chart.getBoundingClientRect();
  const px = ((event.clientX - rect.left) / rect.width) * layout.w;

  // nearest sample
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < layout.pts.length; i++) {
    const d = Math.abs(layout.pts[i][0] - px);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  const [x, y] = layout.pts[best];
  const row = rows[best];

  layout.hoverLine.setAttribute("x1", x);
  layout.hoverLine.setAttribute("x2", x);
  layout.hoverLine.style.opacity = "1";
  layout.hoverDot.setAttribute("cx", x);
  layout.hoverDot.setAttribute("cy", y);
  layout.hoverDot.style.opacity = "1";

  tooltip.hidden = false;
  tooltip.innerHTML = `<div class="market__tip-val">${fullMoney(row[metric])}</div>`
    + `<div class="market__tip-time">${new Date(row.t).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
      })}</div>`;

  // position tooltip within the wrap, following the point
  const relX = (x / layout.w) * rect.width;
  const relY = (y / layout.h) * rect.height;
  const tipW = tooltip.offsetWidth;
  let left = relX - tipW / 2;
  left = Math.max(4, Math.min(left, rect.width - tipW - 4));
  tooltip.style.left = left + "px";
  tooltip.style.top = Math.max(4, relY - tooltip.offsetHeight - 14) + "px";
}

function onLeave() {
  tooltip.hidden = true;
  if (layout) {
    layout.hoverLine.style.opacity = "0";
    layout.hoverDot.style.opacity = "0";
  }
}

// ---------------------------------------------------------
// LOAD + WIRING
// ---------------------------------------------------------

async function refresh(showLoading = false) {
  if (showLoading) {
    statusEl.hidden = false;
    statusEl.textContent = "Loading market data…";
  }
  try {
    rows = await fetchHistory();
    paintTicker();
    draw();
  } catch (error) {
    console.error("[CASH MARKET] load failed:", error);
    statusEl.hidden = false;
    statusEl.textContent = "Couldn't load market data. Retrying shortly…";
  }
}

metricButtons.forEach((btn) => btn.addEventListener("click", () => {
  metric = btn.dataset.metric;
  metricButtons.forEach((b) => b.classList.toggle("active", b === btn));
  metricButtons.forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
  paintTicker();
  draw();
}));

rangeButtons.forEach((btn) => btn.addEventListener("click", () => {
  hours = Number(btn.dataset.range);
  rangeButtons.forEach((b) => b.classList.toggle("active", b === btn));
  rangeButtons.forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
  refresh(true);
}));

furnaceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  requestBurn({ amount: furnaceInput.value });
});
document.querySelectorAll("[data-furnace-quick]").forEach((button) => {
  button.addEventListener("click", () => requestBurn({ amount: button.dataset.furnaceQuick }));
});
document.querySelector("[data-furnace-max]").addEventListener("click", () => requestBurn({ burnAll: true }));

chart.addEventListener("pointermove", onMove);
chart.addEventListener("pointerleave", onLeave);

let resizeRaf = null;
window.addEventListener("resize", () => {
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(draw);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  } else if (!pollTimer) {
    refresh();
    pollTimer = setInterval(refresh, POLL_MS);
  }
});

refresh(true);
refreshFurnace();
pollTimer = setInterval(refresh, POLL_MS);
