import { ensurePlayerAuth } from "../src/backend/auth.js";
import { loadCloudGems, loadCloudPlayerState } from "../src/backend/cloudInventory.js";
import { loadCloudConsumables } from "../src/backend/cloudConsumables.js";
import {
  settleDueAuctions,
  settleDueMarketOrders,
  loadActiveAuctions,
  loadMyAuctions,
  createAuctionLot,
  buyAuction,
  cancelAuction,
  loadOpenOrders,
  loadMyOrders,
  createGemOrder,
  fulfillGemOrder,
  cancelGemOrder
} from "../src/backend/cloudAuctions.js";
import { isRelic } from "../src/data/enchants.js";
import { getGemMutation } from "../src/data/mutations.js";
import { getConsumableById } from "../src/data/consumables.js";
import { loadGemCatalog } from "../src/backend/gemCatalog.js";
import { saleFeeRate, orderFeeRate, feeAmount } from "./market-fees.js";

import { icons } from "../src/ui/icons.js";
import { notify } from "../src/ui/toast.js";
import { confirmDialog } from "../src/ui/dialog.js";
import { gemNameHtml } from "../src/ui/gemStyle.js";
import {
  rarityTier,
  rarityLabel,
  formatMoney,
  formatWeight,
  formatCount,
  escapeHtml
} from "../src/ui/format.js";


const shell = window.__shell;

document.getElementById("refreshIcon").innerHTML = icons.refresh;
document.getElementById("sellSearchIcon").innerHTML = icons.search;


// =========================================================
// STATE
// =========================================================

const state = {
  auctions: [],
  mine: [],
  orders: [],
  myOrders: [],
  gems: [],
  consumables: [],
  money: 0,
  userId: null,
  loading: true,
  lot: { gems: new Set(), potions: new Map() },
  tab: "browse"
};

const statusEl = document.getElementById("auctionStatus");
const browseList = document.getElementById("browseList");
const ordersList = document.getElementById("ordersList");
const myOrdersList = document.getElementById("myOrdersList");
const mineList = document.getElementById("mineList");
const refreshButton = document.getElementById("refreshButton");

const sellGemSearch = document.getElementById("sellGemSearch");
const sellGemList = document.getElementById("sellGemList");
const sellPotionList = document.getElementById("sellPotionList");
const lotCount = document.getElementById("lotCount");
const lotSummaryList = document.getElementById("lotSummaryList");
const sellPrice = document.getElementById("sellPrice");
const sellDuration = document.getElementById("sellDuration");
const listButton = document.getElementById("listButton");

const orderGem = document.getElementById("orderGem");
const orderPrice = document.getElementById("orderPrice");
const orderButton = document.getElementById("orderButton");
const orderFeePreview = document.getElementById("orderFeePreview");
const sellFeePreview = document.getElementById("sellFeePreview");
const watchGemButton = document.getElementById("watchGemButton");
const marketWatchlist = document.getElementById("marketWatchlist");
const WATCHLIST_KEY = "gemIncremental.market.watchlist";

function watches(){try{return JSON.parse(localStorage.getItem(WATCHLIST_KEY)||"[]");}catch{return [];}}
function saveWatches(value){try{localStorage.setItem(WATCHLIST_KEY,JSON.stringify(value.slice(0,12)));}catch{}}
function renderWatchlist(){if(!marketWatchlist)return;const list=watches();if(!list.length){marketWatchlist.innerHTML="<h2>Watchlist</h2><p>Watch a gem to see the best current buy order and the median live offer.</p>";return;}const rows=list.map(name=>{const prices=state.orders.filter(o=>o.status==="open"&&o.gem_name===name).map(o=>Number(o.price)).sort((a,b)=>a-b),median=prices.length?prices[Math.floor(prices.length/2)]:0,summary=prices.length?`Best ${formatMoney(prices.at(-1))} · Median ${formatMoney(median)}`:"No open orders";return `<div class="auction-line"><span>${escapeHtml(name)}</span><span>${summary}</span><button class="btn btn--sm" data-unwatch="${escapeHtml(name)}">Remove</button></div>`;}).join("");marketWatchlist.innerHTML=`<div><h2>Watchlist</h2><p>Live order-book benchmarks refresh with the market.</p></div>${rows}`;marketWatchlist.querySelectorAll("[data-unwatch]").forEach(button=>button.addEventListener("click",()=>{saveWatches(watches().filter(name=>name!==button.dataset.unwatch));renderWatchlist();}));}

