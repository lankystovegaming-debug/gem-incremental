import { mountShell } from "../src/ui/shell.js";
import { supabase } from "../src/backend/supabase.js";
import { ensurePlayerAuth } from "../src/backend/auth.js";
import { notify } from "../src/ui/toast.js";
import { formatMoney } from "../src/ui/format.js";

// =========================================================
// EXCHANGE
//
// Buy shares of the whole economy. Price = total liquid player wealth
// (wallets + invested principal) / 1,000,000, computed server-side. Real
// market: it rises and falls with the economy, so holdings gain or lose. A 1%
// commission applies to each trade. All money movement happens in the
// buy_shares / sell_shares SECURITY DEFINER RPCs.
// =========================================================

const shell = mountShell({ page: "exchange", base: "../" });
const $ = (id) => document.getElementById(id);

const FEE = 0.01;
let market = null;   // { price, shares, invested, value, money, feePct }
let pollTimer = null;

function money(value) { return formatMoney(Number(value ?? 0)); }
function shares(value) {
  return Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function render() {
  if (!market) return;
  const price = Number(market.price);
  $("sharePrice").textContent = money(price);
  $("playerCash").textContent = money(market.money);
  $("posShares").textContent = shares(market.shares);
  $("posValue").textContent = money(market.value);
  $("posInvested").textContent = money(market.invested);

  const abs = Number(market.value) - Number(market.invested);
  const pct = Number(market.invested) > 0 ? (abs / Number(market.invested)) * 100 : 0;
  const up = abs >= 0;
  const pnlEl = $("posPnl");
  pnlEl.textContent = Number(market.shares) > 0
    ? `${up ? "+" : "−"}${money(Math.abs(abs))}  (${up ? "+" : "−"}${Math.abs(pct).toFixed(2)}%)`
    : "—";
  pnlEl.classList.toggle("is-up", Number(market.shares) > 0 && up);
  pnlEl.classList.toggle("is-down", Number(market.shares) > 0 && !up);

  updateEstimates();
}

function updateEstimates() {
  if (!market) return;
  const price = Number(market.price);
  const amount = Number($("buyAmount").value);
  $("buyEst").textContent = amount > 0 ? `≈ ${shares(amount / (price * (1 + FEE)))} shares` : "";
  const sh = Number($("sellShares").value);
  $("sellEst").textContent = sh > 0 ? `≈ ${money(sh * price * (1 - FEE))}` : "";
}

function friendly(error) {
  const message = String(error?.message ?? "");
  if (message.includes("insufficient_funds")) return "You don't have that much cash.";
  if (message.includes("no_shares")) return "You have no shares to sell.";
  if (message.includes("invalid_amount")) return "Enter a valid amount.";
  if (message.includes("not_authenticated")) return "Sign in first.";
  return "Something went wrong. Try again.";
}

async function loadMarket() {
  const { data, error } = await supabase.rpc("get_share_market");
  if (error || !data) {
    $("exchangeStatus").textContent = "Sign in to trade shares of the economy.";
    console.error("get_share_market failed:", error);
    return;
  }
  market = data;
  shell.setWallet(Number(market.money));
  $("exchangeStatus").textContent = "";
  render();
}

$("buyBtn").addEventListener("click", async () => {
  const amount = Math.floor(Number($("buyAmount").value));
  if (!(amount > 0)) { notify.error("Enter an amount", "How much do you want to invest?"); return; }
  if (market && amount > Number(market.money)) { notify.error("Not enough cash", "You can't invest more than you have."); return; }
  $("buyBtn").disabled = true;
  const { data, error } = await supabase.rpc("buy_shares", { p_amount: amount });
  $("buyBtn").disabled = false;
  if (error || !data) { notify.error("Buy failed", friendly(error)); return; }
  market = data;
  shell.setWallet(Number(market.money));
  $("buyAmount").value = "";
  notify.success("Shares bought", `You now hold ${shares(market.shares)} shares.`);
  render();
});

$("buyMax").addEventListener("click", () => {
  if (!market) return;
  $("buyAmount").value = String(Math.floor(Number(market.money)));
  updateEstimates();
});

$("sellBtn").addEventListener("click", async () => {
  const sh = Number($("sellShares").value);
  if (!(sh > 0)) { notify.error("Enter shares", "How many shares do you want to sell?"); return; }
  $("sellBtn").disabled = true;
  const { data, error } = await supabase.rpc("sell_shares", { p_shares: sh });
  $("sellBtn").disabled = false;
  if (error || !data) { notify.error("Sell failed", friendly(error)); return; }
  market = data;
  shell.setWallet(Number(market.money));
  $("sellShares").value = "";
  notify.success("Shares sold", `Cash is now ${money(market.money)}.`);
  render();
});

$("sellAll").addEventListener("click", () => {
  if (!market) return;
  $("sellShares").value = String(market.shares);
  updateEstimates();
});

$("buyAmount").addEventListener("input", updateEstimates);
$("sellShares").addEventListener("input", updateEstimates);

// =========================================================
// PRICE CHART ("Show stock")
// =========================================================

let chartOpen = false;
let chartHours = 1;
let chartPoints = [];

function fmtTime(date, hours) {
  const d = new Date(date);
  if (hours <= 24) {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildChartSvg(points, hours) {
  if (!points || points.length < 2) {
    return '<div class="exch-chart__empty">Not enough data yet — check back in a few minutes.</div>';
  }
  const W = 820, H = 280, padL = 62, padR = 14, padT = 16, padB = 26;
  const xs = points.map((p) => new Date(p.at).getTime());
  const ys = points.map((p) => Number(p.price));
  const xMin = xs[0], xMax = xs[xs.length - 1];
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const yPad = (yMax - yMin) * 0.12;
  yMin -= yPad; yMax += yPad;

  const px = (x) => padL + ((x - xMin) / (xMax - xMin || 1)) * (W - padL - padR);
  const py = (y) => padT + (1 - (y - yMin) / (yMax - yMin || 1)) * (H - padT - padB);

  const line = points.map((p, i) => `${i ? "L" : "M"}${px(xs[i]).toFixed(1)} ${py(ys[i]).toFixed(1)}`).join(" ");
  const area = `${line} L${px(xMax).toFixed(1)} ${py(yMin).toFixed(1)} L${px(xMin).toFixed(1)} ${py(yMin).toFixed(1)} Z`;

  const up = ys[ys.length - 1] >= ys[0];
  const stroke = up ? "var(--positive, #22c55e)" : "var(--danger, #ef4444)";

  // horizontal gridlines + y labels (4 rows)
  let grid = "";
  for (let i = 0; i <= 3; i++) {
    const val = yMax - (i / 3) * (yMax - yMin);
    const y = py(val);
    grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="exch-chart__grid"/>`;
    grid += `<text x="${padL - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" class="exch-chart__ylab">$${val >= 1000 ? (val / 1000).toFixed(1) + "k" : val.toFixed(0)}</text>`;
  }
  const lastX = px(xMax), lastY = py(ys[ys.length - 1]);

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="exch-chart__svg" role="img" aria-label="Share price over time">
    <defs><linearGradient id="exchFill" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="${stroke}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${stroke}" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}
    <path d="${area}" fill="url(#exchFill)"/>
    <path d="${line}" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="4" fill="${stroke}"/>
    <text x="${padL}" y="${H - 8}" text-anchor="start" class="exch-chart__xlab">${fmtTime(xMin, hours)}</text>
    <text x="${W - padR}" y="${H - 8}" text-anchor="end" class="exch-chart__xlab">${fmtTime(xMax, hours)}</text>
  </svg>`;
}

function renderChart() {
  const plot = $("chartPlot");
  if (!plot) return;
  plot.innerHTML = buildChartSvg(chartPoints, chartHours);

  const lastEl = $("chartLast");
  const chgEl = $("chartChange");
  if (chartPoints.length >= 1) {
    const last = Number(chartPoints[chartPoints.length - 1].price);
    lastEl.textContent = money(last);
    if (chartPoints.length >= 2) {
      const first = Number(chartPoints[0].price);
      const diff = last - first;
      const pct = first !== 0 ? (diff / first) * 100 : 0;
      const up = diff >= 0;
      chgEl.textContent = `${up ? "▲" : "▼"} ${money(Math.abs(diff))} (${up ? "+" : "−"}${Math.abs(pct).toFixed(2)}%)`;
      chgEl.classList.toggle("is-up", up);
      chgEl.classList.toggle("is-down", !up);
    } else {
      chgEl.textContent = "";
    }
  }
}

async function loadChart() {
  if (!chartOpen) return;
  const { data, error } = await supabase.rpc("get_share_price_history", { p_hours: chartHours });
  if (error) { console.error("get_share_price_history failed:", error); return; }
  chartPoints = Array.isArray(data) ? data : [];
  renderChart();
}

$("chartToggle")?.addEventListener("click", async () => {
  chartOpen = !chartOpen;
  const card = $("chartCard");
  const btn = $("chartToggle");
  card.hidden = !chartOpen;
  btn.setAttribute("aria-expanded", String(chartOpen));
  btn.textContent = chartOpen ? "📈 Hide stock" : "📈 Show stock";
  if (chartOpen) {
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    await loadChart();
  }
});

for (const b of document.querySelectorAll(".exch-range__btn")) {
  b.addEventListener("click", async () => {
    chartHours = Number(b.dataset.hours);
    for (const o of document.querySelectorAll(".exch-range__btn")) o.classList.toggle("is-active", o === b);
    await loadChart();
  });
}

async function boot() {
  await ensurePlayerAuth();
  await loadMarket();
  pollTimer = setInterval(() => { loadMarket(); loadChart(); }, 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    } else if (!pollTimer) {
      loadMarket();
      loadChart();
      pollTimer = setInterval(() => { loadMarket(); loadChart(); }, 15000);
    }
  });
}

boot();
