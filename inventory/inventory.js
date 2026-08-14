import { ensurePlayerAuth } from "../src/backend/auth.js";
import {
  loadCloudGems,
  loadCloudPlayerState,
  toggleCloudGemLock,
  sellCloudGem,
  upgradeCloudInventory
} from "../src/backend/cloudInventory.js";
import {
  loadCloudEquipment,
  setCloudEquipmentEquipped
} from "../src/backend/cloudEquipment.js";

import { mountShell } from "../src/ui/shell.js";
import { icons } from "../src/ui/icons.js";
import { notify } from "../src/ui/toast.js";
import { confirmDialog } from "../src/ui/dialog.js";
import {
  rarityTier,
  rarityLabel,
  formatMoney,
  formatWeight,
  formatMultiplier,
  formatCount,
  formatRelativeTime,
  escapeHtml
} from "../src/ui/format.js";


const shell = mountShell({ page: "inventory", base: "../" });


// =========================================================
// CAPACITY UPGRADES
//
// Mirrors the server-side table. The server re-checks the
// price, so this is only for display.
// =========================================================

const CAPACITY_UPGRADES = [
  { from: 15, to: 20, cost: 1000 },
  { from: 20, to: 25, cost: 3000 },
  { from: 25, to: 30, cost: 8000 },
  { from: 30, to: 40, cost: 20000 },
  { from: 40, to: 50, cost: 50000 }
];


// =========================================================
// DOM
// =========================================================

const subtitle = document.getElementById("inventorySubtitle");
const refreshButton = document.getElementById("refreshButton");

const capacityUsed = document.getElementById("capacityUsed");
const capacityTotal = document.getElementById("capacityTotal");
const capacityMeter = document.getElementById("capacityMeter");
const capacityUpgradeInfo = document.getElementById("capacityUpgradeInfo");
const capacityUpgradeButton = document.getElementById("capacityUpgradeButton");

const gemsTab = document.getElementById("gemsTab");
const equipmentTab = document.getElementById("equipmentTab");
const gemsSection = document.getElementById("gemsSection");
const equipmentSection = document.getElementById("equipmentSection");

const inventoryList = document.getElementById("inventoryList");
const equipmentList = document.getElementById("equipmentList");

const gemSearch = document.getElementById("gemSearch");
const gemFilter = document.getElementById("gemFilter");
const gemSort = document.getElementById("gemSort");
const sellAllButton = document.getElementById("sellAllButton");

document.getElementById("refreshIcon").innerHTML = icons.refresh;
document.getElementById("searchIcon").innerHTML = icons.search;


// =========================================================
// STATE
// =========================================================

const state = {
  gems: [],
  equipment: [],
  capacity: 15,
  money: 0,
  loading: true
};


// =========================================================
// TABS
// =========================================================

function selectTab(tab) {
  const gems = tab === "gems";

  gemsTab.setAttribute("aria-selected", String(gems));
  equipmentTab.setAttribute("aria-selected", String(!gems));

  gemsSection.classList.toggle("hidden", !gems);
  equipmentSection.classList.toggle("hidden", gems);
}

gemsTab.addEventListener("click", () => selectTab("gems"));
equipmentTab.addEventListener("click", () => selectTab("equipment"));


// =========================================================
// CAPACITY
// =========================================================

function renderCapacity() {
  capacityUsed.textContent = formatCount(state.gems.length);
  capacityTotal.textContent = formatCount(state.capacity);

  const filled = state.capacity
    ? Math.min(100, (state.gems.length / state.capacity) * 100)
    : 0;

  capacityMeter.style.width = `${filled}%`;

  capacityMeter.className =
    "meter__fill" +
    (filled >= 100
      ? " meter__fill--negative"
      : filled >= 80
      ? " meter__fill--warning"
      : "");

  const next = CAPACITY_UPGRADES.find(
    (upgrade) => upgrade.from === state.capacity
  );

  if (!next) {
    capacityUpgradeInfo.textContent = "Maximum storage reached.";

    capacityUpgradeButton.disabled = true;
    capacityUpgradeButton.textContent = "Maxed";

    return;
  }

  const affordable = state.money >= next.cost;

  capacityUpgradeInfo.textContent = affordable
    ? `Ready to expand to ${next.to} slots for ${formatMoney(next.cost)}.`
    : `${next.to} slots costs ${formatMoney(next.cost)} — ` +
      `${formatMoney(next.cost - state.money)} to go.`;

  capacityUpgradeButton.disabled = !affordable;
  capacityUpgradeButton.textContent = `Upgrade to ${next.to}`;
}


