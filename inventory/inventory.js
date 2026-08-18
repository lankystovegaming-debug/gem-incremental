import { ensurePlayerAuth } from "../src/backend/auth.js";
import {
  loadCloudGems,
  loadCloudPlayerState,
  toggleCloudGemLock,
  sellCloudGem,
  deleteCloudGem,
  upgradeCloudInventory
} from "../src/backend/cloudInventory.js";
import {
  loadCloudEquipment,
  setCloudEquipmentEquipped,
  enchantCloudEquipment
} from "../src/backend/cloudEquipment.js";
import {
  loadCloudConsumables,
  useCloudConsumable,
  loadActiveBoosts,
  loadPendingOneRollBoost
} from "../src/backend/cloudConsumables.js";
import { setShowcase, loadMyShowcase } from "../src/backend/cloudShowcase.js";
import { getConsumableById } from "../src/data/consumables.js";
import { getGemMutation } from "../src/data/mutations.js";
import { ENCHANTS, RELICS, enchantDescription, isRelic } from "../src/data/enchants.js";
import { getEquipmentPassive } from "../src/data/equipmentPassives.js";
import { gemRollChance, formatChance } from "../src/logic/chances.js";

import { mountShell } from "../src/ui/shell.js";
import { icons } from "../src/ui/icons.js";
import { notify } from "../src/ui/toast.js";
import { confirmDialog } from "../src/ui/dialog.js";
import { gemNameHtml } from "../src/ui/gemStyle.js";
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

function nextCapacityUpgrade(capacity) {
  const earlyUpgrades = {
    15: { to: 20, cost: 1000 },
    20: { to: 25, cost: 3000 },
    25: { to: 30, cost: 8000 },
    30: { to: 40, cost: 20000 }
  };

  if (earlyUpgrades[capacity]) {
    return earlyUpgrades[capacity];
  }

  const level = Math.max(0, Math.floor((capacity - 40) / 10));

  return {
    to: capacity + 10,
    cost: Math.round((50000 * (1.5 ** level)) / 1000) * 1000
  };
}


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
const potionsTab = document.getElementById("potionsTab");
const gemsSection = document.getElementById("gemsSection");
const equipmentSection = document.getElementById("equipmentSection");
const potionsSection = document.getElementById("potionsSection");

const inventoryList = document.getElementById("inventoryList");
const equipmentList = document.getElementById("equipmentList");
const consumableList = document.getElementById("consumableList");

const gemSearch = document.getElementById("gemSearch");
const gemFilter = document.getElementById("gemFilter");
const gemRarity = document.getElementById("gemRarity");
const gemSort = document.getElementById("gemSort");
const sellAllButton = document.getElementById("sellAllButton");
const deleteRulesButton = document.getElementById("deleteRulesButton");
const deleteRulesPanel = document.getElementById("deleteRulesPanel");
const deleteRulesClose = document.getElementById("deleteRulesClose");
const deleteRuleMode = document.getElementById("deleteRuleMode");
const deleteRarityField = document.getElementById("deleteRarityField");
const deleteRarityOp = document.getElementById("deleteRarityOp");
const deleteRarityValue = document.getElementById("deleteRarityValue");
const deleteChanceField = document.getElementById("deleteChanceField");
const deleteChanceOp = document.getElementById("deleteChanceOp");
const deleteChanceDenominator = document.getElementById("deleteChanceDenominator");
const deleteRulesPreview = document.getElementById("deleteRulesPreview");
const deleteMatchingButton = document.getElementById("deleteMatchingButton");

document.getElementById("refreshIcon").innerHTML = icons.refresh;
document.getElementById("searchIcon").innerHTML = icons.search;


// =========================================================
// STATE
// =========================================================

const state = {
  gems: [],
  equipment: [],
  consumables: [],
  boosts: [],
  oneRollBoost: null,
  capacity: 15,
  money: 0,
  loading: true,
  showcaseIds: []
};


// =========================================================
// TABS
// =========================================================

