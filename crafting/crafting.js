import { getEquipmentPassive, PICKAXE_SPECIALTIES } from "../src/data/equipmentPassives.js";
import baseRecipes from "../src/data/recipes.js";
let recipes = baseRecipes;
import { getConsumableById } from "../src/data/consumables.js";

import {
  createCraftingState,
  ensureRecipeProgress,
  isRequirementComplete
} from "../src/logic/crafting.js";

import {
  ensurePlayerAuth,
  isSignInRequired,
  SIGN_IN_REQUIRED_MESSAGE
} from "../src/backend/auth.js";
import { supabase } from "../src/backend/supabase.js";
import {
  loadCloudCraftingState,
  manuallyDepositCloudRequirement,
  craftCloudRecipe,
  craftCloudConsumableRecipe,
  setCloudAutoCraft,
  loadCloudConsumables,
  loadImpossiblePickaxeStatus,
  loadImpossibleDepositCandidates,
  depositImpossiblePickaxeGems,
  prepareImpossiblePickaxeCraft,
  craftImpossiblePickaxe
} from "../src/backend/cloudCrafting.js";
import { loadCloudEquipment, loadEquipmentOverhaulProgress } from "../src/backend/cloudEquipment.js";
import { loadCloudPlayerState } from "../src/backend/cloudInventory.js";

import { mountShell } from "../src/ui/shell.js";
import { signInEmptyStateHtml } from "../src/ui/signInState.js";
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
const EQUIPMENT_TAB_SECTION_IDS = {
  "limited-time":"equipment-limited-time",
  armory:"equipment-armory",
  weapons:"equipment-weapons"
};
async function applyEquipmentTabVisibility(){
  const {data}=await supabase.from("game_section_settings").select("id,enabled").in("id",Object.values(EQUIPMENT_TAB_SECTION_IDS));
  const map=Object.fromEntries((data||[]).map(x=>[x.id,!!x.enabled]));
  document.querySelectorAll("[data-category]").forEach(tab=>{
    const cat=tab.dataset.category;
    const sid=EQUIPMENT_TAB_SECTION_IDS[cat];
    if(!sid)return;
    tab.hidden= sid==="equipment-limited-time" ? false : !(map[sid]===true);
  });
}


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
  specialDiscoveries: {},
  genuineRolls: 0,
  bestRareNaturalWeight100k: 0,
  bestRareNaturalWeight1m: 0,
  impossibleStatus: null,
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

function stopPotionAutoCraft() {
  const wasActive = Boolean(getAutoPotionRecipeId());
  setAutoPotionRecipeId(null);
  if (potionAutoTimer) {
    clearInterval(potionAutoTimer);
    potionAutoTimer = null;
  }
  return wasActive;
}

async function setEquipmentAutoCraft(recipeId) {
  const result = await setCloudAutoCraft(recipeId);
  const clearedPotion = !result.error && recipeId ? stopPotionAutoCraft() : false;
  return { ...result, clearedPotion };
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
    (item) => item.equipment_id === equipmentId || (equipmentId === "omnidimensional-vault" && item.equipment_id === "dimensional-vault")
  );
}


function ownsTierOrHigher(category, tier) {
  return state.equipment.some(
    (item) => item.category === category && Number(item.tier) >= tier
  );
}


function ownsRecipe(recipe) {
 return recipe.horizontal || recipe.craftingTab === 'toys' || (recipe.category === 'pickaxe' && recipe.reward.tier === 15)
   ? ownsEquipment(recipe.id) : ownsTierOrHigher(recipe.reward.category,recipe.reward.tier);
}

