import consumables from "../src/data/consumables.js";
import { ensurePlayerAuth } from "../src/backend/auth.js";
import { loadCloudPlayerState } from "../src/backend/cloudInventory.js";
import {
  buyCloudConsumable,
  loadCloudConsumables,
  loadDailyShop,
  buyDailyShopOffer,
  refreshDailyShop
} from "../src/backend/cloudConsumables.js";
import { mountShell } from "../src/ui/shell.js";
import { icons } from "../src/ui/icons.js";
import { formatCount, formatMoney, escapeHtml } from "../src/ui/format.js";
import { notify } from "../src/ui/toast.js";
import { confirmDialog } from "../src/ui/dialog.js";


const shell = mountShell({ page: "boosts", base: "../" });
const potionList = document.getElementById("potionList");
const subtitle = document.getElementById("shopSubtitle");
const refreshButton = document.getElementById("refreshButton");
const dailyShopList = document.getElementById("dailyShopList");
const dailyCountdown = document.getElementById("dailyCountdown");
const refreshDailyButton = document.getElementById("refreshDailyButton");
const viewChancesButton = document.getElementById("viewChancesButton");
const closeChancesButton = document.getElementById("closeChancesButton");
const shopChances = document.getElementById("shopChances");

document.getElementById("refreshIcon").innerHTML = icons.refresh;
document.getElementById("shopNoteIcon").innerHTML = icons.potion;

const state = {
  money: 0,
  consumables: [],
  dailyOffers: [],
  loading: true
};

const POTIONS = consumables.filter((item) => item.shop.purchasable);

const STAT_NAMES = {
  luck: "Luck",
  rollSpeed: "Roll speed",
  weightLuck: "Weight luck",
  weightMultiplier: "Weight multiplier"
};

function ownedQuantity(consumableId) {
  const row = state.consumables.find(
    (item) => item.consumable_id === consumableId
  );
  return Number(row?.quantity ?? 0);
}

function render() {
  shell.setWallet(state.money);

  if (state.loading) {
    potionList.innerHTML = Array.from(
      { length: 4 },
      () => '<div class="skeleton" style="height:300px"></div>'
    ).join("");
    dailyShopList.innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton" style="height:260px"></div>').join("");
    return;
  }

  subtitle.textContent =
    `${formatCount(state.dailyOffers.length)} daily offers · ${formatMoney(state.money)} available`;

  renderDailyShop();
  updateCountdown();

  potionList.innerHTML = POTIONS.map((potion) => {
    const price = potion.shop.price;
    const affordable = state.money >= price;
    const stat = STAT_NAMES[potion.family] ?? potion.family;
    const effect = Math.round(potion.effectValue * 100);
    const owned = ownedQuantity(potion.id);

    return `
      <article class="potion-card potion-card--${escapeHtml(potion.family)}">
        <div class="potion-card__head">
          <span class="potion-card__icon">${icons.potion}</span>
          ${
            owned > 0
              ? `<span class="badge badge--accent">Owned ×${formatCount(owned)}</span>`
              : '<span class="badge badge--muted">Tier 1</span>'
          }
        </div>

        <div>
          <h2 class="potion-card__name">${escapeHtml(potion.name)}</h2>
          <p class="potion-card__description">
            Temporarily increases ${escapeHtml(stat)} by ${effect}%.
          </p>
        </div>

        <div class="potion-card__details">
          <span class="badge badge--positive">+${effect}% ${escapeHtml(stat)}</span>
          <span class="badge badge--muted">60 seconds</span>
        </div>

        <p class="potion-card__chain">
          Craft with gems to reach Tier II and III.
        </p>

        <div class="potion-card__purchase">
          <span class="potion-card__price">${formatMoney(price)}</span>
          <button
            class="btn btn--primary"
            type="button"
            data-buy="${escapeHtml(potion.id)}"
            ${affordable ? "" : "disabled"}
          >${affordable ? "Buy potion" : "Not enough money"}</button>
        </div>
      </article>
    `;
  }).join("");

  for (const button of potionList.querySelectorAll("[data-buy]")) {
    button.addEventListener("click", () => buyPotion(button));
  }
}