const TABS = [
  { id: "gems", tab: gemsTab, section: gemsSection },
  { id: "equipment", tab: equipmentTab, section: equipmentSection },
  { id: "potions", tab: potionsTab, section: potionsSection }
];

function selectTab(active) {
  for (const entry of TABS) {
    if (!entry.tab || !entry.section) {
      continue;
    }

    const on = entry.id === active;

    entry.tab.setAttribute("aria-selected", String(on));
    entry.section.classList.toggle("hidden", !on);
  }

  // Re-render potions on entry so a boost that expired while
  // another tab was open shows its current countdown.
  if (active === "potions" && !state.loading) {
    renderConsumables();
  }
}

for (const entry of TABS) {
  entry.tab?.addEventListener("click", () => selectTab(entry.id));
}


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

  const next = nextCapacityUpgrade(state.capacity);

  const affordable = state.money >= next.cost;

  capacityUpgradeInfo.textContent = affordable
    ? `Ready to expand to ${next.to} slots for ${formatMoney(next.cost)}.`
    : `${next.to} slots costs ${formatMoney(next.cost)} — ` +
      `${formatMoney(next.cost - state.money)} to go.`;

  capacityUpgradeButton.disabled = !affordable;
  capacityUpgradeButton.textContent = `Upgrade to ${next.to}`;
}


