import { ensurePlayerAuth } from "../src/backend/auth.js";
import {
  loadMarket,
  loadHoldings,
  tradeShares,
  loadGemShop,
  buyGem,
  revertedPrice
} from "../src/backend/cloudMarket.js";

import { mountShell } from "../src/ui/shell.js";
import { notify } from "../src/ui/toast.js";
import {
  rarityTier,
  rarityLabel,
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
const gemShop = document.getElementById("gemShop");


const state = { market: null, shares: 0, money: 0, gems: [] };


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

  renderPrice();

  notify.success(
    action === "buy" ? "Shares bought" : "Shares sold",
    `${formatCount(qty)} @ ${formatMoney(currentPrice())} · ${formatMoney(data.total)} total`
  );
}


mktBuy.addEventListener("click", () => trade("buy"));
mktSell.addEventListener("click", () => trade("sell"));


// =========================================================
// GEM SHOP
// =========================================================

function renderGemShop() {
  gemShop.innerHTML = state.gems
    .map((gem) => {
      const tier = rarityTier(gem.rarity);
      return `
        <article class="gemshop-card tier-${tier.id}">
          <div class="gemshop-card__head">
            <div class="gemshop-card__name">${escapeHtml(gem.name)}</div>
            <span class="badge badge--tier">${tier.name}</span>
          </div>
          <div class="gemshop-card__rarity">${rarityLabel(gem.rarity)}</div>
          <div class="gemshop-card__price">${formatMoney(gem.shop_price)}</div>
          <button class="btn btn--sm btn--block" data-buy="${escapeHtml(gem.name)}" type="button">Buy</button>
        </article>
      `;
    })
    .join("");

  for (const button of gemShop.querySelectorAll("[data-buy]")) {
    button.addEventListener("click", () => buyOneGem(button.dataset.buy, button));
  }
}


async function buyOneGem(name, button) {
  button.disabled = true;
  button.textContent = "Buying…";

  const { data, error } = await buyGem(name);

  button.disabled = false;
  button.textContent = "Buy";

  if (error) {
    notify.error("Could not buy", error.message);
    return;
  }

  state.money = Number(data.money);
  shell.setWallet(state.money);

  notify.success("Gem bought", `${name} for ${formatMoney(data.price)}`);
}


// =========================================================
// START
// =========================================================

async function start() {
  const user = await ensurePlayerAuth();

  if (!user) {
    notify.error("Sign-in failed", "The game could not reach your account.");
    return;
  }

  const [market, holdings, gems] = await Promise.all([
    loadMarket(),
    loadHoldings(),
    loadGemShop()
  ]);

  if (market) state.market = market;
  if (holdings) {
    state.shares = holdings.shares;
    state.money = holdings.money;
  }
  if (gems) state.gems = gems;

  renderPrice();
  renderGemShop();

  // The price drifts toward baseline over time, so keep the display live.
  setInterval(renderPrice, 5000);

  // Pick up other players' trades.
  setInterval(async () => {
    const fresh = await loadMarket();
    if (fresh) {
      state.market = fresh;
      renderPrice();
    }
  }, 20000);
}


start();