capacityUpgradeButton.addEventListener("click", async () => {
  const next = CAPACITY_UPGRADES.find(
    (upgrade) => upgrade.from === state.capacity
  );

  if (!next) {
    return;
  }

  const choice = await confirmDialog({
    title: `Expand storage to ${next.to} slots?`,
    body: `<p>This costs ${escapeHtml(
      formatMoney(next.cost)
    )} and cannot be undone.</p>`,
    confirmLabel: "Buy upgrade"
  });

  if (choice !== "confirm") {
    return;
  }

  capacityUpgradeButton.disabled = true;

  const { error } = await upgradeCloudInventory();

  if (error) {
    notify.error("Upgrade failed", error.message);

    renderCapacity();

    return;
  }

  notify.success("Storage expanded", `You now have ${next.to} slots.`);

  await refresh();
});


// =========================================================
// GEM LIST
// =========================================================

function visibleGems() {
  const query = gemSearch.value.trim().toLowerCase();

  let gems = state.gems.filter((gem) => {
    if (query && !gem.gem_name.toLowerCase().includes(query)) {
      return false;
    }

    if (gemFilter.value === "locked" && !gem.locked) {
      return false;
    }

    if (gemFilter.value === "unlocked" && gem.locked) {
      return false;
    }

    return true;
  });

  const sorters = {
    newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
    oldest: (a, b) => new Date(a.created_at) - new Date(b.created_at),
    value: (a, b) => b.value - a.value,
    rarity: (a, b) => b.rarity - a.rarity,
    weight: (a, b) => b.final_weight - a.final_weight
  };

  gems = [...gems].sort(sorters[gemSort.value] ?? sorters.newest);

  return gems;
}


function renderGems() {
  const gems = visibleGems();

  const unlocked = state.gems.filter((gem) => !gem.locked);

  sellAllButton.disabled = unlocked.length === 0;

  sellAllButton.textContent =
    unlocked.length === 0
      ? "Sell unlocked"
      : `Sell ${formatCount(unlocked.length)} unlocked`;

  if (state.loading) {
    inventoryList.innerHTML = Array.from(
      { length: 6 },
      () => '<div class="skeleton skeleton--card"></div>'
    ).join("");

    return;
  }

  if (state.gems.length === 0) {
    inventoryList.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        ${icons.bag}
        <p class="empty__title">No gems yet</p>
        <p>Head back to the deposit and roll your first specimen.</p>
        <a class="btn btn--primary" href="../" style="margin-top:8px">Start rolling</a>
      </div>
    `;

    return;
  }

  if (gems.length === 0) {
    inventoryList.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        ${icons.search}
        <p class="empty__title">Nothing matches</p>
        <p>Try a different search or filter.</p>
      </div>
    `;

    return;
  }

  inventoryList.innerHTML = gems.map(gemCard).join("");

  for (const card of inventoryList.querySelectorAll(".gem-card")) {
    wireGemCard(card);
  }
}


function gemCard(gem) {
  const tier = rarityTier(gem.rarity);

  return `
    <article
      class="gem-card tier-${tier.id}${gem.locked ? " gem-card--locked" : ""}"
      data-id="${gem.id}"
    >
      <div class="gem-card__head">
        <div>
          <div class="gem-card__name">${escapeHtml(gem.gem_name)}</div>
          <div class="gem-card__rarity">${rarityLabel(gem.rarity)}</div>
        </div>

        <span class="badge badge--tier">${tier.name}</span>
      </div>

      <div class="gem-card__rows">
        <div class="gem-card__row">
          <span class="gem-card__key">Weight</span>
          <span class="gem-card__val">${formatWeight(gem.final_weight)}</span>
        </div>

        <div class="gem-card__row">
          <span class="gem-card__key">Multiplier</span>
          <span class="gem-card__val">${formatMultiplier(
            gem.rolled_weight_multiplier
          )}</span>
        </div>

        <div class="gem-card__row">
          <span class="gem-card__key">Value</span>
          <span class="gem-card__val gem-card__val--money">${formatMoney(
            gem.value
          )}</span>
        </div>

        <div class="gem-card__row">
          <span class="gem-card__key">Found</span>
          <span class="gem-card__val">${escapeHtml(
            formatRelativeTime(gem.created_at)
          )}</span>
        </div>
      </div>

      <div class="gem-card__actions">
        <button class="btn btn--sm" data-action="lock" type="button">
          ${gem.locked ? icons.unlock : icons.lock}
          ${gem.locked ? "Unlock" : "Lock"}
        </button>

        <button
          class="btn btn--sm btn--danger"
          data-action="sell"
          type="button"
          ${gem.locked ? "disabled" : ""}
          title="${gem.locked ? "Unlock this gem before selling" : ""}"
        >
          Sell
        </button>
      </div>
    </article>
  `;
}