function formatRate(rate) {
  return `${(rate * 100).toFixed(2).replace(/\.00$/, "")}%`;
}

function renderFeePreviews() {
  const order = Math.max(0, Math.floor(Number(orderPrice.value) || 0));
  const orderRate = orderFeeRate(order);
  const orderFee = feeAmount(order, orderRate);
  orderFeePreview.textContent = `Order fee: ${formatMoney(orderFee)} (${formatRate(orderRate)}). The fee is not refunded if the order is cancelled or expires.`;

  const sale = Math.max(0, Math.floor(Number(sellPrice.value) || 0));
  const hours = Number(sellDuration.value);
  const saleRate = saleFeeRate(sale, hours);
  const saleFee = feeAmount(sale, saleRate);
  sellFeePreview.textContent = `Fee when sold: ${formatMoney(saleFee)} (${formatRate(saleRate)}). You receive ${formatMoney(Math.max(0, sale - saleFee))}.`;
}


// =========================================================
// TABS
// =========================================================

const TABS = [
  { id: "browse", tab: "browseTab", section: "browseSection" },
  { id: "orders", tab: "ordersTab", section: "ordersSection" },
  { id: "sell", tab: "sellTab", section: "sellSection" },
  { id: "mine", tab: "mineTab", section: "mineSection" }
];

const TAB_KEY = "gemIncremental.market.tab";

function selectTab(active) {
  state.tab = active;
  try { localStorage.setItem(TAB_KEY, active); } catch { /* ignore */ }
  for (const entry of TABS) {
    const tab = document.getElementById(entry.tab);
    const section = document.getElementById(entry.section);
    const on = entry.id === active;
    tab.classList.toggle("active", on);
    tab.setAttribute("aria-selected", String(on));
    section.classList.toggle("hidden", !on);
  }
  if (active === "sell") renderSell();
  if (active === "orders") renderOrders();
  if (active === "mine") renderMine();
}

for (const entry of TABS) {
  document.getElementById(entry.tab).addEventListener("click", () => selectTab(entry.id));
}

// QoL: return to whichever tab you last used instead of always "Buy".
(function restoreTab() {
  let saved = null;
  try { saved = localStorage.getItem(TAB_KEY); } catch { /* ignore */ }
  if (saved && TABS.some((entry) => entry.id === saved) && saved !== "browse") {
    selectTab(saved);
  }
})();


// =========================================================
// GEM / LOT RENDERING
// =========================================================

function mutationsOf(gem) {
  const ids = Array.isArray(gem?.mutation_ids) && gem.mutation_ids.length
    ? gem.mutation_ids
    : (gem?.mutation_id ? [gem.mutation_id] : []);
  const multipliers = gem?.mutation_multipliers && typeof gem.mutation_multipliers === "object"
    ? gem.mutation_multipliers : {};
  return ids.map((id) => getGemMutation(id, multipliers[id] ?? null)).filter(Boolean);
}

function gemVisual(gem) {
  const tier = rarityTier(gem.rarity);
  const mutations = mutationsOf(gem);
  return `
    <div class="auction-gem tier-${tier.id}${mutations.map((m) => ` mutation-${m.id}`).join("")}">
      <div class="auction-gem__name">
        ${mutations.length ? mutations.map((m) => `<span class="mutation-inline mutation-inline--${escapeHtml(m.id)}">${escapeHtml(m.name)}</span>`).join(" ") + " " : ""}${gemNameHtml(gem.gem_name, escapeHtml)}
      </div>
      <div class="auction-gem__meta">
        <span class="badge badge--tier">${tier.name}</span>
        <span class="auction-gem__rarity">${rarityLabel(gem.rarity)}</span>
      </div>
      <div class="auction-gem__stats">
        <span>${formatWeight(gem.final_weight)}</span><span>·</span>
        <span>base value ${formatMoney(gem.value)}</span>
      </div>
    </div>`;
}

function potionName(consumableId) {
  return getConsumableById(consumableId)?.name ?? consumableId;
}

