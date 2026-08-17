import { ensurePlayerAuth } from "../src/backend/auth.js";
import {
  loadMarket,
  loadHoldings,
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


const state = { market: null, shares: 0, money: 0, trades: [] };


function currentPrice() {
  return state.market
    ? revertedPrice(state.market.price, state.market.updatedAt)
    : 0;
}


function renderPrice() {
  const price = currentPrice();
  mktPrice.textContent = formatMoney(price);

  const hist = state.market?.history ?? [];
  if (hist.length > 0) {
    const first = hist[0];
    const pct = first ? ((price - first) / first) * 100 : 0;
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
  const hist = (state.market?.history ?? []).slice();
  hist.push(currentPrice());

  if (hist.length < 2) {
    mktChart.innerHTML = "";
    return;
  }

  const min = Math.min(...hist);
  const max = Math.max(...hist);
  const range = max - min || 1;
  const W = 600;
  const H = 120;
  const pad = 8;

  const points = hist
    .map((value, i) => {
      const x = (i / (hist.length - 1)) * W;
      const y = H - pad - ((value - min) / range) * (H - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const up = hist[hist.length - 1] >= hist[0];
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
  const qty = Math.max(1, Math.min(100000, Math.floor(Number(mktQty.value) || 0)));

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

  renderPrice();
  refreshFeed();

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

  const [market, holdings, trades] = await Promise.all([
    loadMarket(),
    loadHoldings(),
    loadTrades()
  ]);

  if (market) state.market = market;
  if (holdings) {
    state.shares = holdings.shares;
    state.money = holdings.money;
  }
  state.trades = trades;

  renderPrice();
  renderFeed();

  // The price drifts toward baseline over time, so keep the display live.
  setInterval(renderPrice, 5000);

  // Pick up other players' trades.
  setInterval(async () => {
    const fresh = await loadMarket();
    if (fresh) {
      state.market = fresh;
      renderPrice();
    }
    refreshFeed();
  }, 20000);
}


start();