function renderDailyShop() {
  const refreshed = Boolean(state.dailyOffers[0]?.refreshed);
  refreshDailyButton.disabled = refreshed || state.money < 2_000_000;
  refreshDailyButton.textContent = refreshed
    ? "Daily refresh used"
    : state.money < 2_000_000
    ? "Refresh slots 4–6 · Need $2M"
    : "Refresh slots 4–6 · $2M";

  if (!state.dailyOffers.length) {
    dailyShopList.innerHTML = '<div class="empty" style="grid-column:1/-1"><p class="empty__title">Daily stock unavailable</p><p>Refresh the page to try again.</p></div>';
    return;
  }

  dailyShopList.innerHTML = state.dailyOffers.map((offer) => {
    const remaining = Number(offer.remaining ?? 0);
    const affordable = state.money >= Number(offer.price);
    const soldOut = remaining <= 0;
    return `<article class="potion-card daily-offer daily-offer--slot-${offer.slot}">
      <div class="potion-card__head"><span class="potion-card__icon">${offer.contents?.some((item) => item.type === "relic") ? icons.gem : icons.potion}</span>
        <span class="badge ${offer.slot === 6 ? "badge--accent" : "badge--muted"}">Slot ${offer.slot}${offer.slot === 6 ? " · Rare" : ""}</span></div>
      <div><h2 class="potion-card__name">${escapeHtml(offer.name)}</h2><p class="potion-card__description">${escapeHtml(offer.description)}</p></div>
      <div class="potion-card__details"><span class="badge badge--positive">${formatCount(remaining)} remaining</span>${offer.refreshed && offer.slot >= 4 ? '<span class="badge badge--accent">Refreshed</span>' : ""}</div>
      <div class="potion-card__purchase"><span class="potion-card__price">${formatMoney(offer.price)}</span>
        <button class="btn btn--primary" data-buy-daily="${offer.slot}" ${soldOut || !affordable ? "disabled" : ""}>${soldOut ? "Sold out" : affordable ? "Buy offer" : "Not enough money"}</button></div>
    </article>`;
  }).join("");
}

async function buyPotion(button) {
  const potion = POTIONS.find((item) => item.id === button.dataset.buy);
  if (!potion) return;

  button.disabled = true;
  button.textContent = "Buying…";

  const { data, error } = await buyCloudConsumable(potion.id);

  if (error) {
    notify.error("Could not buy potion", error.message);
    await refresh();
    return;
  }

  notify.success("Potion purchased", `${potion.name} was added to your inventory.`);
  state.money = Number(data.money ?? state.money - potion.shop.price);

  const existing = state.consumables.find(
    (item) => item.consumable_id === potion.id
  );
  if (existing) {
    existing.quantity = Number(data.quantity ?? existing.quantity + 1);
  } else {
    state.consumables.push({
      consumable_id: potion.id,
      quantity: Number(data.quantity ?? 1)
    });
  }

  render();
}

async function refresh() {
  const user = await ensurePlayerAuth();
  if (!user) {
    state.loading = false;
    subtitle.textContent = "Could not sign you in. Refresh to try again.";
    notify.error("Sign-in failed", "The game could not reach your account.");
    return;
  }

  const [player, owned, daily] = await Promise.all([
    loadCloudPlayerState(),
    loadCloudConsumables(),
    loadDailyShop()
  ]);

  state.loading = false;
  if (player) state.money = player.money;
  if (owned) state.consumables = owned;
  if (!daily.error) state.dailyOffers = daily.data;
  else notify.error("Daily Shop unavailable", daily.error.message);
  render();
}

dailyShopList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-buy-daily]");
  if (!button || button.disabled) return;
  const slot = Number(button.dataset.buyDaily);
  const offer = state.dailyOffers.find((entry) => Number(entry.slot) === slot);
  if (!offer) return;
  button.disabled = true;
  button.textContent = "Buying…";
  const { data, error } = await buyDailyShopOffer(slot);
  if (error) {
    notify.error("Purchase failed", error.message);
    await refresh();
    return;
  }
  state.money = Number(data.money ?? state.money);
  offer.purchased = Number(data.purchased ?? offer.purchased + 1);
  offer.remaining = Number(data.remaining ?? Math.max(0, offer.remaining - 1));
  state.consumables = await loadCloudConsumables() ?? state.consumables;
  notify.success("Daily offer purchased", offer.name);
  render();
});

refreshDailyButton.addEventListener("click", async () => {
  if (refreshDailyButton.disabled) return;
  const choice = await confirmDialog({ title: "Refresh today's Shop?", body: "<p>This costs $2,000,000 and replaces slots 4–6. Slots 1–3 stay unchanged. You can refresh only once per day.</p>", confirmLabel: "Refresh for $2M" });
  if (choice !== "confirm") return;
  refreshDailyButton.disabled = true;
  const { data, error } = await refreshDailyShop();
  if (error) { notify.error("Refresh failed", error.message); await refresh(); return; }
  state.money = Number(data.money ?? state.money - 2_000_000);
  notify.success("Daily Shop refreshed", "Slots 4–6 have been replaced.");
  await refresh();
});

viewChancesButton.addEventListener("click", () => { shopChances.hidden = false; });
closeChancesButton.addEventListener("click", () => { shopChances.hidden = true; });

function updateCountdown() {
  const reset = state.dailyOffers[0]?.resets_at;
  if (!reset) { dailyCountdown.textContent = "Resets at 00:00 UTC"; return; }
  const seconds = Math.max(0, Math.floor((new Date(reset).getTime() - Date.now()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  dailyCountdown.textContent = `Resets in ${hours}h ${String(minutes).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
  if (seconds === 0) refresh();
}

setInterval(updateCountdown, 1000);

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  await refresh();
  refreshButton.disabled = false;
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted) refresh();
});

render();
refresh();