function lotVisual(auction) {
  const lot = Array.isArray(auction.lot) ? auction.lot : null;
  if (!lot) return auction.gem ? gemVisual(auction.gem) : "";

  const gemItems = lot.filter((item) => item.type !== "potion");
  const potionItems = lot.filter((item) => item.type === "potion");
  if (gemItems.length === 1 && potionItems.length === 0) return gemVisual(gemItems[0]);

  const count = Number(auction.item_count ?? lot.length);
  const gemRows = gemItems.map((gem) => {
    const tier = rarityTier(gem.rarity);
    const muts = mutationsOf(gem);
    return `<li class="lot-item tier-${tier.id}">
      <span class="lot-item__name">${muts.length ? muts.map((m) => escapeHtml(m.name)).join(" ") + " " : ""}${gemNameHtml(gem.gem_name, escapeHtml)}</span>
      <span class="lot-item__meta">${rarityLabel(gem.rarity)}</span></li>`;
  }).join("");
  const potionRows = potionItems.map((item) =>
    `<li class="lot-item lot-item--potion">
      <span class="lot-item__name">${icons.potion} ${escapeHtml(potionName(item.consumable_id))}</span>
      <span class="lot-item__meta">×${formatCount(item.quantity)}</span></li>`).join("");

  return `
    <div class="auction-lot">
      <div class="auction-lot__head">
        <span class="badge badge--accent">Bundle</span>
        <span class="auction-lot__count">${formatCount(count)} item${count === 1 ? "" : "s"}</span>
      </div>
      <ul class="auction-lot__list">${gemRows}${potionRows}</ul>
    </div>`;
}


// =========================================================
// COUNTDOWN TICKER
// =========================================================

function remainingText(endsAt) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "Ended";
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
        m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

let ticker = null;
function startTicker() {
  if (ticker) return;
  ticker = setInterval(() => {
    let anyEnded = false;
    for (const el of document.querySelectorAll(".js-countdown")) {
      const ends = el.dataset.ends;
      const text = remainingText(ends);
      el.textContent = text;
      if (text === "Ended") { el.classList.add("auction-timer--ended"); anyEnded = true; }
      else if (new Date(ends).getTime() - Date.now() < 60000) el.classList.add("auction-timer--soon");
    }
    if (anyEnded && state.tab === "browse") refresh();
  }, 1000);
}


// =========================================================
// BROWSE (buy now)
// =========================================================

function renderBrowse() {
  if (state.loading) return;
  const live = state.auctions.filter((a) => a.status === "active");
  if (live.length === 0) {
    browseList.innerHTML = `
      <div class="empty" style="grid-column:1/-1">${icons.gavel}
        <p class="empty__title">Nothing for sale right now</p>
        <p>List something from the “Sell” tab, or post an order under “Orders”.</p>
      </div>`;
    return;
  }
  browseList.innerHTML = live.map(browseCard).join("");
  for (const card of browseList.querySelectorAll(".auction-card")) wireBuyCard(card);
  startTicker();
}

function browseCard(auction) {
  const mine = auction.seller_id === state.userId;
  const price = Number(auction.start_price);
  const affordable = state.money >= price;
  return `
    <article class="card auction-card" data-id="${auction.id}" data-price="${price}">
      ${lotVisual(auction)}
      <div class="auction-card__body">
        <div class="auction-line">
          <span class="auction-line__key">Seller</span>
          <span class="auction-line__val">${escapeHtml(auction.seller_name ?? "Unknown")}</span>
        </div>
        <div class="auction-line">
          <span class="auction-line__key">Price</span>
          <span class="auction-line__val auction-line__val--money">${formatMoney(price)}</span>
        </div>
        <div class="auction-line">
          <span class="auction-line__key">Ends in</span>
          <span class="auction-line__val auction-timer js-countdown" data-ends="${auction.ends_at}">${remainingText(auction.ends_at)}</span>
        </div>
      </div>
      ${
        mine
          ? '<div class="auction-card__note">This is your listing.</div>'
          : `<button class="btn btn--primary btn--block auction-buy" type="button" ${affordable ? "" : "disabled"}>
               ${affordable ? `Buy now · ${formatMoney(price)}` : "Not enough money"}
             </button>`
      }
    </article>`;
}

function wireBuyCard(card) {
  const id = Number(card.dataset.id);
  const price = Number(card.dataset.price);
  const button = card.querySelector(".auction-buy");
  if (!button) return;

  button.addEventListener("click", async () => {
    const choice = await confirmDialog({
      title: "Buy this listing?",
      body: `<p>This buys the lot outright for <strong>${escapeHtml(formatMoney(price))}</strong>.</p>`,
      confirmLabel: `Buy for ${formatMoney(price)}`
    });
    if (choice !== "confirm") return;

    button.disabled = true;
    const { data, error } = await buyAuction(id);
    if (error) {
      notify.error("Could not buy", error.message);
      button.disabled = false;
      if (["auction_closed", "auction_not_found"].includes(error.code)) refresh();
      return;
    }
    if (data?.money != null) { state.money = Number(data.money); shell?.setWallet(state.money); }
    notify.success("Purchased", `You bought the lot for ${formatMoney(price)}.`);
    await refresh();
  });
}


