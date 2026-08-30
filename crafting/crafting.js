import recipes from "../src/data/recipes.js";
import { getConsumableById } from "../src/data/consumables.js";

import {
  createCraftingState,
  ensureRecipeProgress,
  isRequirementComplete
} from "../src/logic/crafting.js";

import { ensurePlayerAuth } from "../src/backend/auth.js";
import {
  loadCloudCraftingState,
  manuallyDepositCloudRequirement,
  craftCloudRecipe,
  craftCloudConsumableRecipe,
  setCloudAutoCraft,
  loadCloudConsumables
} from "../src/backend/cloudCrafting.js";
import { loadCloudEquipment } from "../src/backend/cloudEquipment.js";
import { loadCloudPlayerState } from "../src/backend/cloudInventory.js";

import { mountShell } from "../src/ui/shell.js";
import { icons } from "../src/ui/icons.js";
import { notify } from "../src/ui/toast.js";
import {
  formatMoney,
  formatWeight,
  formatCount,
  escapeHtml
} from "../src/ui/format.js";


const shell = mountShell({ page: "crafting", base: "../" });


// =========================================================
// DOM
// =========================================================

const recipeList = document.getElementById("recipeList");
const subtitle = document.getElementById("craftingSubtitle");
const categoryTabs = document.querySelectorAll("[data-category]");
const hideOwned = document.getElementById("hideOwned");
const hideOwnedRow = document.getElementById("hideOwnedRow");

const autoBanner = document.getElementById("autoCraftBanner");
const autoBannerName = document.getElementById("autoCraftName");
const autoBannerClear = document.getElementById("autoCraftClear");
const craftingNext = document.getElementById("craftingNext");

document.getElementById("autoCraftIcon").innerHTML = icons.bolt;


// =========================================================
// STATE
// =========================================================

const state = {
  crafting: createCraftingState(),
  equipment: [],
  consumables: [],
  money: 0,
  totalRolls: 0,
  bestRareNaturalWeight100k: 0,
  bestRareNaturalWeight1m: 0,
  category: "pickaxe",
  loading: true
};

const POTION_AUTO_STORAGE_KEY = "gemIncremental.crafting.autoPotionRecipe";
const PINNED_RECIPE_STORAGE_KEY = "gemIncremental.crafting.pinnedRecipes";
let potionAutoTimer = null;
let potionAutoBusy = false;

