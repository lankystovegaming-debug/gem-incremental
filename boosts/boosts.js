import consumables from "../src/data/consumables.js";
import { ensurePlayerAuth } from "../src/backend/auth.js";
import { loadCloudPlayerState } from "../src/backend/cloudInventory.js";
import {
  buyCloudConsumable,
  loadCloudConsumables
} from "../src/backend/cloudConsumables.js";
import { mountShell } from "../src/ui/shell.js";
import { icons } from "../src/ui/icons.js";
import { formatCount, formatMoney, escapeHtml } from "../src/ui/format.js";
import { notify } from "../src/ui/toast.js";


const shell = mountShell({ page: "boosts", base: "../" });
const potionList = document.getElementById("potionList");
const subtitle = document.getElementById("shopSubtitle");
const refreshButton = document.getElementById("refreshButton");

document.getElementById("refreshIcon").innerHTML = icons.refresh;
document.getElementById("shopNoteIcon").innerHTML = icons.potion;

const state = {
  money: 0,
  consumables: [],
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
    return;
  }

  subtitle.textContent =
    `${formatCount(POTIONS.length)} Tier 1 potions · ${formatMoney(state.money)} available`;

  potionList.innerHTML = POTIONS.map((potion) => {
    const price = potion.shop.price;
    const affordable = state.money >= price;
    const stat = STAT_NAMES[potion.family] ?? potion.family;

    return `
      <article class="potion-card potion-card--${escapeHtml(potion.family)}">
        <div class="potion-card__head">
          <span class="potion-card__icon">${icons.potion}</span>
          <span class="potion-card__owned">Owned ×${formatCount(ownedQuantity(potion.id))}</span>
        </div>

        <div>
          <h2 class="potion-card__name">${escapeHtml(potion.name)}</h2>
          <p class="potion-card__description">
            Temporarily increases ${escapeHtml(stat)} by
            ${formatCount(potion.effectValue * 100)}%.
          </p>
        </div>

        <div class="potion-card__details">
          <span class="badge badge--positive">+${formatCount(potion.effectValue * 100)}% ${escapeHtml(stat)}</span>
          <span class="badge badge--muted">60 seconds</span>
        </div>

        <div class="potion-card__purchase">
          <span class="potion-card__price">${formatMoney(price)}</span>
          <button
            class="btn btn--primary"
            type="button"
            data-buy="${escapeHtml(potion.id)}"
            ${affordable ? "" : "disabled"}
          >Buy potion</button>
        </div>
      </article>
    `;
  }).join("");

  for (const button of potionList.querySelectorAll("[data-buy]")) {
    button.addEventListener("click", () => buyPotion(button));
  }
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

  const [player, owned] = await Promise.all([
    loadCloudPlayerState(),
    loadCloudConsumables()
  ]);

  state.loading = false;
  if (player) state.money = player.money;
  if (owned) state.consumables = owned;
  render();
}

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
