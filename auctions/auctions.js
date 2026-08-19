import { ensurePlayerAuth } from "../src/backend/auth.js";
import { loadCloudGems, loadCloudPlayerState } from "../src/backend/cloudInventory.js";
import { loadCloudConsumables } from "../src/backend/cloudConsumables.js";
import {
  settleDueAuctions,
  loadActiveAuctions,
  loadMyAuctions,
  loadBidsFor,
  createAuctionLot,
  placeBid,
  cancelAuction
} from "../src/backend/cloudAuctions.js";
import { isRelic } from "../src/data/enchants.js";
import { getGemMutation } from "../src/data/mutations.js";
import { getConsumableById } from "../src/data/consumables.js";

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


// The shell is mounted by the inline module in index.html.
const shell = window.__shell;

document.getElementById("refreshIcon").innerHTML = icons.refresh;
document.getElementById("sellSearchIcon").innerHTML = icons.search;


// =========================================================
// STATE
// =========================================================

const state = {
  auctions: [],
  mine: [],
  gems: [],
  consumables: [],
  money: 0,
  userId: null,
  loading: true,
  // The lot being assembled on the Sell tab.
  lot: { gems: new Set(), potions: new Map() },
  tab: "browse"
};


const statusEl = document.getElementById("auctionStatus");
const browseList = document.getElementById("browseList");
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


// =========================================================
// TABS
// =========================================================

const TABS = [
  { id: "browse", tab: "browseTab", section: "browseSection" },
  { id: "sell", tab: "sellTab", section: "sellSection" },
  { id: "mine", tab: "mineTab", section: "mineSection" }
];

function selectTab(active) {
  state.tab = active;

  for (const entry of TABS) {
    const tab = document.getElementById(entry.tab);
    const section = document.getElementById(entry.section);
    const on = entry.id === active;

    tab.classList.toggle("active", on);
    tab.setAttribute("aria-selected", String(on));
    section.classList.toggle("hidden", !on);
  }

  if (active === "sell") {
    renderSell();
  }
  if (active === "mine") {
    renderMine();
  }
}

for (const entry of TABS) {
  document.getElementById(entry.tab).addEventListener("click", () => selectTab(entry.id));
}


// =========================================================
// GEM SNAPSHOT RENDERING
// =========================================================