function wireGemCard(card) {
  const id = Number(card.dataset.id);

  const lockButton = card.querySelector('[data-action="lock"]');
  const sellButton = card.querySelector('[data-action="sell"]');

  lockButton.addEventListener("click", async () => {
    lockButton.disabled = true;

    const { error } = await toggleCloudGemLock(id);

    if (error) {
      notify.error("Could not change the lock", error.message);

      lockButton.disabled = false;

      return;
    }

    const gem = state.gems.find((entry) => entry.id === id);

    if (gem) {
      gem.locked = !gem.locked;
    }

    renderGems();
  });

  sellButton.addEventListener("click", async () => {
    const gem = state.gems.find((entry) => entry.id === id);

    if (!gem || gem.locked) {
      return;
    }

    sellButton.disabled = true;
    lockButton.disabled = true;

    const { data, error } = await sellCloudGem(id);

    if (error) {
      notify.error("Could not sell that gem", error.message);

      sellButton.disabled = false;
      lockButton.disabled = false;

      return;
    }

    state.money = Number(data?.money ?? state.money);

    card.classList.add("gem-card--leaving");

    setTimeout(() => {
      state.gems = state.gems.filter((entry) => entry.id !== id);

      renderAll();
    }, 180);

    notify.success(
      `Sold ${gem.gem_name}`,
      `+${formatMoney(data?.soldValue ?? gem.value)}`
    );
  });
}


// =========================================================
// BULK SELL
// =========================================================

sellAllButton.addEventListener("click", async () => {
  const unlocked = state.gems.filter((gem) => !gem.locked);

  if (unlocked.length === 0) {
    return;
  }

  const total = unlocked.reduce((sum, gem) => sum + Number(gem.value), 0);

  const choice = await confirmDialog({
    title: `Sell ${formatCount(unlocked.length)} gems?`,
    body: `
      <p>
        Every unlocked gem will be sold for a total of about
        <strong>${escapeHtml(formatMoney(total))}</strong>.
      </p>
      <p style="margin-top:10px">
        Locked gems are kept. This cannot be undone.
      </p>
    `,
    confirmLabel: "Sell them all",
    tone: "danger"
  });

  if (choice !== "confirm") {
    return;
  }

  sellAllButton.disabled = true;

  let sold = 0;
  let earned = 0;

  for (const gem of unlocked) {
    sellAllButton.textContent = `Selling ${sold + 1} of ${unlocked.length}…`;

    const { data, error } = await sellCloudGem(gem.id);

    if (error) {
      notify.error("Bulk sell stopped", error.message);

      break;
    }

    sold += 1;
    earned += Number(data?.soldValue ?? gem.value);

    state.money = Number(data?.money ?? state.money);
    state.gems = state.gems.filter((entry) => entry.id !== gem.id);
  }

  renderAll();

  if (sold > 0) {
    notify.success(
      `Sold ${formatCount(sold)} gems`,
      `+${formatMoney(earned)}`
    );
  }
});


// =========================================================
// EQUIPMENT LIST
// =========================================================

const BONUS_LABELS = [
  ["luck_bonus", "Luck"],
  ["roll_speed_bonus", "Roll speed"],
  ["weight_luck_bonus", "Weight luck"],
  ["weight_multiplier_bonus", "Weight multiplier"]
];


