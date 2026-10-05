import {
  ensurePlayerAuth,
  isSignInRequired,
  SIGN_IN_REQUIRED_MESSAGE
} from "../src/backend/auth.js";
import { loadCloudGems, loadCloudPlayerState } from "../src/backend/cloudInventory.js";
import { loadCloudConsumables } from "../src/backend/cloudConsumables.js";
import {
  settleDueAuctions,
  loadActiveAuctions,
  loadMyAuctions,
  createAuctionLot,
  placeBid,
  cancelAuction,
  getBlackMarketStatus,
  loadActiveBlackMarketListings,
  loadMyBlackMarketListings,
  createBlackMarketListing,
  buyBlackMarketListing,
  cancelBlackMarketListing
} from "../src/backend/cloudAuctions.js";
import { isRelic } from "../src/data/enchants.js";
import { getGemMutation } from "../src/data/mutations.js";
import { getConsumableById } from "../src/data/consumables.js";
import { listingFeeRate, feeAmount, marginalSellerTax } from "./market-fees.js";

import { icons } from "../src/ui/icons.js";
import { notify } from "../src/ui/toast.js";
import { confirmDialog } from "../src/ui/dialog.js";
import { gemNameHtml } from "../src/ui/gemStyle.js";
import {
  rarityTier,
  rarityLabel,
  formatMoney as formatBaseMoney,
  formatWeight,
  formatCount,
  escapeHtml
} from "../src/ui/format.js";


const shell = window.__shell;

function formatMoney(value) {
  const amount = Math.abs(Number(value) || 0);
  return formatBaseMoney(value, { decimalPlaces: amount > 0 && amount < 1 ? 4 : 2 });
}

document.getElementById("refreshIcon").innerHTML = icons.refresh;
document.getElementById("sellSearchIcon").innerHTML = icons.search;


// =========================================================
// STATE
// =========================================================

const state = {
  auctions: [],
  mine: [],
  blackMarketListings: [],
  myBlackMarketListings: [],
  blackMarketStatus: { open: false, opensAt: null, closesAt: null },
  gems: [],
  consumables: [],
  money: 0,
  userId: null,
  loading: true,
  lot: { gems: new Set(), potions: new Map() },
  tab: "browse",
  browseMode: "auction",
  saleMethod: "auction"
};

const statusEl = document.getElementById("auctionStatus");
const browseList = document.getElementById("browseList");
const mineList = document.getElementById("mineList");
const refreshButton = document.getElementById("refreshButton");
const blackMarketBanner = document.getElementById("blackMarketBanner");
const browseAuctionMode = document.getElementById("browseAuctionMode");
const browseBlackMarketMode = document.getElementById("browseBlackMarketMode");

const sellGemSearch = document.getElementById("sellGemSearch");
const sellGemList = document.getElementById("sellGemList");
const sellPotionList = document.getElementById("sellPotionList");
const lotCount = document.getElementById("lotCount");
const lotSummaryList = document.getElementById("lotSummaryList");
const sellPrice = document.getElementById("sellPrice");
const sellDuration = document.getElementById("sellDuration");
const listButton = document.getElementById("listButton");
const saleMethodBlack = document.getElementById("saleMethodBlack");
const saleMethodAuction = document.getElementById("saleMethodAuction");
const sellTitle = document.getElementById("sellTitle");
const sellIntro = document.getElementById("sellIntro");
const sellPriceLabel = document.getElementById("sellPriceLabel");
const durationField = document.getElementById("durationField");
const blackMarketDisclosure = document.getElementById("blackMarketDisclosure");

const sellFeePreview = document.getElementById("sellFeePreview");
const sellPriceMinimum = document.getElementById("sellPriceMinimum");

function formatRate(rate) {
  return `${(rate * 100).toFixed(2).replace(/\.00$/, "")}%`;
}

function isBlackMarketSale() {
  return state.saleMethod === "black-market";
}

function formatSgtDateTime(value) {
  if (!value) return "Saturday at 12:00 AM SGT";
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(value));
}