// =========================================================
// ORDERS (buy order book)
// =========================================================

function matchingGemsFor(gemName) {
  return state.gems
    .filter((g) => !g.locked && g.gem_name === gemName)
    .sort((a, b) => Number(a.value) - Number(b.value));
}

function populateOrderGemSelect() {
  if (orderGem.dataset.filled) return;
  const names = [...new Set(state.catalogNames ?? [])].sort((a, b) => a.localeCompare(b));
  orderGem.innerHTML = names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
  orderGem.dataset.filled = "1";
}

function renderOrders() {
  if (state.loading) return;
  populateOrderGemSelect();
  renderWatchlist();

  const open = state.orders.filter((o) => o.status === "open");
  if (open.length === 0) {
    ordersList.innerHTML = `
      <div class="empty" style="grid-column:1/-1">${icons.gavel}
        <p class="empty__title">No open orders</p>
        <p>Post one above — name a gem and what you’ll pay for it.</p>
      </div>`;
    return;
  }

  ordersList.innerHTML = open.map(orderCard).join("");
  for (const card of ordersList.querySelectorAll(".order-card")) wireOrderCard(card);
}

watchGemButton?.addEventListener("click",()=>{const name=orderGem.value;if(!name)return;const list=watches();if(!list.includes(name))saveWatches([...list,name]);renderWatchlist();notify.success("Added to watchlist",`${name} will show its current order-book prices here.`);});

function orderCard(order) {
  const mine = order.buyer_id === state.userId;
  const matches = matchingGemsFor(order.gem_name);
  const canFill = !mine && matches.length > 0;
  const cheapest = matches[0];

  return `
    <article class="card auction-card order-card" data-id="${order.id}" data-gemname="${escapeHtml(order.gem_name)}">
      <div class="auction-gem">
        <div class="auction-gem__name">${gemNameHtml(order.gem_name, escapeHtml)}</div>
        <div class="auction-gem__meta"><span class="badge badge--accent">Wanted</span></div>
      </div>
      <div class="auction-card__body">
        <div class="auction-line">
          <span class="auction-line__key">Buyer</span>
          <span class="auction-line__val">${escapeHtml(order.buyer_name ?? "Unknown")}</span>
        </div>
        <div class="auction-line">
          <span class="auction-line__key">Pays</span>
          <span class="auction-line__val auction-line__val--money">${formatMoney(order.price)}</span>
        </div>
        <div class="auction-line">
          <span class="auction-line__key">Expires</span>
          <span class="auction-line__val js-countdown" data-ends="${new Date(new Date(order.created_at).getTime() + 3 * 86400000).toISOString()}">${remainingText(new Date(new Date(order.created_at).getTime() + 3 * 86400000).toISOString())}</span>
        </div>
      </div>
      ${
        mine
          ? '<div class="auction-card__note">This is your order.</div>'
          : canFill
          ? `<button class="btn btn--primary btn--block order-fill" type="button" data-gem="${cheapest.id}">
               Sell your ${escapeHtml(order.gem_name)} · ${formatMoney(order.price)}
             </button>
             <div class="auction-bid__hint">Gives your ${escapeHtml(formatWeight(cheapest.final_weight))} one (worth ${escapeHtml(formatMoney(cheapest.value))})</div>`
          : `<div class="auction-card__note">You have no unlocked ${escapeHtml(order.gem_name)}.</div>`
      }
    </article>`;
}

function wireOrderCard(card) {
  const orderId = Number(card.dataset.id);
  const gemName = card.dataset.gemname;
  const button = card.querySelector(".order-fill");
  if (!button) return;

  button.addEventListener("click", async () => {
    const gemId = Number(button.dataset.gem);
    const gem = state.gems.find((g) => g.id === gemId);
    const order = state.orders.find((o) => o.id === orderId);
    if (!gem || !order) return;

    const choice = await confirmDialog({
      title: `Sell your ${gemName}?`,
      body: `<p>Give your <strong>${escapeHtml(gemName)}</strong>
        (${escapeHtml(formatWeight(gem.final_weight))}, worth ${escapeHtml(formatMoney(gem.value))})
        for <strong>${escapeHtml(formatMoney(order.price))}</strong>.</p>`,
      confirmLabel: `Sell for ${formatMoney(order.price)}`
    });
    if (choice !== "confirm") return;

    button.disabled = true;
    const { data, error } = await fulfillGemOrder(orderId, gemId);
    if (error) {
      notify.error("Could not fill order", error.message);
      button.disabled = false;
      refresh();
      return;
    }
    if (data?.money != null) { state.money = Number(data.money); shell?.setWallet(state.money); }
    notify.success("Order filled", `You sold a ${gemName} for ${formatMoney(order.price)}.`);
    await refresh();
  });
}