function mutationsOf(gem) {
  const ids = Array.isArray(gem?.mutation_ids) && gem.mutation_ids.length
    ? gem.mutation_ids
    : (gem?.mutation_id ? [gem.mutation_id] : []);
  const multipliers = gem?.mutation_multipliers && typeof gem.mutation_multipliers === "object"
    ? gem.mutation_multipliers
    : {};
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
        <span>${formatWeight(gem.final_weight)}</span>
        <span>·</span>
        <span>base value ${formatMoney(gem.value)}</span>
      </div>
    </div>
  `;
}

function potionName(consumableId) {
  return getConsumableById(consumableId)?.name ?? consumableId;
}

// Renders whatever a listing holds: a single gem (rich card), or a
// bundle of gems/relics/potions (compact list). Falls back to the
// legacy single-gem `gem` column for pre-lot auctions.
function lotVisual(auction) {
  const lot = Array.isArray(auction.lot) ? auction.lot : null;
  if (!lot) return auction.gem ? gemVisual(auction.gem) : "";

  const gemItems = lot.filter((item) => item.type !== "potion");
  const potionItems = lot.filter((item) => item.type === "potion");

  // A lone gem still gets the full gem treatment.
  if (gemItems.length === 1 && potionItems.length === 0) {
    return gemVisual(gemItems[0]);
  }

  const count = Number(auction.item_count ?? lot.length);

  const gemRows = gemItems
    .map((gem) => {
      const tier = rarityTier(gem.rarity);
      const muts = mutationsOf(gem);
      return `<li class="lot-item tier-${tier.id}">
        <span class="lot-item__name">${muts.length ? muts.map((m) => escapeHtml(m.name)).join(" ") + " " : ""}${gemNameHtml(gem.gem_name, escapeHtml)}</span>
        <span class="lot-item__meta">${rarityLabel(gem.rarity)}</span>
      </li>`;
    })
    .join("");

  const potionRows = potionItems
    .map(
      (item) => `<li class="lot-item lot-item--potion">
        <span class="lot-item__name">${icons.potion} ${escapeHtml(potionName(item.consumable_id))}</span>
        <span class="lot-item__meta">×${formatCount(item.quantity)}</span>
      </li>`
    )
    .join("");

  return `
    <div class="auction-lot">
      <div class="auction-lot__head">
        <span class="badge badge--accent">Bundle</span>
        <span class="auction-lot__count">${formatCount(count)} item${count === 1 ? "" : "s"}</span>
      </div>
      <ul class="auction-lot__list">${gemRows}${potionRows}</ul>
    </div>
  `;
}


// =========================================================
// COUNTDOWN TICKER
// =========================================================

function remainingText(endsAt) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "Ended";

  const totalSeconds = Math.ceil(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
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
      if (text === "Ended") {
        el.classList.add("auction-timer--ended");
        anyEnded = true;
      } else if (new Date(ends).getTime() - Date.now() < 60000) {
        el.classList.add("auction-timer--soon");
      }
    }
    // A visible auction just crossed its deadline — settle + reload so
    // the winner and payout land without a manual refresh.
    if (anyEnded && state.tab === "browse") {
      refresh();
    }
  }, 1000);
}


// =========================================================
// BROWSE
// =========================================================

function minNextBid(auction) {
  if (auction.current_bid == null) return Number(auction.start_price);
  const bump = Math.max(1, Number(auction.current_bid) * 0.05);
  return Math.ceil(Number(auction.current_bid) + bump);
}

function renderBrowse() {
  if (state.loading) {
    return;
  }

  const live = state.auctions.filter((a) => a.status === "active");

  if (live.length === 0) {
    browseList.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        ${icons.gavel}
        <p class="empty__title">No auctions right now</p>
        <p>Be the first — list one of your gems from the “Sell a Gem” tab.</p>
      </div>
    `;
    return;
  }

  browseList.innerHTML = live.map(browseCard).join("");

  for (const card of browseList.querySelectorAll(".auction-card")) {
    wireBrowseCard(card);
  }

  startTicker();
}

function browseCard(auction) {
  const mine = auction.seller_id === state.userId;
  const leading = auction.current_bidder_id === state.userId;
  const min = minNextBid(auction);
  const hasBid = auction.current_bid != null;

  return `
    <article class="card auction-card${leading ? " auction-card--leading" : ""}" data-id="${auction.id}" data-min="${min}">
      ${lotVisual(auction)}

      <div class="auction-card__body">
        <div class="auction-line">
          <span class="auction-line__key">Seller</span>
          <span class="auction-line__val">${escapeHtml(auction.seller_name ?? "Unknown")}</span>
        </div>

        <div class="auction-line">
          <span class="auction-line__key">${hasBid ? "Top bid" : "Starting price"}</span>
          <span class="auction-line__val auction-line__val--money">${formatMoney(hasBid ? auction.current_bid : auction.start_price)}</span>
        </div>

        <div class="auction-line">
          <span class="auction-line__key">Bids</span>
          <span class="auction-line__val">${formatCount(auction.bid_count)}${hasBid ? ` · ${escapeHtml(auction.current_bidder_name ?? "")}` : ""}</span>
        </div>

        <div class="auction-line">
          <span class="auction-line__key">Ends in</span>
          <span class="auction-line__val auction-timer js-countdown" data-ends="${auction.ends_at}">${remainingText(auction.ends_at)}</span>
        </div>
      </div>

      ${leading ? '<div class="auction-card__note auction-card__note--good">You are the highest bidder.</div>' : ""}

      ${
        mine
          ? '<div class="auction-card__note">This is your listing.</div>'
          : `
            <div class="auction-bid">
              <div class="auction-money-input auction-bid__input">
                <span class="auction-money-input__prefix">$</span>
                <input type="number" inputmode="numeric" min="${min}" step="1" value="${min}" aria-label="Your bid">
              </div>
              <button class="btn btn--primary auction-bid__button" type="button">Bid</button>
            </div>
            <div class="auction-bid__hint">Minimum bid ${formatMoney(min)}</div>
          `
      }
    </article>
  `;
}

