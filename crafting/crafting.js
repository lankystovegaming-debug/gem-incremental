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

const autoBanner = document.getElementById("autoCraftBanner");
const autoBannerName = document.getElementById("autoCraftName");
const autoBannerClear = document.getElementById("autoCraftClear");

document.getElementById("autoCraftIcon").innerHTML = icons.bolt;


// =========================================================
// STATE
// =========================================================

const state = {
  crafting: createCraftingState(),
  equipment: [],
  consumables: [],
  money: 0,
  category: "pickaxe",
  loading: true
};


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
    consumables: state.consumables
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

  return `${requirement.type}-${index}`;
}


function describeRequirement(requirement, value) {
  switch (requirement.type) {
    case "consumable": {
      const item = getConsumableById(requirement.consumableId);
      const owned = state.consumables.find(
        (entry) => entry.consumable_id === requirement.consumableId
      );

      return {
        label: item?.name ?? requirement.consumableId,
        text: `${formatCount(owned?.quantity ?? 0)} / ${formatCount(requirement.amount)}`,
        fraction: ratio(owned?.quantity ?? 0, requirement.amount)
      };
    }

    case "gem-count":
      return {
        label: requirement.gem,
        text: `${formatCount(value ?? 0)} / ${formatCount(requirement.amount)}`,
        fraction: ratio(value, requirement.amount)
      };

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

      const done = requirement.gems.filter(
        (gemName) => (current[gemName] ?? 0) >= each
      ).length;

      return {
        label: requirement.label ?? "Gem collection",
        text: `${done} / ${requirement.gems.length} gems`,
        fraction: ratio(done, requirement.gems.length)
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
    '<span class="badge badge--muted">60 seconds</span>'
  ];
}


// =========================================================
// RENDER
// =========================================================

function setCategory(category) {
  state.category = category;

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
  const activeId = state.crafting.activeAutoCraftRecipeId;

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


function recipeCard(recipe) {
  const progress = ensureRecipeProgress(state.crafting, recipe);

  const owned = !isConsumableRecipe(recipe) && ownsTierOrHigher(
    recipe.reward.category,
    recipe.reward.tier
  );

  const ready = !owned && isRecipeReady(recipe);

  const isAutoTarget = state.crafting.activeAutoCraftRecipeId === recipe.id;

  const bonuses = formatReward(recipe);

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
        const detail = describeRequirement(requirement);
        const complete = isRequirementComplete(
          state.crafting, recipe, requirement, index, equipmentContext()
        );

        return `
          <div class="requirement${complete ? " requirement--done" : ""}">
            <span class="requirement__label">${escapeHtml(detail.label)}</span>
            <span class="requirement__right">
              <span class="requirement__value">${escapeHtml(detail.text)}</span>
              <span class="requirement__check${complete ? "" : " requirement__check--missing"}">
                ${complete ? icons.check : icons.x}
              </span>
            </span>
            <span class="requirement__bar"><span style="width:${detail.fraction * 100}%"></span></span>
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
                : `<button
                     class="btn btn--sm"
                     data-action="deposit"
                     data-index="${index}"
                     type="button"
                     title="Deposit matching gems from your inventory"
                   >Deposit</button>`
            }
          </span>

          <span class="requirement__bar">
            <span style="width:${(complete ? 1 : detail.fraction) * 100}%"></span>
          </span>
        </div>
      `;
    })
    .join("");

  const affordable = state.money >= recipe.moneyCost;

  // A "Deposit all" shortcut is offered whenever more than one
  // requirement still has its own Deposit button.
  const depositCount = (
    requirementsHtml.match(/data-action="deposit"/g) ?? []
  ).length;

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

      <div class="recipe-card__bonuses">
        ${bonuses.join("") || '<span class="badge badge--muted">No bonus</span>'}
      </div>

      ${
        owned
          ? `<p class="recipe-card__owned">${icons.checkCircle} Crafted</p>`
          : `
            <div class="requirements">${requirementsHtml}</div>

            ${
              depositCount > 1
                ? `<button class="btn btn--block" data-action="deposit-all" type="button">
                     Deposit all (${depositCount})
                   </button>`
                : ""
            }

            <div class="recipe-cost">
              <span>Cost</span>

              <span class="recipe-cost__value ${
                affordable ? "recipe-cost__value--ok" : "recipe-cost__value--short"
              }">
                ${formatMoney(recipe.moneyCost)}
              </span>
            </div>

            <div class="recipe-card__actions">
              ${
                isConsumableRecipe(recipe)
                  ? ""
                  : `<button class="btn" data-action="auto" type="button">
                       ${icons.bolt}
                       Auto ${isAutoTarget ? "on" : "off"}
                     </button>`
              }

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

    const { error } = await manuallyDepositCloudRequirement(recipeId, index);

    if (error) {
      // "Nothing to deposit" once we have already moved some gems is
      // just the natural end; only surface an error if nothing moved.
      return { deposited, error: deposited === 0 ? error : null };
    }

    deposited += 1;

    const fresh = await loadCloudCraftingState();

    if (fresh) {
      state.crafting = fresh;
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

  card
    .querySelector('[data-action="auto"]')
    ?.addEventListener("click", async (event) => {
      const button = event.currentTarget;

      button.disabled = true;

      const enabled = state.crafting.activeAutoCraftRecipeId === recipeId;

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

      await refresh();
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

      await refresh();
    });
}


autoBannerClear.addEventListener("click", async () => {
  autoBannerClear.disabled = true;

  const { error } = await setCloudAutoCraft(null);

  autoBannerClear.disabled = false;

  if (error) {
    notify.error("Could not turn off Auto Craft", error.message);

    return;
  }

  notify.info("Auto Craft off", "Rolled gems stay in your inventory.");

  await refresh();
});


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
    refresh();
  }
});


renderRecipes();
refresh();