orderButton.addEventListener("click", async () => {
  const gemName = orderGem.value;
  const price = Math.floor(Number(orderPrice.value));
  if (!gemName) { notify.error("Pick a gem", "Choose which gem to order."); return; }
  if (!Number.isFinite(price) || price < 1) { notify.error("Invalid price", "Enter at least $1."); return; }
  const feeRate = orderFeeRate(price);
  const fee = feeAmount(price, feeRate);
  const total = price + fee;
  if (total > state.money) { notify.error("Not enough money", `The offer and fee cost ${formatMoney(total)}. You have ${formatMoney(state.money)}.`); return; }

  const choice = await confirmDialog({
    title: `Order a ${gemName}?`,
    body: `<p><strong>Offer:</strong> ${escapeHtml(formatMoney(price))}</p>
      <p><strong>Order fee:</strong> ${escapeHtml(formatMoney(fee))} (${escapeHtml(formatRate(feeRate))})</p>
      <p><strong>Charged now:</strong> ${escapeHtml(formatMoney(total))}</p>
      <p style="margin-top:10px">Cancelling or expiring refunds the ${escapeHtml(formatMoney(price))} offer. The order fee is not refunded.</p>`,
    confirmLabel: "Post order"
  });
  if (choice !== "confirm") return;

  orderButton.disabled = true;
  const { error } = await createGemOrder(gemName, price);
  orderButton.disabled = false;
  if (error) { notify.error("Could not post order", error.message); return; }
  notify.success("Order posted", `Offering ${formatMoney(price)} for a ${gemName}.`);
  await refresh();
});


// =========================================================
// SELL — lot builder
// =========================================================

function availableGems() {
  const query = sellGemSearch.value.trim().toLowerCase();
  return state.gems
    .filter((gem) => !gem.locked)
    .filter((gem) => !query || gem.gem_name.toLowerCase().includes(query))
    .sort((a, b) => Number(b.rarity) - Number(a.rarity));
}

function ownedPotions() {
  return state.consumables
    .map((row) => ({ row, def: getConsumableById(row.consumable_id) }))
    .filter((entry) => entry.def && Number(entry.row.quantity) > 0)
    .sort((a, b) => a.def.family.localeCompare(b.def.family) || a.def.tier - b.def.tier);
}

function lotItemCount() {
  let total = state.lot.gems.size;
  for (const qty of state.lot.potions.values()) total += qty;
  return total;
}

function renderSell() {
  renderGemChecklist();
  renderPotionChecklist();
  renderLotSummary();
  renderFeePreviews();
}

function renderGemChecklist() {
  const list = availableGems();
  const unlockedTotal = state.gems.filter((g) => !g.locked).length;
  if (unlockedTotal === 0) {
    sellGemList.innerHTML = `<p class="lot-picker__empty">No unlocked gems. Unlock or roll some first.</p>`;
    return;
  }
  if (list.length === 0) {
    sellGemList.innerHTML = `<p class="lot-picker__empty">Nothing matches your search.</p>`;
    return;
  }
  sellGemList.innerHTML = list.map((gem) => {
    const checked = state.lot.gems.has(gem.id);
    const muts = mutationsOf(gem);
    const meta = isRelic(gem) ? "Relic" : `${rarityLabel(gem.rarity)} · ${formatMoney(gem.value)}`;
    return `
      <label class="lot-option${checked ? " lot-option--on" : ""}">
        <input type="checkbox" data-gem="${gem.id}" ${checked ? "checked" : ""}>
        <span class="lot-option__body">
          <span class="lot-option__name">${muts.length ? muts.map((m) => escapeHtml(m.name)).join(" ") + " " : ""}${gemNameHtml(gem.gem_name, escapeHtml)}</span>
          <span class="lot-option__meta">${escapeHtml(meta)}</span>
        </span>
      </label>`;
  }).join("");
}