function getAutoPotionRecipeId() {
  try {
    return localStorage.getItem(POTION_AUTO_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function setAutoPotionRecipeId(recipeId) {
  try {
    if (recipeId) localStorage.setItem(POTION_AUTO_STORAGE_KEY, recipeId);
    else localStorage.removeItem(POTION_AUTO_STORAGE_KEY);
  } catch {}
}

function pinnedRecipeIds() {
  try { return new Set(JSON.parse(localStorage.getItem(PINNED_RECIPE_STORAGE_KEY) || "[]")); }
  catch { return new Set(); }
}

function togglePinnedRecipe(recipeId) {
  const pinned = pinnedRecipeIds();
  if (pinned.has(recipeId)) pinned.delete(recipeId); else pinned.add(recipeId);
  try { localStorage.setItem(PINNED_RECIPE_STORAGE_KEY, JSON.stringify([...pinned])); } catch {}
  renderRecipes();
}

function isPotionAutoTarget(recipeId) {
  return isConsumableRecipe(recipes.find((entry) => entry.id === recipeId));
}


// =========================================================
// EQUIPMENT LOOKUPS
// =========================================================

function ownsEquipment(equipmentId) {
  return state.equipment.some(
    (item) => item.equipment_id === equipmentId
  );
}


function ownsTierOrHigher(category, tier) {
  return state.equipment.some(
    (item) => item.category === category && Number(item.tier) >= tier
  );
}


// The logic module expects a plain { id } shape.
function equipmentContext() {
  return {
    equipment: state.equipment.map((item) => ({ id: item.equipment_id })),
    consumables: state.consumables,
    totalRolls: state.totalRolls,
    bestRareNaturalWeight100k: state.bestRareNaturalWeight100k,
    bestRareNaturalWeight1m: state.bestRareNaturalWeight1m
  };
}


// =========================================================
// REQUIREMENT DISPLAY
// =========================================================

function requirementKey(requirement, index) {
  if (requirement.id) {
    return requirement.id;
  }

  if (requirement.type === "gem-count") {
    return requirement.gem;
  }

  if (
    requirement.type === "consumable" ||
    requirement.type === "consumable-count" ||
    requirement.type === "potion" ||
    requirement.type === "potion-count"
  ) {
    return (
      requirement.consumableId ??
      requirement.consumable_id ??
      requirement.potionId ??
      requirement.potion_id ??
      `${requirement.type}-${index}`
    );
  }

  return `${requirement.type}-${index}`;
}


function describeRequirement(requirement, value) {
  switch (requirement.type) {
    case "consumable": {
      const item = getConsumableById(requirement.consumableId);
      // Ownership-based: show how many you own vs the amount needed.
      const owned = state.consumables.find(
        (entry) => entry.consumable_id === requirement.consumableId
      );
      const have = Number(owned?.quantity ?? 0);

      return {
        label: item?.name ?? requirement.consumableId,
        text: `${formatCount(have)} / ${formatCount(requirement.amount)}`,
        fraction: ratio(have, requirement.amount)
      };
    }

    case "gem-count":
      return {
        label: requirement.gem,
        text: `${formatCount(value ?? 0)} / ${formatCount(requirement.amount)}`,
        fraction: ratio(value, requirement.amount)
      };

    case "lifetime-rolls":
      return {
        label: "Lifetime rolls",
        text: `${formatCount(state.totalRolls)} / ${formatCount(requirement.rolls)}`,
        fraction: ratio(state.totalRolls, requirement.rolls)
      };

    case "roll-history-condition": {
      const have = Number(requirement.minimumRarity >= 1000000
        ? state.bestRareNaturalWeight1m
        : state.bestRareNaturalWeight100k);
      return {
        label: requirement.label,
        text: have >= requirement.minimumWeightMultiplier ? "Complete" : `Best: ${have.toFixed(2)}×`,
        fraction: ratio(have, requirement.minimumWeightMultiplier)
      };
    }

    case "gem-total-weight":
      return {
        label: requirement.label ?? `${requirement.gem} — total weight`,
        text: `${formatWeight(value ?? 0)} / ${formatWeight(
          requirement.totalWeight
        )}`,
        fraction: ratio(value, requirement.totalWeight)
      };

    case "specimen-total-weight":
      return {
        label: requirement.label ?? "Sacrificed gem weight",
        text: `${formatWeight(value ?? 0)} / ${formatWeight(requirement.totalWeight)}`,
        fraction: ratio(value, requirement.totalWeight)
      };

    case "gem-min-weight-multiplier":
      return {
        label:
          `${requirement.gem} at ` +
          `${requirement.minimumWeightMultiplier}x weight or more`,
        text: `${formatCount(value ?? 0)} / ${formatCount(
          requirement.amount ?? 1
        )}`,
        fraction: ratio(value, requirement.amount ?? 1)
      };

    case "gem-max-weight-multiplier":
      return {
        label:
          `${requirement.gem} at ` +
          `${requirement.maximumWeightMultiplier}x weight or less`,
        text: `${formatCount(value ?? 0)} / ${formatCount(
          requirement.amount ?? 1
        )}`,
        fraction: ratio(value, requirement.amount ?? 1)
      };

    case "specimen-condition":
      return {
        label: requirement.label ?? "Special specimen",
        text: `${formatCount(value ?? 0)} / ${formatCount(
          requirement.amount ?? 1
        )}`,
        fraction: ratio(value, requirement.amount ?? 1)
      };

    case "specimen-value-total":
      return {
        label: "Sacrificed value",
        text: `${formatMoney(value ?? 0)} / ${formatMoney(
          requirement.totalValue
        )}`,
        fraction: ratio(value, requirement.totalValue)
      };

    case "rarity-points": {
      const points = value?.points ?? 0;
      const unique = value?.gemTypes?.length ?? 0;
      const minimumUnique = requirement.minimumUniqueGemTypes ?? 0;

      const text =
        minimumUnique > 0
          ? `${formatCount(points)} / ${formatCount(requirement.points)} pts · ` +
            `${unique} / ${minimumUnique} types`
          : `${formatCount(points)} / ${formatCount(requirement.points)} pts`;

      return {
        label: "Rarity points",
        text,
        fraction: ratio(points, requirement.points)
      };
    }

    case "gem-range": {
      const current = value ?? {};
      const each = requirement.amountEach ?? 1;

      const missing = requirement.gems.flatMap((gemName) => {
        const remaining = Math.max(0, each - Number(current[gemName] ?? 0));

        if (remaining === 0) {
          return [];
        }

        return [each > 1 ? `${gemName} ×${remaining}` : gemName];
      });

      const done = requirement.gems.length - missing.length;

      return {
        label: requirement.label ?? "Gem collection",
        text: `${done} / ${requirement.gems.length} gems`,
        fraction: ratio(done, requirement.gems.length),
        missing
      };
    }

    default:
      return { label: requirement.type, text: "", fraction: 0 };
  }
}


function ratio(value, target) {
  const amount = Number(value ?? 0);
  const goal = Number(target ?? 0);

  if (!goal) {
    return 0;
  }

  return Math.max(0, Math.min(1, amount / goal));
}


// =========================================================
// RECIPE READINESS
// =========================================================

function isRecipeReady(recipe) {
  const requirementsMet = recipe.requirements.every((requirement, index) => {
    if (requirement.type === "equipment") {
      return ownsEquipment(requirement.equipmentId);
    }

    return isRequirementComplete(
      state.crafting,
      recipe,
      requirement,
      index,
      equipmentContext()
    );
  });

  return requirementsMet && state.money >= recipe.moneyCost;
}

function isConsumableRecipe(recipe) {
  return recipe.reward?.type === "consumable";
}


function formatBonuses(bonus = {}) {
  const labels = [
    ["luck", "Luck"],
    ["rollSpeed", "Roll speed"],
    ["weightLuck", "Weight luck"],
    ["weightMultiplier", "Weight multiplier"]
  ];

  return labels
    .filter(([key]) => bonus[key])
    .map(
      ([key, label]) =>
        `<span class="badge badge--positive">+${(bonus[key] * 100).toFixed(
          0
        )}% ${label}</span>`
    );
}

function formatReward(recipe) {
  if (!isConsumableRecipe(recipe)) {
    return formatBonuses(recipe.reward?.bonus);
  }

  const statNames = {
    luck: "Luck",
    rollSpeed: "Roll speed",
    weightLuck: "Weight luck",
    weightMultiplier: "Weight multiplier"
  };

  return [
    `<span class="badge badge--positive">+${(recipe.reward.effectValue * 100).toFixed(0)}% ${escapeHtml(statNames[recipe.reward.family] ?? recipe.reward.family)}</span>`,
    recipe.reward.oneRoll
      ? '<span class="badge badge--muted">Next successful roll</span>'
      : '<span class="badge badge--muted">60 seconds</span>'
  ];
}


// =========================================================
// RENDER
// =========================================================

function setCategory(category) {
  state.category = category;

  if (hideOwnedRow) {
    hideOwnedRow.hidden = category === "potion" || category === "lantern";
  }

  for (const tab of categoryTabs) {
    tab.setAttribute(
      "aria-selected",
      String(tab.dataset.category === category)
    );
  }

  renderRecipes();
}


for (const tab of categoryTabs) {
  tab.addEventListener("click", () => setCategory(tab.dataset.category));
}


hideOwned.addEventListener("change", renderRecipes);


function renderAutoBanner() {
  const activeId = state.crafting.activeAutoCraftRecipeId || getAutoPotionRecipeId();

  if (!activeId) {
    autoBanner.classList.add("hidden");
    return;
  }

  const recipe = recipes.find((entry) => entry.id === activeId);
  autoBannerName.textContent = recipe?.name ?? activeId;
  autoBanner.classList.remove("hidden");
}


function renderRecipes() {
  shell.setWallet(state.money);

  if (state.loading) {
    recipeList.innerHTML = Array.from(
      { length: 4 },
      () => '<div class="skeleton" style="height:280px"></div>'
    ).join("");

    return;
  }

  renderAutoBanner();
  renderCraftingRecommendation();

  if (state.category === "lantern") {
    subtitle.textContent = "Lanterns are legacy equipment";
    recipeList.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        ${icons.info}
        <p class="empty__title">Lanterns have been deprecated.</p>
        <p>Existing lanterns can still be equipped, but new lanterns can no longer be crafted.</p>
      </div>
    `;
    return;
  }

  const equipmentRecipes = recipes.filter((recipe) => !isConsumableRecipe(recipe));
  const owned = equipmentRecipes.filter((recipe) =>
    ownsTierOrHigher(recipe.reward.category, recipe.reward.tier)
  ).length;

  subtitle.textContent =
    `${formatCount(owned)} of ${formatCount(equipmentRecipes.length)} equipment crafted · ` +
    `${formatMoney(state.money)} available`;

  let visible = recipes.filter(
    (recipe) => recipe.category === state.category
  );

  if (hideOwned.checked) {
    visible = visible.filter(
      (recipe) =>
        isConsumableRecipe(recipe) ||
        !ownsTierOrHigher(recipe.reward.category, recipe.reward.tier)
    );
  }

  if (visible.length === 0) {
    recipeList.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        ${icons.checkCircle}
        <p class="empty__title">Everything here is crafted</p>
        <p>Try another equipment type.</p>
      </div>
    `;

    return;
  }

  recipeList.innerHTML = visible.map(recipeCard).join("");

  for (const card of recipeList.querySelectorAll(".recipe-card")) {
    wireRecipeCard(card);
  }
}

function renderRecipeInPlace(recipeId, focusSelector = null) {
  const currentCard = [...recipeList.querySelectorAll(".recipe-card")]
    .find((card) => card.dataset.recipe === recipeId);
  const recipe = recipes.find((entry) => entry.id === recipeId);

  if (!currentCard || !recipe) {
    return;
  }

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const container = document.createElement("div");
  container.innerHTML = recipeCard(recipe).trim();

  const replacement = container.firstElementChild;
  currentCard.replaceWith(replacement);
  wireRecipeCard(replacement);

  renderCraftingRecommendation();
  window.scrollTo(scrollX, scrollY);
  replacement.querySelector(focusSelector)?.focus({ preventScroll: true });
}

function renderCraftingRecommendation() {
  const candidates = recipes.filter((recipe) => !isConsumableRecipe(recipe) && !ownsTierOrHigher(recipe.reward.category, recipe.reward.tier));
  const next = candidates.sort((a, b) => {
    const aReady = isRecipeReady(a) ? 1 : 0, bReady = isRecipeReady(b) ? 1 : 0;
    return bReady - aReady || Number(a.reward.tier) - Number(b.reward.tier);
  })[0];
  if (!next) { craftingNext.innerHTML = `<div><span class="badge badge--positive">Complete</span><h2>All current equipment is crafted</h2><p>Focus on Masterwork upgrades or keep an eye on future recipe releases.</p></div>`; return; }
  const ready = isRecipeReady(next);
  craftingNext.innerHTML = `<div><span class="badge badge--accent">Recommended next</span><h2>${escapeHtml(next.name)}</h2><p>${ready ? "Ready to craft now — this is your next available equipment upgrade." : `Closest next equipment upgrade · Tier ${next.reward.tier}. Pin it to keep its material goal visible.`}</p></div><div class="row"><button class="btn" data-pin-recipe="${escapeHtml(next.id)}">${pinnedRecipeIds().has(next.id) ? "Unpin recipe" : "Pin recipe"}</button><button class="btn btn--primary" data-open-recipe="${escapeHtml(next.id)}">View recipe</button></div>`;
  craftingNext.querySelector("[data-pin-recipe]")?.addEventListener("click", () => togglePinnedRecipe(next.id));
  craftingNext.querySelector("[data-open-recipe]")?.addEventListener("click", () => { setCategory(next.category); requestAnimationFrame(() => document.querySelector(`[data-recipe="${next.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })); });
}


function recipeCard(recipe) {
  const progress = ensureRecipeProgress(state.crafting, recipe);

  const owned = !isConsumableRecipe(recipe) && ownsTierOrHigher(
    recipe.reward.category,
    recipe.reward.tier
  );

  const ready = !owned && isRecipeReady(recipe);

  const isAutoTarget =
    state.crafting.activeAutoCraftRecipeId === recipe.id ||
    getAutoPotionRecipeId() === recipe.id;

  const bonuses = formatReward(recipe);
  const pinned = pinnedRecipeIds().has(recipe.id);

  const requirementsHtml = recipe.requirements
    .map((requirement, index) => {
      if (requirement.type === "equipment") {
        const met = ownsEquipment(requirement.equipmentId);

        const source = recipes.find(
          (entry) => entry.reward?.id === requirement.equipmentId
        );

        const name =
          source?.reward?.name ??
          requirement.equipmentName ??
          requirement.equipmentId;

        return `
          <div class="requirement${met ? " requirement--done" : ""}">
            <span class="requirement__label">Requires ${escapeHtml(name)}</span>

            <span class="requirement__right">
              <span class="requirement__check${
                met ? "" : " requirement__check--missing"
              }">${met ? icons.check : icons.x}</span>
            </span>
          </div>
        `;
      }

      if (requirement.type === "consumable") {
        const complete = isRequirementComplete(
          state.crafting, recipe, requirement, index, equipmentContext()
        );
        const detail = describeRequirement(requirement);

        // Consumables are owned (and consumed on craft), not deposited,
        // so there is no Deposit button — just an owned/needed check.
        return `
          <div class="requirement${complete ? " requirement--done" : ""}">
            <span class="requirement__label">${escapeHtml(detail.label)}</span>
            <span class="requirement__right">
              <span class="requirement__value">${escapeHtml(detail.text)}</span>
              <span class="requirement__check${
                complete ? "" : " requirement__check--missing"
              }">${complete ? icons.check : icons.x}</span>
            </span>
            <span class="requirement__bar"><span style="width:${
              detail.fraction * 100
            }%"></span></span>
          </div>
        `;
      }

      const key = requirementKey(requirement, index);

      const complete = isRequirementComplete(
        state.crafting,
        recipe,
        requirement,
        index,
        equipmentContext()
      );

      const detail = describeRequirement(requirement, progress[key]);

      return `
        <div class="requirement${complete ? " requirement--done" : ""}">
          <span class="requirement__label">${escapeHtml(detail.label)}</span>

          <span class="requirement__right">
            <span class="requirement__value">${escapeHtml(detail.text)}</span>

            ${
              complete
                ? `<span class="requirement__check">${icons.check}</span>`
                : owned
                ? ""
                : ["lifetime-rolls", "roll-history-condition"].includes(requirement.type)
                ? `<span class="requirement__check requirement__check--missing">${icons.x}</span>`
                : `<button
                     class="btn btn--sm"
                     data-action="deposit"
                     data-index="${index}"
                     type="button"
                     title="Deposit matching gems from your inventory"
                   >Deposit</button>`
            }
          </span>

          ${
            detail.missing?.length
              ? `<div class="requirement__missing">
                   <span>Missing:</span> ${escapeHtml(detail.missing.join(", "))}
                 </div>`
              : ""
          }

          <span class="requirement__bar">
            <span style="width:${(complete ? 1 : detail.fraction) * 100}%"></span>
          </span>
        </div>
      `;
    })
    .join("");

  const affordable = state.money >= recipe.moneyCost;

  return `
    <article
      class="recipe-card${ready ? " recipe-card--ready" : ""}${
    owned ? " recipe-card--owned" : ""
  }${isAutoTarget ? " recipe-card--auto" : ""}"
      data-recipe="${escapeHtml(recipe.id)}"
    >
      <div class="recipe-card__head">
        <div>
          <div class="recipe-card__name">${escapeHtml(recipe.name)}</div>
          <div class="recipe-card__tier">Tier ${recipe.reward.tier}${isConsumableRecipe(recipe) ? " · Repeatable" : ""}</div>
        </div>

        ${
          ready
            ? '<span class="badge badge--positive">Ready</span>'
            : isAutoTarget
            ? '<span class="badge badge--accent">Auto Craft</span>'
            : ""
        }
      </div>

      <button class="btn btn--sm recipe-card__pin" data-action="pin" type="button">${pinned ? "★ Pinned" : "☆ Pin"}</button>

      <div class="recipe-card__bonuses">
        ${bonuses.join("") || '<span class="badge badge--muted">No bonus</span>'}
      </div>

      ${
        owned
          ? `<p class="recipe-card__owned">${icons.checkCircle} Crafted</p>`
          : `
            <div class="requirements">${requirementsHtml}</div>

            <div class="recipe-cost">
              <span>Cost</span>

              <span class="recipe-cost__value ${
                affordable ? "recipe-cost__value--ok" : "recipe-cost__value--short"
              }">
                ${formatMoney(recipe.moneyCost)}
              </span>
            </div>

            <div class="recipe-card__actions">
              <button class="btn" data-action="auto" type="button">
                ${icons.bolt}
                Auto ${isAutoTarget ? "on" : "off"}
              </button>

              <button
                class="btn btn--primary"
                data-action="craft"
                type="button"
                ${ready ? "" : "disabled"}
              >
                Craft
              </button>
            </div>
          `
      }
    </article>
  `;
}


// =========================================================
// CARD ACTIONS
// =========================================================

// Deposit matching gems into one requirement until it is either
// complete or nothing more can be added. This keeps working whether
// the server deposits every matching gem in a single call or one at
// a time — it repeats until the stored progress stops changing, so
// "10 held + 20 in inventory" ends at 30 rather than stopping early.
async function depositRequirementFully(recipeId, index) {
  const recipe = recipes.find((entry) => entry.id === recipeId);
  let deposited = 0;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const before = JSON.stringify(state.crafting.progress[recipeId] ?? {});

    const { data, error } = await manuallyDepositCloudRequirement(recipeId, index);

    if (error) {
      // "Nothing to deposit" once we have already moved some gems is
      // just the natural end; only surface an error if nothing moved.
      return { deposited, error: deposited === 0 ? error : null };
    }

    deposited += 1;

    if (data?.progress) {
      state.crafting.progress[recipeId] = data.progress;
    } else {
      // Keep compatibility with an older deployed function response while
      // still avoiding a full-page repaint.
      const fresh = await loadCloudCraftingState();
      if (fresh) state.crafting = fresh;
    }

    const after = JSON.stringify(state.crafting.progress[recipeId] ?? {});

    // No change means the server has nothing left to move here.
    if (before === after) {
      break;
    }

    // Stop as soon as the requirement is satisfied.
    const requirement = recipe?.requirements?.[index];

    if (
      requirement &&
      isRequirementComplete(
        state.crafting,
        recipe,
        requirement,
        index,
        equipmentContext()
      )
    ) {
      break;
    }
  }

  return { deposited, error: null };
}


function wireRecipeCard(card) {
  const recipeId = card.dataset.recipe;

  const recipe = recipes.find((entry) => entry.id === recipeId);

  if (!recipe) {
    return;
  }

  card.querySelector('[data-action="pin"]')?.addEventListener("click", () => togglePinnedRecipe(recipeId));

  card
    .querySelector('[data-action="auto"]')
    ?.addEventListener("click", async (event) => {
      const button = event.currentTarget;

      button.disabled = true;

      const enabled = isConsumableRecipe(recipe)
        ? getAutoPotionRecipeId() === recipeId
        : state.crafting.activeAutoCraftRecipeId === recipeId;

      if (isConsumableRecipe(recipe)) {
        setAutoPotionRecipeId(enabled ? null : recipeId);

        notify.success(
          enabled ? "Auto Craft off" : "Auto Craft on",
          enabled
            ? "Potion crafting has been stopped."
            : `${recipe.name} will be deposited and crafted automatically while this page is open.`
        );

        button.disabled = false;
        renderRecipes();
        startPotionAutoCraftLoop();
        return;
      }

      const { error } = await setCloudAutoCraft(enabled ? null : recipeId);

      if (error) {
        notify.error("Could not change Auto Craft", error.message);
        button.disabled = false;
        return;
      }

      notify.success(
        enabled ? "Auto Craft off" : "Auto Craft on",
        enabled
          ? "Rolled gems stay in your inventory."
          : `New gems will feed ${recipe.name}.`
      );

      await refresh();
    });

  card
    .querySelector('[data-action="craft"]')
    ?.addEventListener("click", async (event) => {
      const button = event.currentTarget;

      button.disabled = true;
      button.textContent = "Crafting…";

      const { error } = isConsumableRecipe(recipe)
        ? await craftCloudConsumableRecipe(recipeId)
        : await craftCloudRecipe(recipeId);

      if (error) {
        notify.error("Could not craft", error.message);

        await refresh();

        return;
      }

      notify.success(
        "Crafted",
        isConsumableRecipe(recipe)
          ? `${recipe.name} was added to your consumables.`
          : `${recipe.name} is now equipped.`
      );

      await refresh();
    });

  for (const button of card.querySelectorAll('[data-action="deposit"]')) {
    button.addEventListener("click", async () => {
      const index = Number(button.dataset.index);

      button.disabled = true;

      const { deposited, error } = await depositRequirementFully(recipeId, index);

      if (error && deposited === 0) {
        notify.error("Nothing deposited", error.message);

        button.disabled = false;

        return;
      }

      renderRecipeInPlace(
        recipeId,
        `[data-action="deposit"][data-index="${index}"]`
      );
    });
  }

  // Deposit into every remaining requirement at once. Each deposit
  // is still its own server call; this just saves the clicking.
  card
    .querySelector('[data-action="deposit-all"]')
    ?.addEventListener("click", async (event) => {
      const button = event.currentTarget;

      const indexes = [
        ...card.querySelectorAll('[data-action="deposit"]')
      ].map((depositButton) => Number(depositButton.dataset.index));

      button.disabled = true;
      button.textContent = "Depositing…";

      let filled = 0;
      let firstError = null;

      for (const index of indexes) {
        // Each requirement is topped up fully, not just nudged once.
        const { deposited, error } = await depositRequirementFully(
          recipeId,
          index
        );

        if (error && deposited === 0) {
          // "Nothing to deposit" for one requirement should not
          // stop the others.
          firstError = firstError ?? error;

          continue;
        }

        if (deposited > 0) {
          filled += 1;
        }
      }

      if (filled === 0 && firstError) {
        notify.error("Nothing deposited", firstError.message);
      } else {
        notify.success(
          "Deposited",
          `Filled ${filled} requirement${filled === 1 ? "" : "s"}.`
        );
      }

      renderRecipeInPlace(recipeId, '[data-action="deposit-all"]');
    });
}


autoBannerClear.addEventListener("click", async () => {
  autoBannerClear.disabled = true;

  const potionId = getAutoPotionRecipeId();
  let error = null;

  if (potionId) {
    setAutoPotionRecipeId(null);
  } else {
    const result = await setCloudAutoCraft(null);
    error = result.error;
  }

  autoBannerClear.disabled = false;

  if (error) {
    notify.error("Could not turn off Auto Craft", error.message);
    return;
  }

  notify.info("Auto Craft off", "Automatic crafting has been stopped.");
  await refresh();
});


// =========================================================
// POTION AUTO CRAFT
// =========================================================

async function runPotionAutoCraftOnce() {
  const recipeId = getAutoPotionRecipeId();
  if (!recipeId || potionAutoBusy || state.loading) return;

  const recipe = recipes.find((entry) => entry.id === recipeId);
  if (!recipe || !isConsumableRecipe(recipe)) {
    setAutoPotionRecipeId(null);
    return;
  }

  potionAutoBusy = true;

  try {
    // Keep feeding the potion recipe from the player's unlocked inventory.
    for (let index = 0; index < recipe.requirements.length; index += 1) {
      const requirement = recipe.requirements[index];
      if (["equipment", "lifetime-rolls"].includes(requirement.type)) {
        continue;
      }

      await depositRequirementFully(recipeId, index);
    }

    const fresh = await loadCloudCraftingState();
    if (fresh) state.crafting = fresh;

    if (isRecipeReady(recipe)) {
      const { error } = await craftCloudConsumableRecipe(recipeId);

      if (!error) {
        notify.success("Potion crafted", `${recipe.name} was added to your consumables.`);
      } else if (!String(error.message ?? "").toLowerCase().includes("requirements")) {
        console.error("[CRAFT] Auto potion craft failed:", error);
      }

      await refresh();
    }
  } catch (error) {
    console.error("[CRAFT] Auto potion cycle failed:", error);
  } finally {
    potionAutoBusy = false;
  }
}

function startPotionAutoCraftLoop() {
  if (potionAutoTimer) {
    clearInterval(potionAutoTimer);
    potionAutoTimer = null;
  }

  if (!getAutoPotionRecipeId()) return;

  runPotionAutoCraftOnce();
  potionAutoTimer = setInterval(runPotionAutoCraftOnce, 2000);
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

  const [craftingState, playerState, equipment, consumables] = await Promise.all([
    loadCloudCraftingState(),
    loadCloudPlayerState(),
    loadCloudEquipment(),
    loadCloudConsumables()
  ]);

  state.loading = false;

  if (craftingState) {
    state.crafting = craftingState;
  }

  if (playerState) {
    state.money = playerState.money;
    state.totalRolls = playerState.total_rolls;
    state.bestRareNaturalWeight100k = playerState.best_rare_natural_weight_100k;
    state.bestRareNaturalWeight1m = playerState.best_rare_natural_weight_1m;
  }

  if (equipment) {
    state.equipment = equipment;
  }

  if (consumables) {
    state.consumables = consumables;
  }

  renderRecipes();
}


window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    refresh().then(() => startPotionAutoCraftLoop());
  }
});


if (hideOwnedRow) {
  hideOwnedRow.hidden = state.category === "potion";
}

renderRecipes();
refresh().then(() => startPotionAutoCraftLoop());