// The logic module expects a plain { id } shape.
function equipmentContext() {
  return {
    equipment: state.equipment.map((item) => ({ id: item.equipment_id })),
    consumables: state.consumables,
    totalRolls: state.totalRolls,
    genuineRolls: state.genuineRolls,
    specialDiscoveries: state.specialDiscoveries,
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
    case 'impossible-safe-sacrifice':
      return {label:'Shared sacrifice pool · review required',text:`${formatCount(state.impossibleStatus?.preview?.materials?.selectedCount ?? 0)} deposited`,fraction:0};
    case 'equipment-history': {
      const have=Number(state.specialDiscoveries.batchHistory?.[requirement.metric]??0);
      return {label:requirement.label+' · historical, not consumed',text:`${formatCount(have)} / ${formatCount(requirement.amount)}`,fraction:ratio(have,requirement.amount)};
    }
    case 'special-discoveries': {
      const have=Number(state.specialDiscoveries[requirement.classification]??0);
      return {label:({daily_window:'Distinct daily-window gems (excluding the clock)',global_event:'Distinct global-event gems',special:'Distinct Special Gems'})[requirement.classification],text:`${have} / ${requirement.amount}`,fraction:ratio(have,requirement.amount)};
    }
    case 'potion-tier': {
      const have=state.consumables.filter(p=>/^(lucky|speed|fortune|mass)-potion-/.test(p.consumable_id)&&p.consumable_id.endsWith('-'+requirement.tier)).reduce((n,p)=>n+Number(p.quantity??0),0);
      return {label:`Tier ${requirement.tier} potions · any family`,text:`${have} / ${requirement.amount}`,fraction:ratio(have,requirement.amount)};
    }
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
        label: requirement.label ?? requirement.gem,
        text: `${formatCount(value ?? 0)} / ${formatCount(requirement.amount)}`,
        fraction: ratio(value, requirement.amount)
      };

    case "lifetime-rolls":
      return {
        label: "Lifetime rolls",
        text: `${formatCount(state.totalRolls)} / ${formatCount(requirement.rolls)}`,
        fraction: ratio(state.totalRolls, requirement.rolls)
      };

    case "equipment-min-tier": {
      const category = String(requirement.category ?? "equipment");
      const met = ownsTierOrHigher(category, Number(requirement.tier));
      const label = `${category.charAt(0).toUpperCase()}${category.slice(1)} tier ${requirement.tier}+`;
      return {
        label,
        text: met ? "Complete" : `Craft a tier ${requirement.tier}+ ${category} first`,
        fraction: met ? 1 : 0
      };
    }

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

    if (requirement.type === "equipment-min-tier") {
      return ownsTierOrHigher(requirement.category, Number(requirement.tier));
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
    ["mutationChance", "Mutation chance"],
    ["rollSpeed", "Roll speed"],
    ["weightLuck", "Weight luck"],
    ["weightMultiplier", "Weight multiplier"],
    ["mutationLuck", "Mutation luck"]
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
    if (recipe.equipmentOverhaul) return Object.entries(recipe.reward.bonus).map(([key,value])=>`<span class="badge badge--positive">${Number((1+value).toFixed(3))}× ${{luck:'Luck',rollSpeed:'Roll speed',mutationChance:'Mutation chance',weightLuck:'Weight Luck',weightMultiplier:'Weight multiplier',finalSell:'Final Sell'}[key]}</span>`);
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
    hideOwnedRow.hidden = category === "potion";
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

  const equipmentRecipes = recipes.filter((recipe) => !isConsumableRecipe(recipe));
  const owned = equipmentRecipes.filter((recipe) =>
    ownsRecipe(recipe)
  ).length;

  subtitle.textContent =
    `${formatCount(owned)} of ${formatCount(equipmentRecipes.length)} equipment crafted · ` +
    `${formatMoney(state.money)} available`;

  let visible = recipes.filter(
    (recipe) => (recipe.craftingTab ?? recipe.category) === state.category
  );

  if (hideOwned.checked) {
    visible = visible.filter(
      (recipe) =>
        isConsumableRecipe(recipe) ||
        !ownsRecipe(recipe)
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
  const candidates = recipes.filter((recipe) => !isConsumableRecipe(recipe) && !ownsRecipe(recipe));
  const next = candidates.sort((a, b) => {
    const aReady = isRecipeReady(a) ? 1 : 0, bReady = isRecipeReady(b) ? 1 : 0;
    return bReady - aReady || Number(a.reward.tier) - Number(b.reward.tier);
  })[0];
  if (!next) { craftingNext.innerHTML = `<div><span class="badge badge--positive">Complete</span><h2>All current equipment is crafted</h2><p>Focus on Masterwork upgrades or keep an eye on future recipe releases.</p></div>`; return; }
  const ready = isRecipeReady(next);
  craftingNext.innerHTML = `<div><span class="badge badge--accent">Recommended next</span><h2>${escapeHtml(next.name)}</h2><p>${ready ? "Ready to craft now — this is your next available equipment upgrade." : `Choose your next build. Pin this recipe to keep its material goal visible.`}</p></div><div class="row"><button class="btn" data-pin-recipe="${escapeHtml(next.id)}">${pinnedRecipeIds().has(next.id) ? "Unpin recipe" : "Pin recipe"}</button><button class="btn btn--primary" data-open-recipe="${escapeHtml(next.id)}">View recipe</button></div>`;
  craftingNext.querySelector("[data-pin-recipe]")?.addEventListener("click", () => togglePinnedRecipe(next.id));
  craftingNext.querySelector("[data-open-recipe]")?.addEventListener("click", () => { setCategory(next.craftingTab ?? next.category); requestAnimationFrame(() => document.querySelector(`[data-recipe="${next.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })); });
}


function recipeCard(recipe) {
  const progress = ensureRecipeProgress(state.crafting, recipe);

  const owned = !isConsumableRecipe(recipe) && ownsRecipe(recipe);

  const ready = !owned && isRecipeReady(recipe);

  const isAutoTarget =
    state.crafting.activeAutoCraftRecipeId === recipe.id ||
    getAutoPotionRecipeId() === recipe.id;

  const bonuses = formatReward(recipe);
  const pinned = pinnedRecipeIds().has(recipe.id);
  const passive = getEquipmentPassive(recipe.id);
  const worldFirst = state.impossibleStatus?.worldFirst;
  const impossibleBounty = recipe.id === 'impossible-pickaxe' ? `
    <section class="impossible-bounty ${worldFirst ? 'is-claimed' : 'is-unclaimed'}">
      <span class="eyebrow">WORLD FIRST BOUNTY — ${worldFirst ? 'CLAIMED' : 'UNCLAIMED'}</span>
      ${worldFirst
        ? `<strong>${escapeHtml(worldFirst.player_name || 'Unknown Player')}</strong><small>${escapeHtml(new Date(worldFirst.crafted_at).toLocaleString())}</small>`
        : '<strong>One account. Forever.</strong>'}
      <div><span>Impossible Profile Background</span><span>Impossible Leaderboard Frame</span><span>Impossible Roll Card</span></div>
    </section>` : '';

  const requirementsHtml = recipe.requirements
    .map((requirement, index) => {
      if (requirement.type === "equipment") {
        const met = ownsEquipment(requirement.equipmentId);

        const source = recipes.find(
          (entry) => entry.reward?.id === (requirement.equipmentId === "omnidimensional-vault" ? "dimensional-vault" : requirement.equipmentId)
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

      if (["consumable","potion-tier","special-discoveries","equipment-history","impossible-safe-sacrifice"].includes(requirement.type)) {
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
        <div class="recipe-card__identity">
          <div class="recipe-card__name">${escapeHtml(recipe.name)}</div>
          <div class="recipe-card__tier">${recipe.craftingTab === "toys" ? "Toy" : recipe.horizontal ? "Specialist" : `Tier ${recipe.reward.tier}`}${isConsumableRecipe(recipe) ? " · Repeatable" : ""}</div>
        </div>

        <div class="recipe-card__tools">
          ${ready
            ? '<span class="badge badge--positive">Ready</span>'
            : isAutoTarget
            ? '<span class="badge badge--accent">Auto Craft</span>'
            : ""}
          <button class="btn btn--sm recipe-card__pin" data-action="pin" type="button" aria-label="${pinned ? "Unpin" : "Pin"} ${escapeHtml(recipe.name)}">${pinned ? "★ Pinned" : "☆ Pin"}</button>
        </div>
      </div>

${PICKAXE_SPECIALTIES[recipe.id] ? `<p class="equipment-specialty"><strong>Best for: ${escapeHtml(PICKAXE_SPECIALTIES[recipe.id])}</strong></p>` : ""}
      <div class="recipe-card__bonuses">
        ${bonuses.join("") || '<span class="badge badge--muted">No bonus</span>'}
      </div>

      ${(recipe.description || passive) ? `
        <div class="recipe-card__details">
          ${recipe.description ? `<p class="recipe-card__description">${escapeHtml(recipe.description)}</p>` : ""}
          ${passive ? `
            <div class="recipe-card__passive">
              <span class="recipe-card__passive-label">Equipment passive</span>
              <strong>${escapeHtml(passive.name)}</strong>
              <p>${escapeHtml(passive.description)}</p>
            </div>
          ` : ""}
        </div>
      ` : ""}
      ${impossibleBounty}

      ${
        owned
          ? `<p class="recipe-card__owned">${icons.checkCircle} Crafted</p>`
          : `
            <div class="requirements">${requirementsHtml}</div>
            ${recipe.manualReviewOnly
              ? '<p class="recipe-card__description impossible-warning">Open the sacrifice workspace to deposit chosen inventory gems or send useful future rolls here with Auto Craft. Every deposited gem counts once and can satisfy every applicable shared-pool requirement.</p>'
              : recipe.consumeMaterials ? '<p class="recipe-card__description">Materials are consumed. Deposit all uses matching unlocked inventory gems; Auto Craft collects future rolls.</p>' : ""}

            <div class="recipe-cost">
              <span>Cost</span>

              <span class="recipe-cost__value ${
                affordable ? "recipe-cost__value--ok" : "recipe-cost__value--short"
              }">
                ${recipe.id === "plastic-shopping-bag" ? "$500,000,000.10" : formatMoney(recipe.moneyCost)}
              </span>
            </div>

            <div class="recipe-card__actions">
              ${recipe.manualReviewOnly ? `
                <button class="btn btn--primary" data-action="review-impossible" type="button">Review sacrifice plan</button>
              ` : `
              ${recipe.consumeMaterials ? '<button class="btn" data-action="deposit-all" type="button">Deposit all materials</button>' : ""}
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
              `}
            </div>
          `
      }
    </article>
  `;
}


// =========================================================
// CARD ACTIONS
// =========================================================

const IMPOSSIBLE_DEPOSIT_PAGE_SIZE = 50;
const IMPOSSIBLE_TOTAL_WEIGHT_REQUIRED = 500_000_000;
const IMPOSSIBLE_TOTAL_VALUE_REQUIRED = 1_000_000_000;

async function renderImpossibleCandidates(dialog, offset = 0, search = '') {
  const host = dialog.querySelector('#impossibleManualCandidates');
  if (!host) return;
  host.innerHTML = '<div class="skeleton skeleton--card"></div>';
  const { data: gems, error, count } = await loadImpossibleDepositCandidates({
    offset,
    limit: IMPOSSIBLE_DEPOSIT_PAGE_SIZE,
    search
  });
  if (!dialog.isConnected) return;
  if (error) {
    host.innerHTML = `<p class="impossible-review__blocked">${escapeHtml(error.message || 'Could not load inventory gems.')}</p>`;
    return;
  }
  const pageEnd = Math.min(count, offset + gems.length);
  const rows = gems.map((gem) => {
    const multiplier = Number(gem.base_weight) > 0 ? Number(gem.final_weight) / Number(gem.base_weight) : 0;
    return `<label class="impossible-deposit-gem">
      <input type="checkbox" data-impossible-gem-id="${escapeHtml(String(gem.id))}">
      <span><strong>${escapeHtml(gem.gem_name)}</strong><small>1 in ${formatCount(gem.rarity)} · ${formatWeight(gem.final_weight)} · ${formatCount(Number(multiplier.toFixed(2)))}×</small></span>
      <strong>${formatMoney(gem.value)}</strong>
    </label>`;
  }).join('');
  host.innerHTML = `
    <form class="impossible-deposit-search"><input class="input" id="impossibleDepositSearch" value="${escapeHtml(search)}" placeholder="Search gem name"><button class="btn btn--sm" type="submit">Search</button></form>
    <div class="impossible-deposit-toolbar"><label><input type="checkbox" id="impossibleSelectPage"> Select this page</label><span>${count ? `${formatCount(offset + 1)}–${formatCount(pageEnd)} of ${formatCount(count)}` : 'No eligible unlocked gems'}</span></div>
    <div class="impossible-deposit-list">${rows || '<p>No matching unlocked gems.</p>'}</div>
    <div class="impossible-deposit-pager"><button class="btn btn--sm" id="impossibleDepositPrev" ${offset <= 0 ? 'disabled' : ''}>Previous</button><button class="btn btn--sm" id="impossibleDepositNext" ${pageEnd >= count ? 'disabled' : ''}>Next</button></div>
    <div class="impossible-deposit-commit">
      <label><input type="checkbox" id="impossibleDepositAcknowledge"> I understand selected gems are permanently removed from inventory as soon as I deposit them.</label>
      <button class="btn btn--danger" id="impossibleDepositSelected" disabled>Deposit selected gems</button>
    </div>`;
  const selected = () => [...host.querySelectorAll('[data-impossible-gem-id]:checked')];
  const acknowledge = host.querySelector('#impossibleDepositAcknowledge');
  const deposit = host.querySelector('#impossibleDepositSelected');
  const syncDeposit = () => { deposit.disabled = !acknowledge.checked || selected().length === 0; };
  host.querySelectorAll('[data-impossible-gem-id]').forEach(input => input.addEventListener('change', syncDeposit));
  acknowledge.addEventListener('change', syncDeposit);
  host.querySelector('#impossibleSelectPage')?.addEventListener('change', (event) => {
    host.querySelectorAll('[data-impossible-gem-id]').forEach(input => { input.checked = event.currentTarget.checked; });
    syncDeposit();
  });
  host.querySelector('.impossible-deposit-search')?.addEventListener('submit', (event) => {
    event.preventDefault();
    renderImpossibleCandidates(dialog, 0, host.querySelector('#impossibleDepositSearch').value);
  });
  host.querySelector('#impossibleDepositPrev')?.addEventListener('click', () => renderImpossibleCandidates(dialog, Math.max(0, offset - IMPOSSIBLE_DEPOSIT_PAGE_SIZE), search));
  host.querySelector('#impossibleDepositNext')?.addEventListener('click', () => renderImpossibleCandidates(dialog, offset + IMPOSSIBLE_DEPOSIT_PAGE_SIZE, search));
  deposit?.addEventListener('click', async () => {
    const ids = selected().map(input => input.dataset.impossibleGemId);
    deposit.disabled = true;
    deposit.textContent = 'Depositing atomically…';
    try {
      const workspace = await depositImpossiblePickaxeGems(ids);
      state.impossibleStatus = workspace;
      notify.success('Gems deposited', `${formatCount(workspace.depositedCount ?? ids.length)} gems permanently added to the shared sacrifice pool.`);
      openImpossibleReview(workspace, { openManual: true });
    } catch (depositError) {
      notify.error('Deposit failed safely', `${depositError.message}. No partial deposit was kept.`);
      deposit.disabled = false;
      deposit.textContent = 'Deposit selected gems';
    }
  });
}

function openImpossibleReview(result, { openManual = false } = {}) {
  document.getElementById('impossibleReviewDialog')?.remove();
  const preview = result?.preview ?? {};
  const material = preview.materials ?? {};
  const history = preview.history ?? {};
  const rows = [
    ['Common', material.common, 1000], ['Legendary', material.legendary, 67000],
    ['Mythic', material.mythic, 30000], ['Exotic', material.exotic, 500],
    ['Exalted', material.exalted, 30], ['Cosmic+', material.cosmicPlus, 15],
    ['Separate ≥10× slots', Number(material.multiplier10 ?? 0) - Number(material.multiplier15 ?? 0), 10],
    ['Separate ≥15× slots', Number(material.multiplier15 ?? 0) - Number(material.multiplier25 ?? 0), 3],
    ['Separate ≥25× slot', material.multiplier25, 1],
    ['Gem worth ≥$100M', material.value100m, 1], ['Gem weighing ≥5,000,000g', material.weight5m, 1]
  ];
  const historical = [
    ['1/10M + 5× specimens',history.impossibleRareHeavy10m,10],
    ['1/100M + 10× specimen',history.impossibleRareHeavy100m,1],
    ['1/100M base-rarity rolls',history.impossibleRare100m,10],
    ['1/500M base-rarity roll',history.impossibleRare500m,1],
    ['Ordinary mutations',history.impossibleOrdinaryMutations,50],
    ['Special Gems',history.impossibleSpecialGems,10],
    ['Frozen specialists',history.impossibleSpecialists,6],
    ['Lifetime rolls',history.totalRolls,1000000]
  ];
  const line = ([label, have, need]) => `<li class="${Number(have ?? 0) >= need ? 'is-met' : ''}"><span>${escapeHtml(label)}</span><strong>${formatCount(have ?? 0)} / ${formatCount(need)}</strong></li>`;
  const highValue = (preview.highestValue ?? []).map(gem => `
    <tr><td>${escapeHtml(gem.gem_name)}</td><td>${formatMoney(gem.value)}</td><td>${formatWeight(gem.final_weight)}</td><td>${formatCount(gem.final_multiplier)}×</td></tr>
  `).join('');
  const dialog = document.createElement('dialog');
  dialog.id = 'impossibleReviewDialog';
  dialog.className = 'impossible-review';
  dialog.innerHTML = `
    <form method="dialog" class="impossible-review__head"><div><span class="eyebrow">SACRIFICE WORKSPACE</span><h2>The Impossible Pickaxe</h2></div><button class="btn" value="cancel">Close</button></form>
    <p>Build the permanent shared sacrifice pool manually or with future rolls. Deposited gems count toward every applicable predicate, but each gem is deposited only once.</p>
    <div class="impossible-workspace-modes">
      <details class="impossible-workspace-mode" id="impossibleManualMode" ${openManual ? 'open' : ''}>
        <summary><span><strong>Manual deposit</strong><small>Choose exact unlocked inventory gems in batches of up to 50.</small></span><span class="btn btn--sm">Browse inventory</span></summary>
        <div id="impossibleManualCandidates"></div>
      </details>
      <section class="impossible-workspace-mode impossible-auto-mode">
        <div><strong>Auto Craft</strong><small>Useful future rolls go straight into this pool. Gem Filter and bundle routing keep priority.</small></div>
        <label class="impossible-auto-ack"><input type="checkbox" id="impossibleAutoAcknowledge" ${result?.autoCraft ? 'checked' : ''}> ${result?.autoCraft ? 'Auto Craft is active.' : 'I understand matching future rolls are deposited permanently.'}</label>
        <button class="btn ${result?.autoCraft ? '' : 'btn--primary'}" id="impossibleAutoToggle" ${result?.autoCraft ? '' : 'disabled'}>${result?.autoCraft ? 'Stop Auto Craft' : 'Start Auto Craft'}</button>
      </section>
    </div>
    <div class="impossible-review__totals">
      <div><span>Deposited once</span><strong>${formatCount(material.selectedCount ?? 0)} gems</strong></div>
      <div><span>Combined final weight</span><strong>${formatWeight(material.totalWeight ?? 0)}</strong><small>Requirement: ${formatWeight(IMPOSSIBLE_TOTAL_WEIGHT_REQUIRED)}</small></div>
      <div><span>Combined value</span><strong>${formatMoney(material.totalValue ?? 0)}</strong><small>Requirement: ${formatMoney(IMPOSSIBLE_TOTAL_VALUE_REQUIRED)}</small></div>
      <div><span>Cash due at final craft</span><strong>${formatMoney(2500000000)}</strong></div>
    </div>
    <div class="impossible-review__checks"><section><h3>Sacrifice pool</h3><ul>${rows.map(line).join('')}</ul></section><section><h3>Historical gates</h3><ul>${historical.map(line).join('')}</ul></section></div>
    <details ${result?.ready ? '' : 'open'}><summary>20 highest-value deposited specimens</summary>
      <div class="impossible-review__table"><table><thead><tr><th>Gem</th><th>Value</th><th>Weight</th><th>Final/base</th></tr></thead><tbody>${highValue || '<tr><td colspan="4">No complete plan yet.</td></tr>'}</tbody></table></div>
    </details>
    <div class="impossible-final-review"><button class="btn" id="impossiblePrepareFinal">Refresh final sacrifice review</button><small>Creates a 15-minute final plan and pauses Impossible Auto Craft when every requirement is complete.</small></div>
    ${result?.ready && result?.token ? `<div class="impossible-review__confirm"><label><input type="checkbox" id="impossibleConfirm"> I approve consuming the listed potion and cash balances and using my permanently deposited pool.</label><button class="btn btn--primary" id="impossibleCraftConfirm" disabled>Consume and craft</button></div>` : `<p class="impossible-review__blocked">${escapeHtml(result?.message ?? 'Deposit materials until every line is complete, then refresh the final review. Existing deposits remain credited.')}</p>`}
  `;
  document.body.append(dialog);
  const manualMode = dialog.querySelector('#impossibleManualMode');
  let candidatesLoaded = false;
  const loadCandidates = () => {
    if (manualMode?.open && !candidatesLoaded) {
      candidatesLoaded = true;
      renderImpossibleCandidates(dialog);
    }
  };
  manualMode?.addEventListener('toggle', loadCandidates);
  loadCandidates();
  const autoAcknowledge = dialog.querySelector('#impossibleAutoAcknowledge');
  const autoToggle = dialog.querySelector('#impossibleAutoToggle');
  autoAcknowledge?.addEventListener('change', () => { if (!result?.autoCraft) autoToggle.disabled = !autoAcknowledge.checked; });
  autoToggle?.addEventListener('click', async () => {
    autoToggle.disabled = true;
    autoToggle.textContent = result?.autoCraft ? 'Stopping…' : 'Starting…';
    const { error, clearedPotion } = await setEquipmentAutoCraft(result?.autoCraft ? null : 'impossible-pickaxe');
    if (error) {
      notify.error('Could not change Auto Craft', error.message);
      autoToggle.disabled = false;
      autoToggle.textContent = result?.autoCraft ? 'Stop Auto Craft' : 'Start Auto Craft';
      return;
    }
    state.crafting.activeAutoCraftRecipeId = result?.autoCraft ? null : 'impossible-pickaxe';
    const workspace = await loadImpossiblePickaxeStatus();
    state.impossibleStatus = workspace;
    notify.success(result?.autoCraft ? 'Auto Craft stopped' : 'Auto Craft started', result?.autoCraft ? 'New rolls will stay in inventory.' : 'Useful future rolls will feed the Impossible sacrifice pool.');
    if (clearedPotion) notify.info('Potion auto-craft stopped', 'Only one Auto Craft can run at a time.');
    openImpossibleReview(workspace);
    renderRecipes();
  });
  dialog.querySelector('#impossiblePrepareFinal')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Checking authoritative totals…';
    try {
      const prepared = await prepareImpossiblePickaxeCraft();
      openImpossibleReview(prepared);
    } catch (prepareError) {
      notify.error('Could not prepare plan', prepareError.message);
      button.disabled = false;
      button.textContent = 'Refresh final sacrifice review';
    }
  });
  const checkbox = dialog.querySelector('#impossibleConfirm');
  const confirm = dialog.querySelector('#impossibleCraftConfirm');
  checkbox?.addEventListener('change', () => { confirm.disabled = !checkbox.checked; });
  confirm?.addEventListener('click', async () => {
    confirm.disabled = true;
    confirm.textContent = 'Crafting atomically…';
    try {
      const crafted = await craftImpossiblePickaxe(result.token);
      dialog.close();
      dialog.remove();
      notify.success(crafted.worldFirst ? 'WORLD FIRST — Impossible' : 'Crafted', crafted.worldFirst
        ? 'The Impossible Pickaxe and all three permanent world-first cosmetics are yours.'
        : 'The Impossible Pickaxe is now equipped.');
      await refresh();
    } catch (error) {
      notify.error('Craft failed safely', `${error.message}. Nothing was partially consumed.`);
      confirm.disabled = false;
      confirm.textContent = 'Consume and craft';
    }
  });
  dialog.addEventListener('close', () => dialog.remove(), {once:true});
  dialog.showModal();
}

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

  card.querySelector('[data-action="review-impossible"]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Opening workspace…';
    try {
      let workspace = await loadImpossiblePickaxeStatus();
      // Staged deployments may briefly have the original status response.
      if (!workspace?.preview) workspace = await prepareImpossiblePickaxeCraft();
      state.impossibleStatus = workspace;
      openImpossibleReview(workspace);
    } catch (error) {
      notify.error('Could not prepare plan', error.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Review sacrifice plan';
    }
  });

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
        if (enabled) {
          setAutoPotionRecipeId(null);
        } else {
          // Potions and equipment share one Auto Craft slot. Turning a
          // potion on clears any active equipment auto-craft so the two
          // cannot run simultaneously.
          const cleared = await setCloudAutoCraft(null);
          if (cleared.error) {
            notify.error("Could not change Auto Craft", cleared.error.message);
            button.disabled = false;
            return;
          }
          state.crafting.activeAutoCraftRecipeId = null;
          setAutoPotionRecipeId(recipeId);
        }

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

      const { error, clearedPotion } = await setEquipmentAutoCraft(enabled ? null : recipeId);

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

      if (clearedPotion) {
        notify.info("Potion auto-craft stopped", "Only one Auto Craft can run at a time.");
      }

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

  // Clear both slots. Only one should be set at a time, but clearing
  // both guarantees the banner reflects a clean state.
  stopPotionAutoCraft();

  const result = await setCloudAutoCraft(null);
  const error = result.error;

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
        if ("Notification" in window) {
          if (Notification.permission === "default") Notification.requestPermission().catch(() => {});
          if (Notification.permission === "granted" && document.hidden) new Notification("Auto Craft complete", { body: `${recipe.name} was crafted.` });
        }
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

async function loadAdminEquipmentRecipes() {
  const { data, error } = await (await import("../src/backend/supabase.js")).supabase
    .from("admin_content_catalog")
    .select("content_key,name,enabled,config")
    .eq("content_type","equipment")
    .eq("enabled",true);
  if (error) {
    console.warn("[CRAFT] Admin equipment catalogue unavailable:", error);
    return [];
  }
  return (data ?? []).map(row => {
    const c = row.config && typeof row.config === "object" ? row.config : {};
    const mode = String(c.boostMode ?? "rollSpeed");
    const value = Number(c.boostValue ?? 0);
    const bonus = mode === "rollBulk"
      ? { rollBulk: Math.max(0, Math.floor(value)) }
      : mode === "petLuck"
      ? { petLuck: Math.max(0, value) }
      : { rollSpeed: Math.max(0, value) };
    return {
      id: row.content_key,
      name: row.name,
      category: c.category ?? "pickaxe",
      craftingTab: c.category ?? "pickaxe",
      horizontal: true,
      equipmentOverhaul: true,
      moneyCost: Math.max(0, Number(c.moneyCost ?? 0)),
      description: c.description ?? "",
      requirements: Array.isArray(c.requirements) ? c.requirements : [],
      reward: {
        id: row.content_key,
        name: row.name,
        category: c.category ?? "pickaxe",
        tier: Math.max(1, Number(c.tier ?? 1)),
        bonus
      }
    };
  });
}

async function refresh() {
  const user = await ensurePlayerAuth();

  if (!user) {
    state.loading = false;

    if (isSignInRequired()) {
      subtitle.textContent = SIGN_IN_REQUIRED_MESSAGE;
      recipeList.innerHTML = signInEmptyStateHtml({
        title: "Craft pickaxes, clovers and more",
        body: "Log in or create a free account to turn your gems into equipment."
      });

      return;
    }

    subtitle.textContent = "Could not sign you in. Refresh to try again.";

    notify.error("Sign-in failed", "The game could not reach your account.");

    return;
  }

  const [craftingState, playerState, equipment, consumables, overhaulProgress, adminEquipmentRecipes, impossibleStatus] = await Promise.all([
    loadCloudCraftingState(),
    loadCloudPlayerState(),
    loadCloudEquipment(),
    loadCloudConsumables(),
    loadEquipmentOverhaulProgress(),
    loadAdminEquipmentRecipes(),
    loadImpossiblePickaxeStatus().catch(() => null)
  ]);

  state.loading = false;
  state.specialDiscoveries = overhaulProgress ?? {};
  state.impossibleStatus = impossibleStatus;
  state.specialDiscoveries.batchHistory = {
    ...(state.specialDiscoveries.batchHistory ?? {}),
    ...(impossibleStatus?.requirements ?? {})
  };
  state.genuineRolls = overhaulProgress?.genuineRolls ?? 0;

  if (craftingState) {
    state.crafting = craftingState;
    recipes = [...baseRecipes, ...(adminEquipmentRecipes ?? [])]
      .map(recipe => craftingState.progress?.[recipe.id]?._equipment_recipe ?? recipe);
  } else {
    recipes = [...baseRecipes, ...(adminEquipmentRecipes ?? [])];
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

  await applyEquipmentTabVisibility();
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