function renderPotionChecklist() {
  const potions = ownedPotions();
  if (potions.length === 0) {
    sellPotionList.innerHTML = `<p class="lot-picker__empty">No potions to sell.</p>`;
    return;
  }
  sellPotionList.innerHTML = potions.map(({ row, def }) => {
    const owned = Number(row.quantity);
    const qty = state.lot.potions.get(def.id) ?? 0;
    return `
      <div class="lot-option lot-option--potion${qty ? " lot-option--on" : ""}">
        <span class="lot-option__body">
          <span class="lot-option__name">${icons.potion} ${escapeHtml(def.name)}</span>
          <span class="lot-option__meta">You own ${formatCount(owned)}</span>
        </span>
        <input class="lot-qty" type="number" min="0" max="${owned}" step="1" value="${qty}" data-potion="${escapeHtml(def.id)}" aria-label="Quantity of ${escapeHtml(def.name)}">
      </div>`;
  }).join("");
}

function renderLotSummary() {
  const count = lotItemCount();
  lotCount.textContent = `${formatCount(count)} item${count === 1 ? "" : "s"}`;
  const gemChips = [...state.lot.gems].map((id) => {
    const gem = state.gems.find((g) => g.id === id);
    if (!gem) return "";
    return `<span class="lot-chip">${gemNameHtml(gem.gem_name, escapeHtml)} <button type="button" data-remove-gem="${id}" aria-label="Remove">×</button></span>`;
  }).join("");
  const potionChips = [...state.lot.potions].map(([cid, qty]) =>
    `<span class="lot-chip">${escapeHtml(potionName(cid))} ×${formatCount(qty)} <button type="button" data-remove-potion="${escapeHtml(cid)}" aria-label="Remove">×</button></span>`
  ).join("");
  lotSummaryList.innerHTML = count === 0
    ? `<p class="lot-picker__empty">Pick gems or potions above to build your lot.</p>`
    : gemChips + potionChips;
  listButton.disabled = count === 0;
}

sellGemSearch.addEventListener("input", renderGemChecklist);
orderPrice.addEventListener("input", renderFeePreviews);
sellPrice.addEventListener("input", renderFeePreviews);
sellDuration.addEventListener("change", renderFeePreviews);
sellGemList.addEventListener("change", (event) => {
  const box = event.target.closest("[data-gem]");
  if (!box) return;
  const id = Number(box.dataset.gem);
  if (box.checked) state.lot.gems.add(id); else state.lot.gems.delete(id);
  box.closest(".lot-option")?.classList.toggle("lot-option--on", box.checked);
  renderLotSummary();
});
sellPotionList.addEventListener("input", (event) => {
  const input = event.target.closest("[data-potion]");
  if (!input) return;
  const cid = input.dataset.potion;
  const qty = Math.max(0, Math.min(Number(input.max), Math.floor(Number(input.value) || 0)));
  if (qty === 0) state.lot.potions.delete(cid); else state.lot.potions.set(cid, qty);
  input.closest(".lot-option")?.classList.toggle("lot-option--on", qty > 0);
  renderLotSummary();
});
lotSummaryList.addEventListener("click", (event) => {
  const rg = event.target.closest("[data-remove-gem]");
  const rp = event.target.closest("[data-remove-potion]");
  if (rg) { state.lot.gems.delete(Number(rg.dataset.removeGem)); renderSell(); }
  else if (rp) { state.lot.potions.delete(rp.dataset.removePotion); renderSell(); }
});