capacityUpgradeButton.addEventListener("click", async () => {
  const next = nextCapacityUpgrade(state.capacity);

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

    if (
      gemRarity.value !== "all" &&
      rarityTier(gem.rarity).id !== gemRarity.value
    ) {
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


function matchesDeleteRarity(gem) {
  const threshold = Math.max(1, Number(deleteRarityValue.value) || 1);
  return deleteRarityOp.value === "lte" ? Number(gem.rarity) <= threshold : Number(gem.rarity) >= threshold;
}

function matchesDeleteChance(gem) {
  const threshold = 1 / Math.max(1, Number(deleteChanceDenominator.value) || 1);
  const chance = gemRollChance(gem);
  return deleteChanceOp.value === "lte" ? chance <= threshold : chance >= threshold;
}

function matchesDeleteRule(gem) {
  if (gem.locked) return false;
  const rarityMatch = matchesDeleteRarity(gem);
  const chanceMatch = matchesDeleteChance(gem);
  if (deleteRuleMode.value === "rarity") return rarityMatch;
  if (deleteRuleMode.value === "chance") return chanceMatch;
  if (deleteRuleMode.value === "or") return rarityMatch || chanceMatch;
  return rarityMatch && chanceMatch;
}

function renderDeleteRules() {
  if (!deleteRulesPanel) return;
  const mode = deleteRuleMode.value;
  deleteRarityField.hidden = mode === "chance";
  deleteChanceField.hidden = mode === "rarity";
  const matches = state.gems.filter(matchesDeleteRule);
  deleteRulesPreview.textContent = `${formatCount(matches.length)} matching unlocked gem${matches.length === 1 ? "" : "s"}`;
  deleteMatchingButton.disabled = matches.length === 0 || state.loading;
  deleteRulesButton.disabled = state.loading || state.gems.length === 0;
}

function renderGems() {
  const gems = visibleGems();

  // Sell all operates on the current view, so the rarity / search /
  // lock filters double as a "sell only these" selector.
  const sellable = gems.filter((gem) => !gem.locked && !isRelic(gem));

  const filtered =
    gemSearch.value.trim() !== "" ||
    gemFilter.value !== "all" ||
    gemRarity.value !== "all";

  sellAllButton.disabled = sellable.length === 0;

  sellAllButton.textContent =
    sellable.length === 0
      ? "Sell unlocked"
      : `Sell ${formatCount(sellable.length)}${filtered ? " filtered" : " unlocked"}`;

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
  if (isRelic(gem)) return relicCard(gem);

  const tier = rarityTier(gem.rarity);
  const mutationIds = Array.isArray(gem.mutation_ids) && gem.mutation_ids.length
    ? gem.mutation_ids
    : (gem.mutation_id ? [gem.mutation_id] : []);
  const mutationMultipliers = gem.mutation_multipliers && typeof gem.mutation_multipliers === "object"
    ? gem.mutation_multipliers
    : {};
  const mutations = mutationIds.map(id => getGemMutation(id, mutationMultipliers[id] ?? null)).filter(Boolean);

  return `
    <article
      class="gem-card tier-${tier.id}${mutations.map(m => ` mutation-${m.id}`).join("")}${gem.locked ? " gem-card--locked" : ""}"
      data-id="${gem.id}"
    >
      <div class="gem-card__head">
        <div>
          <div class="gem-card__name">${mutations.length ? mutations.map(m => `<span class="mutation-inline mutation-inline--${escapeHtml(m.id)}">${escapeHtml(m.name)}</span>`).join(" ") + " " : ""}${gemNameHtml(gem.gem_name, escapeHtml)}</div>
          ${mutations.length ? `
            <div class="gem-mutation-line" aria-label="Mutations">
              ${mutations.map(m => `
                <span class="mutation-name-effect mutation-name-effect--${escapeHtml(m.id)}">
                  <span class="mutation-name-effect__fx" aria-hidden="true"></span>
                  <span class="mutation-name-effect__text">${escapeHtml(m.name)}</span>
                </span>
              `).join("")}
            </div>
          ` : ""}
          <div class="gem-card__rarity">${rarityLabel(gem.rarity)}</div>
          <div class="gem-card__chance">Actual chance: ${escapeHtml(formatChance(gemRollChance(gem)))}</div>
        </div>

        <div class="gem-card__badges">
          <span class="badge badge--tier">${tier.name}</span>
          ${mutations.map(m => `<span class="mutation-badge mutation-badge--${m.id}"><span class="mutation-name-effect mutation-name-effect--${m.id}"><span class="mutation-name-effect__fx" aria-hidden="true"></span><span class="mutation-name-effect__text">${escapeHtml(m.name)}</span></span> · ${formatMultiplier(m.multiplier)}</span>`).join("")}
        </div>
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

        <div class="gem-card__row">
          <span class="gem-card__key">Rolled at</span>
          <span class="gem-card__val">${
            gem.roll_number == null
              ? "—"
              : `${formatCount(gem.roll_number)} rolls`
          }</span>
        </div>

        <div class="gem-card__row">
          <span class="gem-card__key">Luck</span>
          <span class="gem-card__val">${
            gem.luck_at_roll == null
              ? "—"
              : formatMultiplier(gem.luck_at_roll)
          }</span>
        </div>
      </div>

      <div class="gem-card__actions">
        <button class="btn btn--sm${state.showcaseIds.includes(gem.id) ? " btn--primary" : ""}" data-action="showcase" type="button" title="Pin up to 3 gems to your profile &amp; leaderboard">
          ${state.showcaseIds.includes(gem.id) ? "★ Pinned" : "☆ Pin"}
        </button>

        <button class="btn btn--sm" data-action="lock" type="button">
          ${gem.locked ? icons.unlock : icons.lock}
          ${gem.locked ? "Unlock" : "Lock"}
        </button>

        <button class="btn btn--sm btn--danger" data-action="delete" type="button" ${gem.locked ? "disabled" : ""}>Delete</button>

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

function relicCard(gem) {
  const chance = RELICS[gem.gem_name].chance;
  return `
    <article class="gem-card gem-card--relic${gem.locked ? " gem-card--locked" : ""}" data-id="${gem.id}">
      <div class="gem-card__head"><div>
        <div class="gem-card__name">${escapeHtml(gem.gem_name)}</div>
        <div class="gem-card__rarity">RELIC</div>
        <div class="gem-card__chance">Flat chance: ${escapeHtml(formatChance(chance))} · unaffected by Luck</div>
      </div><span class="badge badge--accent">RELIC</span></div>
      <p class="equipment-card__meta">Consumed when enchanting an equipped pickaxe.</p>
      <div class="gem-card__actions">
        <button class="btn btn--sm" data-action="lock" type="button">
          ${gem.locked ? icons.unlock : icons.lock} ${gem.locked ? "Unlock" : "Lock"}
        </button>
        <button class="btn btn--sm btn--danger" data-action="delete" type="button" ${gem.locked ? "disabled" : ""}>Delete</button>
      </div>
    </article>`;
}


function wireGemCard(card) {
  const id = Number(card.dataset.id);

  const lockButton = card.querySelector('[data-action="lock"]');
  const sellButton = card.querySelector('[data-action="sell"]');
  const deleteButton = card.querySelector('[data-action="delete"]');
  const showcaseButton = card.querySelector('[data-action="showcase"]');

  showcaseButton?.addEventListener("click", async () => {
    const isPinned = state.showcaseIds.includes(id);

    if (!isPinned && state.showcaseIds.length >= 3) {
      notify.error("Showcase full", "You can pin only 3 gems — unpin one first.");
      return;
    }

    const next = isPinned
      ? state.showcaseIds.filter((entry) => entry !== id)
      : [...state.showcaseIds, id];

    showcaseButton.disabled = true;

    const { error } = await setShowcase(next);

    if (error) {
      notify.error("Could not update showcase", error.message);
      showcaseButton.disabled = false;
      return;
    }

    state.showcaseIds = next;
    notify.success(
      isPinned ? "Unpinned" : "Pinned to showcase",
      isPinned ? "Removed from your profile." : "It now shows next to your name."
    );
    renderGems();
  });

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

  deleteButton?.addEventListener("click", async () => {
    const gem = state.gems.find((entry) => entry.id === id);
    if (!gem || gem.locked) return;
    const choice = await confirmDialog({ title: `Delete ${gem.gem_name}?`, body: `<p>This permanently deletes the gem. You will receive no money.</p>`, confirmLabel: "Delete permanently", tone: "danger" });
    if (choice !== "confirm") return;
    deleteButton.disabled = true; lockButton.disabled = true; if (sellButton) sellButton.disabled = true;
    const { error } = await deleteCloudGem(id);
    if (error) { notify.error("Could not delete that gem", error.message); deleteButton.disabled = false; lockButton.disabled = false; if (sellButton) sellButton.disabled = false; return; }
    state.gems = state.gems.filter((entry) => entry.id !== id);
    renderAll();
    notify.success("Gem deleted", gem.gem_name);
  });

  sellButton?.addEventListener("click", async () => {
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
  // The visible (filtered) unlocked gems — so a rarity / search
  // filter narrows exactly what gets sold.
  const unlocked = visibleGems().filter((gem) => !gem.locked && !isRelic(gem));

  if (unlocked.length === 0) {
    return;
  }

  const filtered =
    gemSearch.value.trim() !== "" ||
    gemFilter.value !== "all" ||
    gemRarity.value !== "all";

  const total = unlocked.reduce((sum, gem) => sum + Number(gem.value), 0);

  const choice = await confirmDialog({
    title: `Sell ${formatCount(unlocked.length)} gems?`,
    body: `
      <p>
        ${
          filtered
            ? "Every unlocked gem matching your current filters"
            : "Every unlocked gem"
        } will be sold for a total of about
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


deleteRulesButton?.addEventListener("click", () => { deleteRulesPanel.hidden = false; renderDeleteRules(); });
deleteRulesClose?.addEventListener("click", () => { deleteRulesPanel.hidden = true; });
for (const control of [deleteRuleMode, deleteRarityOp, deleteRarityValue, deleteChanceOp, deleteChanceDenominator]) { control?.addEventListener("input", renderDeleteRules); control?.addEventListener("change", renderDeleteRules); }
deleteMatchingButton?.addEventListener("click", async () => {
  const matches = state.gems.filter(matchesDeleteRule);
  if (!matches.length) return;
  const choice = await confirmDialog({ title: `Delete ${formatCount(matches.length)} gems?`, body: `<p>All matching unlocked gems will be permanently deleted. You will receive no money.</p>`, confirmLabel: `Delete ${formatCount(matches.length)}`, tone: "danger" });
  if (choice !== "confirm") return;
  deleteMatchingButton.disabled = true;
  let deleted = 0;
  for (const gem of matches) {
    const { error } = await deleteCloudGem(gem.id);
    if (error) { notify.error("Bulk delete stopped", error.message); break; }
    deleted += 1; state.gems = state.gems.filter((entry) => entry.id !== gem.id);
  }
  renderAll();
  if (deleted) notify.success("Gems deleted", `${formatCount(deleted)} permanently deleted.`);
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
      const enchant = ENCHANTS[item.enchant_id];
      const passive = getEquipmentPassive(item.equipment_id);
      const canEnchant = item.category === "pickaxe" && item.equipped &&
        state.gems.some((gem) => isRelic(gem) && !gem.locked);

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

          ${passive ? `<div class="equipment-passive">
            <strong>${escapeHtml(passive.name)}</strong>
            <span>${escapeHtml(passive.description)}</span>
          </div>` : ""}

          ${enchant ? `<div class="equipment-enchant">
            <strong>${escapeHtml(enchant.name)}</strong>
            <span>${escapeHtml(enchantDescription(item.enchant_id, item.enchant_grade))}</span>
          </div>` : item.category === "pickaxe" ? '<div class="equipment-enchant equipment-enchant--empty">No enchant</div>' : ""}

          <div class="equipment-card__actions">
          <button class="btn ${item.equipped ? "btn--danger" : "btn--primary"}"
            type="button" data-equipment-id="${escapeHtml(item.id)}"
            data-equipment-equipped="${item.equipped}">
            ${item.equipped ? "Unequip" : "Equip"}
          </button>
          ${canEnchant ? `<button class="btn btn--primary" type="button" data-enchant-equipment-id="${escapeHtml(item.id)}">Enchant</button>` : ""}
          </div>
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

equipmentList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-enchant-equipment-id]");
  if (!button || button.disabled) return;

  const equipment = state.equipment.find((item) => String(item.id) === button.dataset.enchantEquipmentId);
  if (!equipment) return;
  const normal = state.gems.find((gem) => gem.gem_name === "Enchant Relic" && !gem.locked);
  const ancient = state.gems.find((gem) => gem.gem_name === "Ancient Relic" && !gem.locked);
  if (!normal && !ancient) { renderEquipment(); return; }

  const current = ENCHANTS[equipment.enchant_id]?.name ?? "None";
  const both = Boolean(normal && ancient);
  const choice = await confirmDialog({
    title: `Enchant ${equipment.name}?`,
    body: `<p>Current enchant: <strong>${escapeHtml(current)}</strong></p><p style="margin-top:8px">The relic is consumed. A reroll always replaces the current enchant with a different one.</p>`,
    confirmLabel: ancient ? "Use Ancient Relic" : "Use Enchant Relic",
    extraLabel: both ? "Use Enchant Relic" : null
  });
  if (choice === "cancel") return;
  const relic = choice === "extra" ? normal : (ancient ?? normal);
  if (!relic) return;

  button.disabled = true;
  button.textContent = "Enchanting…";
  const result = await enchantCloudEquipment(equipment.id, relic.id);
  if (!result.success) {
    notify.error("Enchanting failed", result.message);
    renderEquipment();
    return;
  }

  equipment.enchant_id = result.data.enchantId;
  equipment.enchant_grade = result.data.grade;
  equipment.enchant_state = {};
  state.gems = state.gems.filter((gem) => gem.id !== relic.id);
  renderAll();
  notify.success("Pickaxe enchanted", ENCHANTS[result.data.enchantId]?.name ?? "New enchant applied");
});


// =========================================================
// POTIONS
// =========================================================

const POTION_STATS = {
  luck: "Luck",
  rollSpeed: "Roll speed",
  weightLuck: "Weight luck",
  weightMultiplier: "Weight multiplier"
};

const POTION_NUMERALS = ["", "I", "II", "III"];

let boostTicker = null;


function totalPotions() {
  return state.consumables.reduce(
    (sum, row) => sum + Number(row.quantity ?? 0),
    0
  );
}


function activeBoost(family) {
  return state.boosts.find(
    (boost) =>
      boost.family === family &&
      new Date(boost.expires_at).getTime() > Date.now()
  );
}


function formatRemaining(expiresAt) {
  const seconds = Math.max(
    0,
    Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)
  );

  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(
      2,
      "0"
    )}s`;
  }

  return `${seconds}s`;
}


function startBoostTicker() {
  if (boostTicker) {
    return;
  }

  boostTicker = setInterval(() => {
    const live = state.boosts.some(
      (boost) => new Date(boost.expires_at).getTime() > Date.now()
    );

    if (!potionsSection.classList.contains("hidden")) {
      renderConsumables();
    }

    if (!live) {
      clearInterval(boostTicker);

      boostTicker = null;
    }
  }, 1000);
}


function renderActiveBoosts() {
  const live = state.boosts.filter(
    (boost) => new Date(boost.expires_at).getTime() > Date.now()
  );

  if (live.length === 0) {
    return "";
  }

  return `
    <div class="active-boosts" style="grid-column:1/-1">
      <div class="active-boosts__label">${icons.bolt} Active effects</div>

      <div class="active-boosts__list">
        ${live
          .map(
            (boost) => `
              <span class="active-boost">
                <strong>+${Math.round(
                  Number(boost.effect_value) * 100
                )}% ${escapeHtml(
              POTION_STATS[boost.family] ?? boost.family
            )}</strong>
                <span class="active-boost__time">${formatRemaining(
                  boost.expires_at
                )}</span>
              </span>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}


function renderConsumables() {
  if (!consumableList) {
    return;
  }

  if (state.loading) {
    consumableList.innerHTML = Array.from(
      { length: 4 },
      () => '<div class="skeleton skeleton--card"></div>'
    ).join("");

    return;
  }

  const owned = state.consumables
    .map((row) => ({ row, def: getConsumableById(row.consumable_id) }))
    .filter((entry) => entry.def && Number(entry.row.quantity) > 0)
    .sort(
      (a, b) =>
        a.def.family.localeCompare(b.def.family) || a.def.tier - b.def.tier
    );

  if (owned.length === 0) {
    consumableList.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        ${icons.potion ?? icons.sparkle}
        <p class="empty__title">No potions yet</p>
        <p>Buy Tier 1 potions in the shop, then craft them up.</p>
        <a class="btn btn--primary" href="../boosts/" style="margin-top:8px">
          Open potion shop
        </a>
      </div>
    `;

    return;
  }

  consumableList.innerHTML =
    renderActiveBoosts() +
    owned
      .map(({ row, def }) => {
        const stat = POTION_STATS[def.family] ?? def.family;
        const active = def.oneRoll ? state.oneRollBoost : activeBoost(def.family);

        return `
        <article class="potion-owned tier-badge-${def.tier}">
          <div class="potion-owned__head">
            <span class="potion-owned__icon">${icons.potion ?? icons.sparkle}</span>
            <span class="badge badge--muted">×${formatCount(row.quantity)}</span>
          </div>

          <div class="potion-owned__name">${escapeHtml(def.name)}</div>

          <div class="potion-owned__meta">
            <span class="badge badge--positive">+${Math.round(
              def.effectValue * 100
            )}% ${escapeHtml(stat)}</span>
            <span class="badge badge--muted">Tier ${def.tier}</span>
          </div>

          <p class="potion-owned__note">
            ${
              def.oneRoll && active
                ? `${escapeHtml(getConsumableById(active.consumable_id)?.name ?? "One-roll potion")} is waiting for your next successful roll.`
                : active
                ? `${escapeHtml(stat)} boost active — ${escapeHtml(
                    formatRemaining(active.expires_at)
                  )} left.`
                : def.oneRoll
                ? "Applies to your next successful roll and does not expire."
                : def.tier < 3
                ? `Craft with gems to reach ${escapeHtml(
                    `${def.name.split(" ").slice(0, -1).join(" ")} ${
                      POTION_NUMERALS[def.tier + 1]
                    }`
                  )}.`
                : "Highest tier for this family."
            }
          </p>

          <button
            class="btn btn--primary btn--sm btn--block"
            type="button"
            data-use="${escapeHtml(def.id)}"
            ${def.oneRoll && active ? "disabled" : ""}
          >
            ${icons.potion ?? icons.sparkle}
            ${def.oneRoll && active ? "One-roll boost pending" : active ? "Extend boost" : "Use potion"}
          </button>
        </article>
      `;
      })
      .join("");

  for (const button of consumableList.querySelectorAll("[data-use]")) {
    button.addEventListener("click", () => usePotion(button));
  }
}


async function usePotion(button) {
  const def = getConsumableById(button.dataset.use);

  if (!def) {
    return;
  }

  button.disabled = true;

  const { data, error } = await useCloudConsumable(def.id);

  if (error) {
    notify.error("Could not use potion", error.message);

    button.disabled = false;

    return;
  }

  const row = state.consumables.find(
    (entry) => entry.consumable_id === def.id
  );

  if (row) {
    row.quantity = Number(data?.quantity ?? Math.max(0, row.quantity - 1));
  }

  const boost = data?.boost;

  if (def.oneRoll && boost) {
    state.oneRollBoost = {
      consumable_id: def.id,
      effect_value: boost.effectValue,
      activated_at: boost.activatedAt
    };
  }

  if (boost && !def.oneRoll) {
    const existing = state.boosts.find((entry) => entry.family === boost.family);

    if (existing) {
      existing.effect_value = boost.effectValue;
      existing.tier = boost.tier;
      existing.expires_at = boost.expiresAt;
    } else {
      state.boosts.push({
        family: boost.family,
        tier: boost.tier,
        effect_value: boost.effectValue,
        expires_at: boost.expiresAt
      });
    }
  }

  notify.success(
    "Potion used",
    def.oneRoll
      ? `+${Math.round(Number(boost?.effectValue ?? def.effectValue) * 100)}% Luck is ready for your next successful roll.`
      : `+${Math.round(Number(boost?.effectValue ?? def.effectValue) * 100)}% ${
          POTION_STATS[def.family] ?? def.family
        } for 60 seconds.`
  );

  startBoostTicker();

  renderAll();
}


// =========================================================
// RENDER
// =========================================================

function renderAll() {
  shell.setWallet(state.money);

  subtitle.textContent = state.loading
    ? "Loading your collection…"
    : `${formatCount(state.gems.length)} gems · ` +
      `${formatCount(state.equipment.length)} equipment · ` +
      `${formatCount(totalPotions())} potions`;

  renderCapacity();
  renderGems();
  renderEquipment();
  renderConsumables();
}


for (const control of [gemSearch, gemFilter, gemRarity, gemSort]) {
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

  const [gems, playerState, equipment, potions, boosts, oneRollBoost, showcase] = await Promise.all([
    loadCloudGems(),
    loadCloudPlayerState(),
    loadCloudEquipment(),
    loadCloudConsumables(),
    loadActiveBoosts(),
    loadPendingOneRollBoost(),
    loadMyShowcase()
  ]);

  state.loading = false;

  if (gems) {
    state.gems = gems;
  }

  state.showcaseIds = (Array.isArray(showcase) ? showcase : [])
    .map((entry) => Number(entry?.id))
    .filter((id) => Number.isFinite(id));

  if (playerState) {
    state.capacity = playerState.inventory_capacity;
    state.money = playerState.money;
  }

  if (equipment) {
    state.equipment = equipment;
  }

  if (potions) {
    state.consumables = potions;
  }

  if (boosts) {
    state.boosts = boosts;

    if (boosts.length > 0) {
      startBoostTicker();
    }
  }

  state.oneRollBoost = oneRollBoost;

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