function wireBrowseCard(card) {
  const id = Number(card.dataset.id);
  const input = card.querySelector(".auction-bid__input input");
  const button = card.querySelector(".auction-bid__button");

  if (!button) return;

  button.addEventListener("click", async () => {
    const amount = Number(input.value);
    const min = Number(card.dataset.min);

    if (!Number.isFinite(amount) || amount < min) {
      notify.error("Bid too low", `Bid at least ${formatMoney(min)}.`);
      return;
    }

    if (amount > state.money) {
      notify.error("Not enough money", `You have ${formatMoney(state.money)}.`);
      return;
    }

    button.disabled = true;
    input.disabled = true;

    const { data, error } = await placeBid(id, amount);

    if (error) {
      notify.error("Bid failed", error.message);
      button.disabled = false;
      input.disabled = false;
      // Timing/outbid errors mean our view is stale — reload.
      if (["auction_closed", "already_highest", "bid_too_low"].includes(error.code)) {
        refresh();
      }
      return;
    }

    if (data?.money != null) {
      state.money = Number(data.money);
      shell?.setWallet(state.money);
    }

    notify.success("Bid placed", `You bid ${formatMoney(amount)}.`);
    await refresh();
  });
}


// =========================================================
// SELL — build a lot from gems, relics and potions
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
}

function renderGemChecklist() {
  const gems = availableGems();
  const unlockedTotal = state.gems.filter((g) => !g.locked).length;

  if (unlockedTotal === 0) {
    sellGemList.innerHTML = `<p class="lot-picker__empty">No unlocked gems. Unlock or roll some first.</p>`;
    return;
  }
  if (gems.length === 0) {
    sellGemList.innerHTML = `<p class="lot-picker__empty">Nothing matches your search.</p>`;
    return;
  }

  sellGemList.innerHTML = gems
    .map((gem) => {
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
    })
    .join("");
}

function renderPotionChecklist() {
  const potions = ownedPotions();
  if (potions.length === 0) {
    sellPotionList.innerHTML = `<p class="lot-picker__empty">No potions to sell.</p>`;
    return;
  }
  sellPotionList.innerHTML = potions
    .map(({ row, def }) => {
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
    })
    .join("");
}

function renderLotSummary() {
  const count = lotItemCount();
  lotCount.textContent = `${formatCount(count)} item${count === 1 ? "" : "s"}`;

  const gemChips = [...state.lot.gems]
    .map((id) => {
      const gem = state.gems.find((g) => g.id === id);
      if (!gem) return "";
      return `<span class="lot-chip">${gemNameHtml(gem.gem_name, escapeHtml)} <button type="button" data-remove-gem="${id}" aria-label="Remove">×</button></span>`;
    })
    .join("");

  const potionChips = [...state.lot.potions]
    .map(
      ([cid, qty]) =>
        `<span class="lot-chip">${escapeHtml(potionName(cid))} ×${formatCount(qty)} <button type="button" data-remove-potion="${escapeHtml(cid)}" aria-label="Remove">×</button></span>`
    )
    .join("");

  lotSummaryList.innerHTML =
    count === 0
      ? `<p class="lot-picker__empty">Pick gems or potions above to build your lot.</p>`
      : gemChips + potionChips;

  listButton.disabled = count === 0;
}

sellGemSearch.addEventListener("input", renderGemChecklist);