listButton.addEventListener("click", async () => {
  const count = lotItemCount();
  if (count === 0) return;
  const price = Math.floor(Number(sellPrice.value));
  const hours = Number(sellDuration.value);
  if (!Number.isFinite(price) || price < 1) { notify.error("Invalid price", "Enter at least $1."); return; }
  const feeRate = saleFeeRate(price, hours);
  const fee = feeAmount(price, feeRate);
  const proceeds = price - fee;

  const items = [
    ...[...state.lot.gems].map((id) => ({ type: "gem", id })),
    ...[...state.lot.potions].map(([cid, qty]) => ({ type: "potion", consumableId: cid, quantity: qty }))
  ];
  const summary = [
    ...[...state.lot.gems].map((id) => state.gems.find((g) => g.id === id)?.gem_name).filter(Boolean),
    ...[...state.lot.potions].map(([cid, qty]) => `${qty}× ${potionName(cid)}`)
  ];

  const choice = await confirmDialog({
    title: count === 1 ? "List this item for sale?" : `List a bundle of ${count} items?`,
    body: `
      <p>Buy-now price <strong>${escapeHtml(formatMoney(price))}</strong>, listed for
      <strong>${hours} hour${hours === 1 ? "" : "s"}</strong>.</p>
      <p style="margin-top:10px"><strong>Fee if sold:</strong> ${escapeHtml(formatMoney(fee))} (${escapeHtml(formatRate(feeRate))})<br>
      <strong>You receive:</strong> ${escapeHtml(formatMoney(proceeds))}</p>
      <p style="margin-top:10px"><strong>Lot:</strong> ${escapeHtml(summary.join(", "))}</p>
      <p style="margin-top:10px">It leaves your inventory while listed and returns if nobody buys it.</p>`,
    confirmLabel: "List it"
  });
  if (choice !== "confirm") return;

  listButton.disabled = true;
  const { error } = await createAuctionLot(items, price, hours);
  if (error) { notify.error("Could not list", error.message); listButton.disabled = false; return; }

  state.lot = { gems: new Set(), potions: new Map() };
  notify.success("Listed", count === 1 ? "Your item is up for sale." : `Your bundle of ${count} items is up for sale.`);
  await refresh();
  selectTab("mine");
});


// =========================================================
// MINE (my listings + my orders)
// =========================================================

const STATUS_LABELS = {
  active: "Active", sold: "Sold", returned: "Unsold — returned", cancelled: "Cancelled"
};
const ORDER_STATUS_LABELS = { open: "Open", filled: "Filled", cancelled: "Cancelled", expired: "Expired — refunded" };

function renderMine() {
  if (state.loading) return;

  mineList.innerHTML = state.mine.length
    ? state.mine.map(mineCard).join("")
    : `<div class="empty" style="grid-column:1/-1">${icons.gavel}<p class="empty__title">No listings</p><p>List something from the “Sell” tab.</p></div>`;
  for (const card of mineList.querySelectorAll(".auction-card")) {
    const id = Number(card.dataset.id);
    card.querySelector('[data-action="cancel"]')?.addEventListener("click", async () => {
      const choice = await confirmDialog({
        title: "Cancel this listing?",
        body: `<p>The lot returns to your inventory.</p>`,
        confirmLabel: "Cancel listing", cancelLabel: "Keep it", tone: "danger"
      });
      if (choice !== "confirm") return;
      const { error } = await cancelAuction(id);
      if (error) { notify.error("Could not cancel", error.message); return; }
      notify.success("Listing cancelled", "The lot is back in your inventory.");
      await refresh();
    });
  }

  const openOrFilled = state.myOrders;
  myOrdersList.innerHTML = openOrFilled.length
    ? openOrFilled.map(myOrderCard).join("")
    : `<div class="empty" style="grid-column:1/-1"><p class="empty__title">No orders</p><p>Post a buy order from the “Orders” tab.</p></div>`;
  for (const card of myOrdersList.querySelectorAll(".auction-card")) {
    const id = Number(card.dataset.id);
    card.querySelector('[data-action="cancel-order"]')?.addEventListener("click", async () => {
      const choice = await confirmDialog({
        title: "Cancel this order?",
        body: `<p>Your held money is refunded.</p>`,
        confirmLabel: "Cancel order", cancelLabel: "Keep it", tone: "danger"
      });
      if (choice !== "confirm") return;
      const { data, error } = await cancelGemOrder(id);
      if (error) { notify.error("Could not cancel", error.message); return; }
      if (data?.money != null) { state.money = Number(data.money); shell?.setWallet(state.money); }
      notify.success("Order cancelled", "Your money was refunded.");
      await refresh();
    });
  }
}

function mineCard(auction) {
  const active = auction.status === "active";
  return `
    <article class="card auction-card auction-card--mine" data-id="${auction.id}">
      ${lotVisual(auction)}
      <div class="auction-card__body">
        <div class="auction-line">
          <span class="auction-line__key">Status</span>
          <span class="auction-line__val auction-status auction-status--${auction.status}">${STATUS_LABELS[auction.status] ?? auction.status}</span>
        </div>
        <div class="auction-line">
          <span class="auction-line__key">${auction.status === "sold" ? "Sold for" : "Price"}</span>
          <span class="auction-line__val auction-line__val--money">${formatMoney(auction.start_price)}</span>
        </div>
        ${auction.status === "sold" && auction.current_bidder_name ? `<div class="auction-line"><span class="auction-line__key">Buyer</span><span class="auction-line__val">${escapeHtml(auction.current_bidder_name)}</span></div>` : ""}
        ${active ? `<div class="auction-line"><span class="auction-line__key">Ends in</span><span class="auction-line__val auction-timer js-countdown" data-ends="${auction.ends_at}">${remainingText(auction.ends_at)}</span></div>` : ""}
      </div>
      ${active ? '<button class="btn btn--danger btn--sm btn--block" data-action="cancel" type="button">Cancel listing</button>' : ""}
    </article>`;
}