function renderBlackMarketStatus() {
  const open = state.blackMarketStatus.open === true;
  blackMarketBanner.classList.toggle("is-open", open);
  blackMarketBanner.innerHTML = open
    ? `<span><strong>Black Market open.</strong> Fixed-price listings close and unsold items return ${escapeHtml(formatSgtDateTime(state.blackMarketStatus.closesAt))}.</span>`
    : `<span><strong>Black Market closed.</strong> It opens ${escapeHtml(formatSgtDateTime(state.blackMarketStatus.opensAt))}. Browsing history and auctions remain available.</span>`;
}

function renderFeePreviews() {
  const startingBid = Math.max(0, Number(sellPrice.value) || 0);
  const hours = Number(sellDuration.value);
  const listingRange = selectedLotPriceRange();
  const rate = isBlackMarketSale() ? 0.02 : listingFeeRate(hours);
  const listingFee = listingRange && rate != null
    ? (isBlackMarketSale() ? feeAmount(startingBid, rate) : feeAmount(listingRange.referenceValue, rate))
    : 0;
  const estimatedTax = listingRange
    ? (isBlackMarketSale() ? startingBid * 0.15 : marginalSellerTax(startingBid, listingRange.referenceValue))
    : 0;
  sellFeePreview.textContent = listingRange && rate != null
    ? `Charged now: ${formatMoney(listingFee)} listing fee (${formatRate(rate)}${isBlackMarketSale() ? " of the asking price" : " of R"}), non-refundable. ${isBlackMarketSale() ? "Sale tax" : "At the starting bid, estimated seller tax"}: ${formatMoney(estimatedTax)}.`
    : `Choose items${isBlackMarketSale() ? "" : " and a duration"} to see the listing fee.`;

  sellPriceMinimum.textContent = listingRange
    ? `Reference value R: ${formatMoney(listingRange.referenceValue)}. ${isBlackMarketSale() ? "Fixed price" : "Starting bid"}: ${formatMoney(listingRange.minimum)}–${formatMoney(listingRange.maximum)} (0.5×–${isBlackMarketSale() ? "25" : "10"}× R).`
    : "Choose items to see the server-verified reference range.";
}

function selectedLotPriceRange() {
  let referenceValue = 0;
  for (const id of state.lot.gems) {
    referenceValue += Math.max(0, Number(state.gems.find((gem) => gem.id === id)?.value) || 0);
  }
  for (const [cid, qty] of state.lot.potions) {
    const consumableValue = getConsumableById(cid)?.marketReferencePrice;
    if (!Number.isFinite(consumableValue)) return null;
    referenceValue += consumableValue * qty;
  }
  if (state.lot.gems.size === 0 && state.lot.potions.size === 0) return null;
  return {
    referenceValue,
    minimum: referenceValue * 0.5,
    maximum: referenceValue * (isBlackMarketSale() ? 25 : 10)
  };
}


// =========================================================
// TABS
// =========================================================

const TABS = [
  { id: "browse", tab: "browseTab", section: "browseSection" },
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
  if (active === "mine") renderMine();
}

for (const entry of TABS) {
  document.getElementById(entry.tab).addEventListener("click", () => selectTab(entry.id));
}

function selectBrowseMode(mode) {
  state.browseMode = mode === "black-market" ? "black-market" : "auction";
  browseAuctionMode.classList.toggle("active", state.browseMode === "auction");
  browseBlackMarketMode.classList.toggle("active", state.browseMode === "black-market");
  browseAuctionMode.setAttribute("aria-selected", String(state.browseMode === "auction"));
  browseBlackMarketMode.setAttribute("aria-selected", String(state.browseMode === "black-market"));
  renderBrowse();
}