sellGemList.addEventListener("change", (event) => {
  const box = event.target.closest("[data-gem]");
  if (!box) return;
  const id = Number(box.dataset.gem);
  if (box.checked) state.lot.gems.add(id);
  else state.lot.gems.delete(id);
  box.closest(".lot-option")?.classList.toggle("lot-option--on", box.checked);
  renderLotSummary();
});

sellPotionList.addEventListener("input", (event) => {
  const input = event.target.closest("[data-potion]");
  if (!input) return;
  const cid = input.dataset.potion;
  const max = Number(input.max);
  const qty = Math.max(0, Math.min(max, Math.floor(Number(input.value) || 0)));
  if (qty === 0) state.lot.potions.delete(cid);
  else state.lot.potions.set(cid, qty);
  input.closest(".lot-option")?.classList.toggle("lot-option--on", qty > 0);
  renderLotSummary();
});

lotSummaryList.addEventListener("click", (event) => {
  const removeGem = event.target.closest("[data-remove-gem]");
  const removePotion = event.target.closest("[data-remove-potion]");
  if (removeGem) {
    state.lot.gems.delete(Number(removeGem.dataset.removeGem));
    renderSell();
  } else if (removePotion) {
    state.lot.potions.delete(removePotion.dataset.removePotion);
    renderSell();
  }
});

listButton.addEventListener("click", async () => {
  const count = lotItemCount();
  if (count === 0) return;

  const price = Math.floor(Number(sellPrice.value));
  const hours = Number(sellDuration.value);

  if (!Number.isFinite(price) || price < 1) {
    notify.error("Invalid price", "Enter a starting price of at least $1.");
    return;
  }

  const items = [
    ...[...state.lot.gems].map((id) => ({ type: "gem", id })),
    ...[...state.lot.potions].map(([cid, qty]) => ({ type: "potion", consumableId: cid, quantity: qty }))
  ];

  const summary = [
    ...[...state.lot.gems].map((id) => state.gems.find((g) => g.id === id)?.gem_name).filter(Boolean),
    ...[...state.lot.potions].map(([cid, qty]) => `${qty}× ${potionName(cid)}`)
  ];

  const choice = await confirmDialog({
    title: count === 1 ? "List this item for auction?" : `List a bundle of ${count} items?`,
    body: `
      <p>Starting price <strong>${escapeHtml(formatMoney(price))}</strong>,
      running for <strong>${hours} hour${hours === 1 ? "" : "s"}</strong>.</p>
      <p style="margin-top:10px"><strong>Lot:</strong> ${escapeHtml(summary.join(", "))}</p>
      <p style="margin-top:10px">Everything in the lot leaves your inventory while
      listed and returns if nobody bids.</p>
    `,
    confirmLabel: "List it"
  });

  if (choice !== "confirm") return;

  listButton.disabled = true;

  const { error } = await createAuctionLot(items, price, hours);

  if (error) {
    notify.error("Could not list lot", error.message);
    listButton.disabled = false;
    return;
  }

  state.lot = { gems: new Set(), potions: new Map() };

  notify.success(
    "Listed",
    count === 1 ? "Your item is up for auction." : `Your bundle of ${count} items is up for auction.`
  );

  await refresh();
  selectTab("mine");
});


// =========================================================
// MY LISTINGS
// =========================================================

const STATUS_LABELS = {
  active: "Active",
  sold: "Sold",
  returned: "Unsold — returned",
  cancelled: "Cancelled"
};

