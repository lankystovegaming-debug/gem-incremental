import { ensurePlayerAuth } from "../src/backend/auth.js";
import {
  loadMarket,
  loadHoldings,
  loadHistory,
  loadTrades,
  tradeShares,
  revertedPrice
} from "../src/backend/cloudMarket.js";

import { mountShell } from "../src/ui/shell.js";
import { notify } from "../src/ui/toast.js";
import {
  formatMoney,
  formatCount,
  escapeHtml
} from "../src/ui/format.js";


const shell = mountShell({ page: "market", base: "../" });

const mktPrice = document.getElementById("mktPrice");
const mktDelta = document.getElementById("mktDelta");
const mktChart = document.getElementById("mktChart");
const mktShares = document.getElementById("mktShares");
const mktValue = document.getElementById("mktValue");
const mktQty = document.getElementById("mktQty");
const mktBuy = document.getElementById("mktBuy");
const mktSell = document.getElementById("mktSell");
const mktStatus = document.getElementById("mktStatus");
const mktFeed = document.getElementById("mktFeed");
const mktRanges = document.getElementById("mktRanges");


// Chart ranges. Each selection fetches only the requested look-back window.
const RANGES = [
  { id: "1m", label: "1m", ms: 60 * 1000 },
  { id: "5m", label: "5m", ms: 5 * 60 * 1000 },
  { id: "1h", label: "1h", ms: 60 * 60 * 1000 },
  { id: "24h", label: "24h", ms: 24 * 60 * 60 * 1000 }
];

const state = {
  market: null,
  shares: 0,
  money: 0,
  trades: [],
  range: "1h",
  series: [] // [{ price, at }] for the selected range
};


function currentPrice() {
  return state.market
    ? revertedPrice(state.market.price, state.market.updatedAt)
    : 0;
}


function currentRange() {
  return RANGES.find((range) => range.id === state.range) ?? RANGES[2];
}


function renderRanges() {
  mktRanges.innerHTML = RANGES.map(
    (r) => `
      <button
        class="mkt-range${r.id === state.range ? " is-active" : ""}"
        type="button"
        role="tab"
        aria-selected="${r.id === state.range}"
        data-range="${r.id}"
      >${r.label}</button>
    `
  ).join("");

  for (const button of mktRanges.querySelectorAll("[data-range]")) {
    button.addEventListener("click", () => selectRange(button.dataset.range));
  }
}


async function selectRange(id) {
  if (id === state.range) return;
  state.range = id;
  renderRanges();
  await refreshSeries();
}


async function refreshSeries() {
  const range = currentRange();
  const rangeId = state.range;
  const series = await loadHistory(range.ms);

  // Ignore an older request that finishes after the player chose another range.
  if (state.range !== rangeId) return;

  state.series = series;
  renderPrice();
}


function renderPrice() {
  const price = currentPrice();
  mktPrice.textContent = formatMoney(price);

  const first = state.series[0]?.price;
  if (first != null && first > 0) {
    const pct = ((price - first) / first) * 100;
    mktDelta.textContent = `${price >= first ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%`;
    mktDelta.className = "mkt-price__delta " + (price >= first ? "is-up" : "is-down");
  } else {
    mktDelta.textContent = "";
  }

  mktShares.textContent = formatCount(state.shares);
  mktValue.textContent =
    state.shares > 0 ? `worth ~${formatMoney(state.shares * price)}` : "";

  shell.setWallet(state.money);
  renderChart();
}