function renderEquipment() {
  if (state.loading) {
    equipmentList.innerHTML = Array.from(
      { length: 3 },
      () => '<div class="skeleton skeleton--card"></div>'
    ).join("");

    return;
  }

  if (state.equipment.length === 0) {
    equipmentList.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        ${icons.anvil}
        <p class="empty__title">No equipment yet</p>
        <p>Craft your first tool to start improving your rolls.</p>
        <a class="btn btn--primary" href="../crafting/" style="margin-top:8px">
          Open crafting
        </a>
      </div>
    `;

    return;
  }

  equipmentList.innerHTML = state.equipment
    .map((item) => {
      const bonuses = BONUS_LABELS.filter(
        ([key]) => Number(item[key] ?? 0) !== 0
      ).map(
        ([key, label]) =>
          `<span class="badge badge--positive">+${(
            Number(item[key]) * 100
          ).toFixed(0)}% ${label}</span>`
      );

      return `
        <article class="equipment-card">
          <div class="equipment-card__head">
            <div>
              <div class="equipment-card__name">${escapeHtml(item.name)}</div>
              <div class="equipment-card__meta">
                ${escapeHtml(item.category)} · Tier ${escapeHtml(
        String(item.tier)
      )}
              </div>
            </div>

            ${
              item.equipped
                ? `<span class="badge badge--accent">${icons.check} Equipped</span>`
                : '<span class="badge badge--muted">Stored</span>'
            }
          </div>

          <div class="bonus-list">
            ${bonuses.join("") || '<span class="badge badge--muted">No bonus</span>'}
          </div>

          <button class="btn ${item.equipped ? "btn--danger" : "btn--primary"} btn--block"
            type="button" data-equipment-id="${escapeHtml(item.id)}"
            data-equipment-equipped="${item.equipped}">
            ${item.equipped ? "Unequip" : "Equip"}
          </button>
        </article>
      `;
    })
    .join("");
}


equipmentList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-equipment-id]");

  if (!button || button.disabled) {
    return;
  }

  const equipment = state.equipment.find(
    (item) => String(item.id) === button.dataset.equipmentId
  );

  if (!equipment) {
    return;
  }

  const shouldEquip = !equipment.equipped;

  button.disabled = true;
  button.textContent = shouldEquip ? "Equipping…" : "Unequipping…";

  const result = await setCloudEquipmentEquipped(equipment.id, shouldEquip);

  if (!result.success) {
    button.disabled = false;
    button.textContent = shouldEquip ? "Equip" : "Unequip";
    notify.error("Could not update equipment", result.message);
    return;
  }

  if (shouldEquip) {
    for (const item of state.equipment) {
      if (item.category === equipment.category) {
        item.equipped = item.id === equipment.id;
      }
    }
  } else {
    equipment.equipped = false;
  }

  renderEquipment();
  notify.success(
    shouldEquip ? "Equipment equipped" : "Equipment unequipped",
    `${equipment.name} is now ${shouldEquip ? "equipped" : "stored"}.`
  );
});


// =========================================================
// RENDER
// =========================================================

function renderAll() {
  shell.setWallet(state.money);

  subtitle.textContent = state.loading
    ? "Loading your collection…"
    : `${formatCount(state.gems.length)} gems · ` +
      `${formatCount(state.equipment.length)} equipment · ` +
      `${formatMoney(state.money)}`;

  renderCapacity();
  renderGems();
  renderEquipment();
}


for (const control of [gemSearch, gemFilter, gemSort]) {
  control.addEventListener("input", renderGems);
}


// =========================================================
// LOAD
// =========================================================

async function refresh() {
  const user = await ensurePlayerAuth();

  if (!user) {
    state.loading = false;

    subtitle.textContent = "Could not sign you in. Refresh to try again.";

    notify.error("Sign-in failed", "The game could not reach your account.");

    return;
  }

  const [gems, playerState, equipment] = await Promise.all([
    loadCloudGems(),
    loadCloudPlayerState(),
    loadCloudEquipment()
  ]);

  state.loading = false;

  if (gems) {
    state.gems = gems;
  }

  if (playerState) {
    state.capacity = playerState.inventory_capacity;
    state.money = playerState.money;
  }

  if (equipment) {
    state.equipment = equipment;
  }

  renderAll();
}


refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;

  await refresh();

  refreshButton.disabled = false;
});


window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    refresh();
  }
});


renderAll();
refresh();