function renderMine() {
  if (state.loading) return;

  if (state.mine.length === 0) {
    mineList.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        ${icons.gavel}
        <p class="empty__title">You have no listings</p>
        <p>List a gem from the “Sell a Gem” tab to see it here.</p>
      </div>
    `;
    return;
  }

  mineList.innerHTML = state.mine.map(mineCard).join("");

  for (const card of mineList.querySelectorAll(".auction-card")) {
    const id = Number(card.dataset.id);
    const cancelButton = card.querySelector('[data-action="cancel"]');

    cancelButton?.addEventListener("click", async () => {
      const choice = await confirmDialog({
        title: "Cancel this listing?",
        body: `<p>The gem returns to your inventory. You can only cancel a listing with no bids.</p>`,
        confirmLabel: "Cancel listing",
        cancelLabel: "Keep it",
        tone: "danger"
      });
      if (choice !== "confirm") return;

      cancelButton.disabled = true;
      const { error } = await cancelAuction(id);
      if (error) {
        notify.error("Could not cancel", error.message);
        cancelButton.disabled = false;
        return;
      }
      notify.success("Listing cancelled", "The gem is back in your inventory.");
      await refresh();
    });
  }

  startTicker();
}

function mineCard(auction) {
  const active = auction.status === "active";
  const hasBid = auction.current_bid != null;
  const canCancel = active && auction.bid_count === 0;

  return `
    <article class="card auction-card auction-card--mine" data-id="${auction.id}">
      ${lotVisual(auction)}

      <div class="auction-card__body">
        <div class="auction-line">
          <span class="auction-line__key">Status</span>
          <span class="auction-line__val auction-status auction-status--${auction.status}">${STATUS_LABELS[auction.status] ?? auction.status}</span>
        </div>

        <div class="auction-line">
          <span class="auction-line__key">${auction.status === "sold" ? "Sold for" : hasBid ? "Top bid" : "Starting price"}</span>
          <span class="auction-line__val auction-line__val--money">${formatMoney(hasBid ? auction.current_bid : auction.start_price)}</span>
        </div>

        <div class="auction-line">
          <span class="auction-line__key">Bids</span>
          <span class="auction-line__val">${formatCount(auction.bid_count)}${auction.status === "sold" && auction.current_bidder_name ? ` · won by ${escapeHtml(auction.current_bidder_name)}` : ""}</span>
        </div>

        ${
          active
            ? `<div class="auction-line">
                 <span class="auction-line__key">Ends in</span>
                 <span class="auction-line__val auction-timer js-countdown" data-ends="${auction.ends_at}">${remainingText(auction.ends_at)}</span>
               </div>`
            : ""
        }
      </div>

      ${canCancel ? '<button class="btn btn--danger btn--sm btn--block" data-action="cancel" type="button">Cancel listing</button>' : ""}
    </article>
  `;
}


// =========================================================
// LOAD
// =========================================================

function renderActive() {
  if (state.tab === "browse") renderBrowse();
  else if (state.tab === "sell") renderSell();
  else if (state.tab === "mine") renderMine();
}

// Drop any lot selections that are no longer available (sold, listed,
// locked, or potions we no longer have enough of) so the builder never
// references stale items.
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
  const [auctions, mine, gems, playerState, consumables] = await Promise.all([
    loadActiveAuctions(),
    loadMyAuctions(),
    loadCloudGems(),
    loadCloudPlayerState(),
    loadCloudConsumables()
  ]);

  state.loading = false;
  state.auctions = auctions;
  state.mine = mine;
  state.gems = Array.isArray(gems) ? gems : [];
  state.consumables = Array.isArray(consumables) ? consumables : [];
  pruneLot();

  if (playerState) {
    state.money = Number(playerState.money);
    shell?.setWallet(state.money);
  }

  statusEl.textContent = `${formatCount(state.auctions.length)} live auction${state.auctions.length === 1 ? "" : "s"}`;

  renderBrowse();
  renderActive();
}

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  await settleDueAuctions();
  await refresh();
  refreshButton.disabled = false;
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted) refresh();
});

async function boot() {
  const user = await ensurePlayerAuth();
  if (!user) {
    state.loading = false;
    statusEl.textContent = "Could not sign you in. Refresh to try again.";
    browseList.innerHTML = "";
    return;
  }

  state.userId = user.id;

  // Settle expired auctions before the first read so the board is fresh.
  await settleDueAuctions();
  await refresh();
}

boot();