function renderChart() {
  const now = Date.now();
  const hist = [
    ...state.series,
    { price: currentPrice(), at: new Date(now).toISOString() }
  ];

  if (hist.length < 2) {
    mktChart.innerHTML =
      `<text x="300" y="64" text-anchor="middle" fill="var(--text-faint)" ` +
      `font-size="13">No trades in this range yet</text>`;
    return;
  }

  const prices = hist.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const priceRange = max - min || 1;
  const W = 600;
  const H = 120;
  const pad = 8;
  const range = currentRange();
  const oldestPoint = Math.min(...hist.map((point) => new Date(point.at).getTime()));
  const start = range.ms ? now - range.ms : oldestPoint;
  const timeRange = Math.max(1, now - start);

  const points = hist
    .map((point) => {
      const at = new Date(point.at).getTime();
      const x = pad + Math.max(0, Math.min(1, (at - start) / timeRange)) * (W - 2 * pad);
      const y = H - pad - ((point.price - min) / priceRange) * (H - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const up = hist[hist.length - 1].price >= hist[0].price;
  const color = up ? "var(--positive)" : "var(--negative)";

  mktChart.innerHTML =
    `<polyline fill="none" stroke="${color}" stroke-width="2" ` +
    `stroke-linejoin="round" stroke-linecap="round" points="${points}" />`;
}


function timeAgo(iso) {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}


function renderFeed() {
  if (!state.trades.length) {
    mktFeed.innerHTML = `<li class="mkt-feed__empty">No trades yet.</li>`;
    return;
  }

  mktFeed.innerHTML = state.trades
    .map((t) => {
      const buy = t.action === "buy";
      return `
        <li class="mkt-feed__row">
          <span class="mkt-feed__who">${escapeHtml(t.username)}</span>
          <span class="mkt-feed__act ${buy ? "is-buy" : "is-sell"}">${buy ? "bought" : "sold"}</span>
          <span class="mkt-feed__qty">${formatCount(t.qty)}</span>
          <span class="mkt-feed__at">@ ${formatMoney(t.price)}</span>
          <span class="mkt-feed__time">${timeAgo(t.at)}</span>
        </li>
      `;
    })
    .join("");
}


async function refreshFeed() {
  const trades = await loadTrades();
  state.trades = trades;
  renderFeed();
}


async function trade(action) {
  const qty = Math.max(1, Math.min(10000, Math.floor(Number(mktQty.value) || 0)));

  mktBuy.disabled = true;
  mktSell.disabled = true;

  const { data, error } = await tradeShares(action, qty);

  mktBuy.disabled = false;
  mktSell.disabled = false;

  if (error) {
    mktStatus.classList.add("error");
    mktStatus.textContent = error.message;
    notify.error("Trade failed", error.message);
    return;
  }

  mktStatus.classList.remove("error");
  mktStatus.textContent = "";

  state.shares = Number(data.shares);
  state.money = Number(data.money);

  const market = await loadMarket();
  if (market) state.market = market;

  await Promise.all([refreshSeries(), refreshFeed()]);

  notify.success(
    action === "buy" ? "Shares bought" : "Shares sold",
    `${formatCount(qty)} @ ${formatMoney(currentPrice())} · ${formatMoney(data.total)} total`
  );
}


mktBuy.addEventListener("click", () => trade("buy"));
mktSell.addEventListener("click", () => trade("sell"));


// =========================================================
// START
// =========================================================

async function start() {
  const user = await ensurePlayerAuth();

  if (!user) {
    notify.error("Sign-in failed", "The game could not reach your account.");
    return;
  }

  const [market, holdings, trades, series] = await Promise.all([
    loadMarket(),
    loadHoldings(),
    loadTrades(),
    loadHistory(currentRange().ms)
  ]);

  if (market) state.market = market;
  if (holdings) {
    state.shares = holdings.shares;
    state.money = holdings.money;
  }
  state.trades = trades;
  state.series = series;

  renderRanges();
  renderPrice();
  renderFeed();

  // The price drifts toward baseline over time, so keep the display live.
  setInterval(renderPrice, 5000);

  // Pick up other players' trades.
  setInterval(async () => {
    const rangeId = state.range;
    const [fresh, series] = await Promise.all([
      loadMarket(),
      loadHistory(currentRange().ms)
    ]);
    if (fresh) {
      state.market = fresh;
    }
    if (state.range === rangeId) state.series = series;
    renderPrice();
    void refreshFeed();
  }, 20000);
}


start();