browseAuctionMode.addEventListener("click", () => selectBrowseMode("auction"));
browseBlackMarketMode.addEventListener("click", () => selectBrowseMode("black-market"));

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
  const tier = rarityTier(gem.rarity, gem.gem_name);
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
    const tier = rarityTier(gem.rarity, gem.gem_name);
    const muts = mutationsOf(gem);
    return `<li class="lot-item tier-${tier.id}">
      <span class="lot-item__name">${muts.length ? muts.map((m) => escapeHtml(m.name)).join(" ") + " " : ""}${gemNameHtml(gem.gem_name, escapeHtml)}</span>
      <span class="lot-item__meta">${rarityLabel(gem.rarity)}</span></li>`;
  });
  const potionRows = potionItems.map((item) =>
    `<li class="lot-item lot-item--potion">
      <span class="lot-item__name">${icons.potion} ${escapeHtml(potionName(item.consumable_id))}</span>
      <span class="lot-item__meta">×${formatCount(item.quantity)}</span></li>`);
  const rows = [...gemRows, ...potionRows];
  const preview = rows.slice(0, 3).join("");
  const remainder = rows.slice(3);

  return `
    <div class="auction-lot">
      <div class="auction-lot__head">
        <span class="badge badge--accent">Bundle</span>
        <span class="auction-lot__count">${formatCount(count)} item${count === 1 ? "" : "s"}</span>
      </div>
      <ul class="auction-lot__list">${preview}</ul>
      ${remainder.length ? `<details class="auction-lot__more"><summary>+${formatCount(remainder.length)} more</summary><ul class="auction-lot__list">${remainder.join("")}</ul></details>` : ""}
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
// BROWSE AUCTIONS
// =========================================================

function renderBrowse() {
  if (state.loading) return;
  if (state.browseMode === "black-market") {
    renderBlackMarketBrowse();
    return;
  }
  const live = state.auctions.filter((a) => a.status === "active");
  if (live.length === 0) {
    browseList.innerHTML = `
      <div class="empty" style="grid-column:1/-1">${icons.gavel}
        <p class="empty__title">No live auctions right now</p>
        <p>Create one from the “Sell” tab.</p>
      </div>`;
    return;
  }
  browseList.innerHTML = live.map(browseCard).join("");
  for (const card of browseList.querySelectorAll(".auction-card")) wireBidCard(card);
  startTicker();
}

function browseCard(auction) {
  const mine = auction.seller_id === state.userId;
  const referenceValue = Number(auction.lot_reference_value);
  const currentBid = auction.current_bid == null ? null : Number(auction.current_bid);
  const bidCount = Number(auction.bid_count ?? 0);
  const minimum = currentBid == null ? Number(auction.start_price) : currentBid + referenceValue * 0.1;
  const maximum = currentBid == null ? Number(auction.start_price) : currentBid + referenceValue * 25;
  const affordable = state.money >= minimum;
  const leading = auction.current_bidder_id === state.userId;
  const extension = Number(auction.anti_snipe_extension_seconds ?? 0);
  return `
    <article class="card auction-card${leading ? " auction-card--leading" : ""}" data-id="${auction.id}" data-minimum="${minimum}" data-maximum="${maximum}">
      ${lotVisual(auction)}
      <div class="auction-card__body">
        <div class="auction-line">
          <span class="auction-line__key">Seller</span>
          <span class="auction-line__val">${escapeHtml(auction.seller_name ?? "Unknown")}</span>
        </div>
        <div class="auction-line">
          <span class="auction-line__key">${currentBid == null ? "Starting bid" : "Current bid"}</span>
          <span class="auction-line__val auction-line__val--money">${formatMoney(currentBid ?? auction.start_price)}</span>
        </div>
        <div class="auction-line">
          <span class="auction-line__key">Reference value (R)</span>
          <span class="auction-line__val">${formatMoney(referenceValue)}</span>
        </div>
        <div class="auction-line">
          <span class="auction-line__key">Bids</span>
          <span class="auction-line__val">${formatCount(bidCount)}</span>
        </div>
        <div class="auction-line">
          <span class="auction-line__key">Ends in</span>
          <span class="auction-line__val auction-timer js-countdown" data-ends="${auction.ends_at}">${remainingText(auction.ends_at)}</span>
        </div>
      </div>
      ${extension > 0 ? `<div class="auction-card__note">Anti-snipe extension: +${Math.round(extension / 60)} min</div>` : ""}
      ${
        mine
          ? '<div class="auction-card__note">This is your auction. Sellers cannot bid.</div>'
          : leading
          ? '<div class="auction-card__note auction-card__note--good">You are the highest bidder. Another player must bid before you can bid again.</div>'
          : `<div class="auction-bid">
               <div class="auction-money-input auction-bid__input"><span class="auction-money-input__prefix">$</span>
                 <input class="auction-bid-amount" type="number" min="${minimum}" max="${maximum}" step="any" value="${minimum}" inputmode="decimal" aria-label="Bid amount">
               </div>
               <button class="btn btn--primary auction-bid__button" type="button" ${affordable ? "" : "disabled"}>Bid</button>
             </div>
             <div class="auction-bid__hint">${currentBid == null
               ? `First bid must equal ${formatMoney(minimum)}.`
               : `Allowed next bid: ${formatMoney(minimum)}–${formatMoney(maximum)}.`}</div>`
      }
    </article>`;
}

function wireBidCard(card) {
  const id = Number(card.dataset.id);
  const minimum = Number(card.dataset.minimum);
  const maximum = Number(card.dataset.maximum);
  const button = card.querySelector(".auction-bid__button");
  const input = card.querySelector(".auction-bid-amount");
  if (!button || !input) return;

  button.addEventListener("click", async () => {
    const amount = Number(input.value);
    if (!Number.isFinite(amount) || amount < minimum || amount > maximum) {
      notify.error("Bid outside allowed range", `Enter ${formatMoney(minimum)} to ${formatMoney(maximum)}.`);
      return;
    }
    const choice = await confirmDialog({
      title: "Place this bid?",
      body: `<p><strong>${escapeHtml(formatMoney(amount))}</strong> will be held in escrow. If another player outbids you, the full amount is refunded.</p><p style="margin-top:10px">You cannot bid on this auction again for 1 hour, and another player must bid first.</p>`,
      confirmLabel: `Bid ${formatMoney(amount)}`
    });
    if (choice !== "confirm") return;

    button.disabled = true;
    const { data, error } = await placeBid(id, amount);
    if (error) {
      notify.error("Could not bid", error.message);
      button.disabled = false;
      if (["auction_closed", "auction_not_found"].includes(error.code)) refresh();
      return;
    }
    if (data?.money != null) { state.money = Number(data.money); shell?.setWallet(state.money); }
    notify.success("Bid placed", `${formatMoney(amount)} is now held in escrow.`);
    await refresh();
  });
}

function renderBlackMarketBrowse() {
  const live = state.blackMarketListings.filter((listing) => listing.status === "active");
  if (live.length === 0) {
    browseList.innerHTML = `
      <div class="empty" style="grid-column:1/-1">${icons.gavel}
        <p class="empty__title">${state.blackMarketStatus.open ? "No Black Market listings right now" : "Black Market closed"}</p>
        <p>${state.blackMarketStatus.open
          ? "Create a fixed-price listing from the Sell tab."
          : "It opens Saturday at 12:00 AM SGT. Auctions remain open."}</p>
      </div>`;
    return;
  }
  browseList.innerHTML = live.map(blackMarketCard).join("");
  for (const card of browseList.querySelectorAll(".auction-card")) wireBlackMarketCard(card);
  startTicker();
}

function blackMarketCard(listing) {
  const mine = listing.seller_id === state.userId;
  const price = Number(listing.asking_price);
  const canBuy = state.blackMarketStatus.open && !mine && state.money >= price;
  return `
    <article class="card auction-card auction-card--black-market" data-id="${listing.id}">
      ${lotVisual(listing)}
      <div class="auction-card__body">
        <div class="auction-line"><span class="auction-line__key">Seller</span><span class="auction-line__val">${escapeHtml(listing.seller_name ?? "Unknown")}</span></div>
        <div class="auction-line"><span class="auction-line__key">Fixed price</span><span class="auction-line__val auction-line__val--money">${formatMoney(price)}</span></div>
        <div class="auction-line"><span class="auction-line__key">Reference value (R)</span><span class="auction-line__val">${formatMoney(listing.reference_value)}</span></div>
        <div class="auction-line"><span class="auction-line__key">Closes in</span><span class="auction-line__val auction-timer js-countdown" data-ends="${listing.expires_at}">${remainingText(listing.expires_at)}</span></div>
      </div>
      ${mine
        ? '<div class="auction-card__note">This is your listing. Sellers cannot buy their own items.</div>'
        : `<button class="btn btn--primary btn--block black-market-buy" type="button" ${canBuy ? "" : "disabled"}>Buy now · ${formatMoney(price)}</button>
           ${state.blackMarketStatus.open ? "" : '<div class="auction-card__note">Purchases reopen Saturday at 12:00 AM SGT.</div>'}`}
    </article>`;
}

function wireBlackMarketCard(card) {
  const listing = state.blackMarketListings.find((entry) => Number(entry.id) === Number(card.dataset.id));
  const button = card.querySelector(".black-market-buy");
  if (!listing || !button) return;
  button.addEventListener("click", async () => {
    const price = Number(listing.asking_price);
    const choice = await confirmDialog({
      title: "Buy this Black Market listing?",
      body: `<p>You will pay <strong>${escapeHtml(formatMoney(price))}</strong>. The item${Number(listing.item_count) === 1 ? "" : "s"} and payment transfer together in one server transaction.</p>`,
      confirmLabel: `Buy for ${formatMoney(price)}`
    });
    if (choice !== "confirm") return;
    button.disabled = true;
    const { data, error } = await buyBlackMarketListing(listing.id);
    if (error) {
      notify.error("Could not buy listing", error.message);
      button.disabled = false;
      if (["black_market_closed", "black_market_listing_closed", "black_market_listing_not_found"].includes(error.code)) refresh();
      return;
    }
    if (data?.money != null) { state.money = Number(data.money); shell?.setWallet(state.money); }
    notify.success("Purchase complete", "The listing is now in your inventory.");
    await refresh();
  });
}


// =========================================================
// SELL — lot builder
// =========================================================

function availableGems() {
  const query = sellGemSearch.value.trim().toLowerCase();
  return state.gems
    .filter((gem) => !gem.locked && !gem.museum_locked && !isRelic(gem))
    .filter((gem) => !mutationsOf(gem).some((mutation) => mutation.id === "soulbound"))
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
  renderSaleMethodUi();
  renderGemChecklist();
  renderPotionChecklist();
  renderLotSummary();
  renderFeePreviews();
}

function renderSaleMethodUi() {
  const blackMarket = isBlackMarketSale();
  saleMethodBlack.disabled = !state.blackMarketStatus.open;
  saleMethodBlack.checked = blackMarket;
  saleMethodAuction.checked = !blackMarket;
  sellTitle.textContent = blackMarket ? "Create a Black Market listing" : "Create an auction";
  sellIntro.innerHTML = blackMarket
    ? `Set a fixed price for an instant public sale. Your lot is escrowed until it sells, is cancelled, or returns when the market closes. You can have up to <strong>3 Black Market listings</strong> at once.`
    : `Build a lot from your gems and consumables. The lot leaves your inventory while listed and returns if nobody bids. The listing fee is charged now and is never refunded. You can have up to <strong>3 auctions</strong> at once.`;
  sellPriceLabel.textContent = blackMarket ? "Fixed price" : "Starting bid";
  durationField.classList.toggle("hidden", blackMarket);
  blackMarketDisclosure.classList.toggle("hidden", !blackMarket);
  listButton.textContent = blackMarket ? "Create Black Market listing" : "Create auction";
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
    sellPotionList.innerHTML = `<p class="lot-picker__empty">No tradeable consumables available.</p>`;
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
  listButton.disabled = count === 0 || (isBlackMarketSale() && !state.blackMarketStatus.open);
  renderFeePreviews();
}

sellGemSearch.addEventListener("input", renderGemChecklist);
sellPrice.addEventListener("input", renderFeePreviews);
sellDuration.addEventListener("change", renderFeePreviews);
for (const radio of [saleMethodBlack, saleMethodAuction]) {
  radio.addEventListener("change", () => {
    state.saleMethod = saleMethodBlack.checked ? "black-market" : "auction";
    renderSell();
  });
}
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
  const blackMarket = isBlackMarketSale();
  if (blackMarket && !state.blackMarketStatus.open) {
    notify.error("Black Market closed", "It opens Saturday at 12:00 AM SGT.");
    return;
  }
  const price = Number(sellPrice.value);
  const hours = Number(sellDuration.value);
  if (!Number.isFinite(price) || price <= 0) { notify.error(blackMarket ? "Invalid fixed price" : "Invalid starting bid", "Enter a positive price."); return; }
  const listingRange = selectedLotPriceRange();
  if (!listingRange) {
    notify.error("Cannot price this lot", "One of these consumables does not have a market reference value yet.");
    return;
  }
  if (price < listingRange.minimum || price > listingRange.maximum) {
    notify.error(
      blackMarket ? "Fixed price outside allowed range" : "Starting bid outside allowed range",
      `Choose a price between ${formatMoney(listingRange.minimum)} and ${formatMoney(listingRange.maximum)}.`
    );
    return;
  }
  const feeRate = blackMarket ? 0.02 : listingFeeRate(hours);
  if (feeRate == null) { notify.error("Invalid duration", "Choose a supported auction duration."); return; }
  const fee = feeAmount(blackMarket ? price : listingRange.referenceValue, feeRate);
  const sellerTax = blackMarket ? price * 0.15 : marginalSellerTax(price, listingRange.referenceValue);
  if (fee > state.money) { notify.error("Not enough money", `The non-refundable listing fee is ${formatMoney(fee)}. You have ${formatMoney(state.money)}.`); return; }

  const items = [
    ...[...state.lot.gems].map((id) => ({ type: "gem", id })),
    ...[...state.lot.potions].map(([cid, qty]) => ({ type: "potion", consumableId: cid, quantity: qty }))
  ];
  const summary = [
    ...[...state.lot.gems].map((id) => state.gems.find((g) => g.id === id)?.gem_name).filter(Boolean),
    ...[...state.lot.potions].map(([cid, qty]) => `${qty}× ${potionName(cid)}`)
  ];

  const choice = await confirmDialog({
    title: blackMarket
      ? (count === 1 ? "List this item on the Black Market?" : `List ${count} items on the Black Market?`)
      : (count === 1 ? "Auction this item?" : `Auction a bundle of ${count} items?`),
    body: `
      <p>${blackMarket ? "Fixed price" : "Starting bid"} <strong>${escapeHtml(formatMoney(price))}</strong>${blackMarket
        ? ". Every Black Market listing expires Sunday at 11:59:59 PM SGT."
        : `, open for <strong>${hours} hours</strong>.`}</p>
      <p style="margin-top:10px"><strong>Reference value:</strong> ${escapeHtml(formatMoney(listingRange.referenceValue))}<br>
      <strong>Listing fee charged now:</strong> ${escapeHtml(formatMoney(fee))} (${escapeHtml(formatRate(feeRate))}, non-refundable)<br>
      <strong>${blackMarket ? "Sale tax" : "Estimated seller tax at starting bid"}:</strong> ${escapeHtml(formatMoney(sellerTax))}${blackMarket ? `<br><strong>Seller receives:</strong> ${escapeHtml(formatMoney(price - sellerTax))}` : ""}</p>
      <p style="margin-top:10px"><strong>Lot:</strong> ${escapeHtml(summary.join(", "))}</p>
      <p style="margin-top:10px">The lot leaves your inventory while active.${blackMarket ? " Unsold items return when the market closes; the 2% listing fee does not." : " Once a valid bid is placed, the auction cannot be cancelled."}</p>`,
    confirmLabel: blackMarket ? "Create listing" : "Create auction"
  });
  if (choice !== "confirm") return;

  listButton.disabled = true;
  const { error } = blackMarket
    ? await createBlackMarketListing(items, price)
    : await createAuctionLot(items, price, hours);
  if (error) { notify.error("Could not list", error.message); listButton.disabled = false; return; }

  state.lot = { gems: new Set(), potions: new Map() };
  notify.success(
    blackMarket ? "Black Market listing created" : "Auction created",
    blackMarket
      ? "Your fixed-price listing is live until the market closes."
      : (count === 1 ? "Your item is open for bids." : `Your bundle of ${count} items is open for bids.`)
  );
  await refresh();
  selectTab("mine");
});


// =========================================================
// MY AUCTIONS
// =========================================================

const STATUS_LABELS = {
  active: "Active", sold: "Sold", returned: "Unsold — returned", cancelled: "Cancelled"
};

function renderMine() {
  if (state.loading) return;

  const auctionCards = state.mine.map(mineCard).join("");
  const blackMarketCards = state.myBlackMarketListings.map(myBlackMarketCard).join("");
  mineList.innerHTML = auctionCards || blackMarketCards
    ? `${blackMarketCards ? '<h3 class="market-section-label">Black Market</h3>' + blackMarketCards : ""}
       ${auctionCards ? '<h3 class="market-section-label">Auctions</h3>' + auctionCards : ""}`
    : `<div class="empty" style="grid-column:1/-1">${icons.gavel}<p class="empty__title">No listings</p><p>Create one from the “Sell” tab.</p></div>`;
  for (const card of mineList.querySelectorAll(".auction-card--mine:not(.auction-card--black-market)")) {
    const id = Number(card.dataset.id);
    card.querySelector('[data-action="cancel"]')?.addEventListener("click", async () => {
      const choice = await confirmDialog({
        title: "Cancel this auction?",
        body: `<p>The lot returns to your inventory. The listing fee is not refunded.</p>`,
        confirmLabel: "Cancel auction", cancelLabel: "Keep it", tone: "danger"
      });
      if (choice !== "confirm") return;
      const { error } = await cancelAuction(id);
      if (error) { notify.error("Could not cancel", error.message); return; }
      notify.success("Auction cancelled", "The lot is back in your inventory. The listing fee was not refunded.");
      await refresh();
    });
  }
  for (const card of mineList.querySelectorAll(".auction-card--black-market")) {
    const id = Number(card.dataset.id);
    card.querySelector('[data-action="cancel-black-market"]')?.addEventListener("click", async () => {
      const choice = await confirmDialog({
        title: "Cancel this Black Market listing?",
        body: "<p>The lot returns to your inventory. The 2% listing fee is not refunded.</p>",
        confirmLabel: "Cancel listing", cancelLabel: "Keep it", tone: "danger"
      });
      if (choice !== "confirm") return;
      const { error } = await cancelBlackMarketListing(id);
      if (error) { notify.error("Could not cancel", error.message); return; }
      notify.success("Listing cancelled", "The lot is back in your inventory. The listing fee was not refunded.");
      await refresh();
    });
  }
}

function mineCard(auction) {
  const active = auction.status === "active";
  const hasBids = Number(auction.bid_count ?? 0) > 0;
  const displayPrice = auction.current_bid ?? auction.start_price;
  const sellerTax = auction.status === "sold"
    ? Number(auction.fee_amount ?? 0)
    : marginalSellerTax(Number(displayPrice), Number(auction.lot_reference_value));
  return `
    <article class="card auction-card auction-card--mine" data-id="${auction.id}">
      ${lotVisual(auction)}
      <div class="auction-card__body">
        <div class="auction-line">
          <span class="auction-line__key">Status</span>
          <span class="auction-line__val auction-status auction-status--${auction.status}">${STATUS_LABELS[auction.status] ?? auction.status}</span>
        </div>
        <div class="auction-line">
          <span class="auction-line__key">${auction.status === "sold" ? "Sold for" : hasBids ? "Current bid" : "Starting bid"}</span>
          <span class="auction-line__val auction-line__val--money">${formatMoney(displayPrice)}</span>
        </div>
        <div class="auction-line"><span class="auction-line__key">Reference value (R)</span><span class="auction-line__val">${formatMoney(auction.lot_reference_value)}</span></div>
        <div class="auction-line"><span class="auction-line__key">${auction.status === "sold" ? "Seller tax" : "Estimated tax"}</span><span class="auction-line__val">${formatMoney(sellerTax)}</span></div>
        <div class="auction-line"><span class="auction-line__key">Listing fee paid</span><span class="auction-line__val">${formatMoney(auction.listing_fee_amount)}</span></div>
        ${auction.status === "sold" && auction.current_bidder_name ? `<div class="auction-line"><span class="auction-line__key">Buyer</span><span class="auction-line__val">${escapeHtml(auction.current_bidder_name)}</span></div>` : ""}
        ${active ? `<div class="auction-line"><span class="auction-line__key">Ends in</span><span class="auction-line__val auction-timer js-countdown" data-ends="${auction.ends_at}">${remainingText(auction.ends_at)}</span></div>` : ""}
      </div>
      ${active && !hasBids ? '<button class="btn btn--danger btn--sm btn--block" data-action="cancel" type="button">Cancel auction</button>' : ""}
      ${active && hasBids ? '<div class="auction-card__note">Bidding has started, so this auction cannot be cancelled.</div>' : ""}
    </article>`;
}

function myBlackMarketCard(listing) {
  const active = listing.status === "active";
  const sold = listing.status === "sold";
  const tax = sold ? Number(listing.sale_tax ?? 0) : Number(listing.asking_price) * 0.15;
  const statusLabel = {
    active: "Active", sold: "Sold", returned: "Unsold — returned", cancelled: "Cancelled"
  }[listing.status] ?? listing.status;
  return `
    <article class="card auction-card auction-card--mine auction-card--black-market" data-id="${listing.id}">
      ${lotVisual(listing)}
      <div class="auction-card__body">
        <div class="auction-line"><span class="auction-line__key">Status</span><span class="auction-line__val auction-status auction-status--${listing.status}">${statusLabel}</span></div>
        <div class="auction-line"><span class="auction-line__key">Fixed price</span><span class="auction-line__val auction-line__val--money">${formatMoney(listing.asking_price)}</span></div>
        <div class="auction-line"><span class="auction-line__key">Reference value (R)</span><span class="auction-line__val">${formatMoney(listing.reference_value)}</span></div>
        <div class="auction-line"><span class="auction-line__key">${sold ? "Sale tax" : "Sale tax if sold"}</span><span class="auction-line__val">${formatMoney(tax)}</span></div>
        <div class="auction-line"><span class="auction-line__key">Listing fee paid</span><span class="auction-line__val">${formatMoney(listing.listing_fee)}</span></div>
        ${sold ? `<div class="auction-line"><span class="auction-line__key">Seller proceeds</span><span class="auction-line__val">${formatMoney(listing.seller_proceeds)}</span></div>` : ""}
        ${sold && listing.buyer_name ? `<div class="auction-line"><span class="auction-line__key">Buyer</span><span class="auction-line__val">${escapeHtml(listing.buyer_name)}</span></div>` : ""}
        ${active ? `<div class="auction-line"><span class="auction-line__key">Closes in</span><span class="auction-line__val auction-timer js-countdown" data-ends="${listing.expires_at}">${remainingText(listing.expires_at)}</span></div>` : ""}
        ${listing.closure_reason ? `<div class="auction-line"><span class="auction-line__key">Closure</span><span class="auction-line__val">${escapeHtml(String(listing.closure_reason).replaceAll("_", " "))}</span></div>` : ""}
      </div>
      ${active ? '<button class="btn btn--danger btn--sm btn--block" data-action="cancel-black-market" type="button">Cancel listing</button>' : ""}
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
  const [auctions, mine, blackMarketListings, myBlackMarketListings, blackMarketStatus, gems_, playerState, consumables] = await Promise.all([
    loadActiveAuctions(), loadMyAuctions(),
    loadActiveBlackMarketListings(), loadMyBlackMarketListings(), getBlackMarketStatus(),
    loadCloudGems(), loadCloudPlayerState(), loadCloudConsumables()
  ]);

  state.loading = false;
  state.auctions = auctions;
  state.mine = mine;
  state.blackMarketListings = blackMarketListings;
  state.myBlackMarketListings = myBlackMarketListings;
  state.blackMarketStatus = blackMarketStatus;
  state.gems = Array.isArray(gems_) ? gems_ : [];
  state.consumables = Array.isArray(consumables) ? consumables : [];
  pruneLot();

  if (playerState) { state.money = Number(playerState.money); shell?.setWallet(state.money); }

  statusEl.textContent = `${formatCount(state.auctions.length)} live auction${state.auctions.length === 1 ? "" : "s"} · ${formatCount(state.blackMarketListings.length)} Black Market listing${state.blackMarketListings.length === 1 ? "" : "s"}`;

  renderBlackMarketStatus();
  renderBrowse();
  if (state.tab === "sell") renderSell();
  else if (state.tab === "mine") renderMine();
}

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  await settleDueAuctions();
  await refresh();
  refreshButton.disabled = false;
});

window.addEventListener("pageshow", (event) => { if (event.persisted) refresh(); });

async function boot() {
  const user = await ensurePlayerAuth();
  if (!user) {
    state.loading = false;
    statusEl.textContent = isSignInRequired()
      ? SIGN_IN_REQUIRED_MESSAGE
      : "Could not sign you in. Refresh to try again.";
    browseList.innerHTML = "";
    return;
  }
  state.userId = user.id;
  await settleDueAuctions();
  await refresh();
  const params = new URLSearchParams(location.search);
  const requestedGem = Number(params.get("id"));
  if (params.get("sell") === "gem" && Number.isSafeInteger(requestedGem) && requestedGem > 0) {
    const gem = state.gems.find((entry) => entry.id === requestedGem);
    if (gem && !gem.locked && !gem.museum_locked && !isRelic(gem)) state.lot.gems.add(requestedGem);
    selectTab("sell");
    renderSell();
  }
}

boot();