function myOrderCard(order) {
  const open = order.status === "open";
  return `
    <article class="card auction-card auction-card--mine" data-id="${order.id}">
      <div class="auction-gem">
        <div class="auction-gem__name">${gemNameHtml(order.gem_name, escapeHtml)}</div>
        <div class="auction-gem__meta"><span class="badge badge--accent">Order</span></div>
      </div>
      <div class="auction-card__body">
        <div class="auction-line">
          <span class="auction-line__key">Status</span>
          <span class="auction-line__val auction-status auction-status--${order.status === "filled" ? "sold" : order.status === "open" ? "active" : "cancelled"}">${ORDER_STATUS_LABELS[order.status] ?? order.status}</span>
        </div>
        <div class="auction-line">
          <span class="auction-line__key">${order.status === "filled" ? "Paid" : "Offering"}</span>
          <span class="auction-line__val auction-line__val--money">${formatMoney(order.price)}</span>
        </div>
        ${order.status === "filled" && order.filled_by_name ? `<div class="auction-line"><span class="auction-line__key">Filled by</span><span class="auction-line__val">${escapeHtml(order.filled_by_name)}</span></div>` : ""}
      </div>
      ${open ? '<button class="btn btn--danger btn--sm btn--block" data-action="cancel-order" type="button">Cancel order</button>' : ""}
    </article>`;
}


// =========================================================
// LOAD
// =========================================================

function pruneLot() {
  for (const id of [...state.lot.gems]) {
    const gem = state.gems.find((g) => g.id === id);
    if (!gem || gem.locked) state.lot.gems.delete(id);
  }
  for (const [cid, qty] of [...state.lot.potions]) {
    const owned = Number(state.consumables.find((r) => r.consumable_id === cid)?.quantity ?? 0);
    if (owned <= 0) state.lot.potions.delete(cid);
    else if (qty > owned) state.lot.potions.set(cid, owned);
  }
}

async function refresh() {
  const [auctions, mine, orders, myOrders, gems_, playerState, consumables, catalog] = await Promise.all([
    loadActiveAuctions(), loadMyAuctions(), loadOpenOrders(), loadMyOrders(),
    loadCloudGems(), loadCloudPlayerState(), loadCloudConsumables(),
    loadGemCatalog().catch(() => [])
  ]);

  state.loading = false;
  // Live gem catalog drives the buy-order picker (so custom gems are orderable).
  state.catalogNames = (catalog ?? []).map((g) => g.name);
  state.auctions = auctions;
  state.mine = mine;
  state.orders = orders;
  state.myOrders = myOrders;
  state.gems = Array.isArray(gems_) ? gems_ : [];
  state.consumables = Array.isArray(consumables) ? consumables : [];
  pruneLot();

  if (playerState) { state.money = Number(playerState.money); shell?.setWallet(state.money); }

  statusEl.textContent =
    `${formatCount(state.auctions.length)} listing${state.auctions.length === 1 ? "" : "s"} · ` +
    `${formatCount(state.orders.filter((o) => o.status === "open").length)} open order${state.orders.filter((o) => o.status === "open").length === 1 ? "" : "s"}`;

  renderBrowse();
  renderWatchlist();
  if (state.tab === "orders") renderOrders();
  else if (state.tab === "sell") renderSell();
  else if (state.tab === "mine") renderMine();
}

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  await Promise.all([settleDueAuctions(), settleDueMarketOrders()]);
  await refresh();
  refreshButton.disabled = false;
});

window.addEventListener("pageshow", (event) => { if (event.persisted) refresh(); });

async function boot() {
  const user = await ensurePlayerAuth();
  if (!user) {
    state.loading = false;
    statusEl.textContent = "Could not sign you in. Refresh to try again.";
    browseList.innerHTML = "";
    return;
  }
  state.userId = user.id;
  await Promise.all([settleDueAuctions(), settleDueMarketOrders()]);
  await refresh();
}

boot();
