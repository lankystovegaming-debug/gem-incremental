import recipes from "./src/data/recipes.js";

import {
  ensurePlayerAuth,
  getLastAuthError
} from "./src/backend/auth.js";
import { ensureCloudPlayer } from "./src/backend/playerCloud.js";
import { invokeFunction } from "./src/backend/invoke.js";
import { supabase } from "./src/backend/supabase.js";
import { runLegacyMigrationGate } from "./src/backend/legacyMigration.js";
import {
  loadCloudPlayerState,
  sellCloudGem
} from "./src/backend/cloudInventory.js";
import { loadActiveBoosts } from "./src/backend/cloudConsumables.js";
import { loadCloudCraftingState, loadCloudConsumables } from "./src/backend/cloudCrafting.js";
import { loadCloudEquipment, loadEquipmentOverhaulProgress } from "./src/backend/cloudEquipment.js";
import { isRequirementComplete } from "./src/logic/crafting.js";
import {
  batchCooldown,
  batchRollResults,
  isBatchSizeUnlocked,
  renderBatchOptions
} from "./src/logic/batchRolling.js";

import { mountShell } from "./src/ui/shell.js";
import { initReferral } from "./src/ui/referralBootstrap.js";
import { icons } from "./src/ui/icons.js";
import { notify } from "./src/ui/toast.js";
import { gemNameHtml, gemIconHtml } from "./src/ui/gemStyle.js";
import { renderCutscene } from "./src/ui/cutsceneScenes.js";
import {
  cutsceneController,
  cutsceneDuration,
  isCutsceneEligible
} from "./src/ui/cutsceneController.js";
import { getGemMutation } from "./src/data/mutations.js";
import { clearSessionInsights, getSessionInsights, recordSessionRoll } from "./src/ui/sessionInsights.js";
import { chanceLabelForRollResult } from "./src/logic/chances.js";
import {
  getSettings,
  hydrateSettingsFromCloud,
  updateSettings,
  onSettingsChange,
  shouldAutoKeep
} from "./src/ui/settings.js";
import {
  rarityTier,
  rarityLabel,
  formatMoney,
  formatGemValue,
  formatWeight,
  formatMultiplier,
  formatCount,
  formatSeconds,
  escapeHtml
} from "./src/ui/format.js";


const shell = mountShell({ page: "roll", base: "./" });

// Capture an inbound ?ref=CODE, attribute a fresh account to it, and settle
// any pending referral reward. Fire-and-forget so it never delays the page.
initReferral();


// =========================================================
// DOM
// =========================================================

const rollButton = document.getElementById("rollButton");
const rollButtonLabel = document.getElementById("rollButtonLabel");
const rollButtonFill = document.getElementById("rollButtonFill");
const gemStage = document.getElementById("gemStage");
const rollHint = document.getElementById("rollHint");
const effectHud = document.getElementById("effectHud");

const statMoney = document.getElementById("statMoney");
const statInventory = document.getElementById("statInventory");
const statRolls = document.getElementById("statRolls");
const inventoryMeter = document.getElementById("inventoryMeter");

const autoRollToggle = document.getElementById("autoRollToggle");
const batchSize = document.getElementById("batchSize");
const autoKeepToggle = document.getElementById("autoKeepToggle");
const autoKeepRarity = document.getElementById("autoKeepRarity");
const autoKeepRarityRow = document.getElementById("autoKeepRarityRow");
const automationPulse = document.getElementById("automationPulse");
const craftingProgressList = document.getElementById("craftingProgressList");
const craftingProgressUpdated = document.getElementById("craftingProgressUpdated");
const sessionInsightsPanel = document.getElementById("sessionInsightsPanel");
const clearSessionInsightsButton = document.getElementById("clearSessionInsights");
const sessionInsightStats = document.getElementById("sessionInsightStats");
const sessionHighlights = document.getElementById("sessionHighlights");
const sessionBreakdown = document.getElementById("sessionBreakdown");
const sessionNotable = document.getElementById("sessionNotable");

const historyList = document.getElementById("historyList");
const clearHistory = document.getElementById("clearHistory");

async function applyMainSectionSettings() {
  try {
    const { data, error } = await supabase
      .from("game_section_settings")
      .select("id, enabled")
      .order("sort_order");
    if (error) {
      console.warn("[SECTIONS] Could not load section settings:", error.message);
      return;
    }

    for (const section of data ?? []) {
      const element = document.getElementById(`section-${section.id}`);
      if (element) element.hidden = section.enabled === false;
    }
  } catch (error) {
    console.warn("[SECTIONS] Section settings unavailable:", error);
  }
}

applyMainSectionSettings();

document.getElementById("stageIdleMark").innerHTML = icons.gem;


// =========================================================
// LOCAL VIEW STATE
// =========================================================

const view = {
  money: null,
  inventoryCount: 0,
  capacity: 15,
  totalRolls: 0,
  genuineRolls: 0,
  hasCelestialPickaxe: false,
  equippedPickaxe: null,
  impossibleRolls: 0,
  impossibleJoke: null,
  impossibleJokeAt: null,
  ready: false
};

const history = [];
const automationStats = { startedAt: Date.now(), rolls: 0, earned: 0, kept: 0, sold: 0, status: "Idle" };

const MAX_HISTORY = 12;

let cooldownTimer = null;
let rollInFlight = false;

let consecutiveFailures = 0;


// =========================================================
// SUMMARY
// =========================================================

function renderSummary() {
  statMoney.textContent =
    view.money == null ? "—" : formatMoney(view.money, { exact: true });

  statInventory.textContent = `${formatCount(view.inventoryCount)} / ${formatCount(
    view.capacity
  )}`;

  statRolls.textContent = Math.round(Number(view.totalRolls ?? 0)).toLocaleString(
    "en-US"
  );

  shell.setWallet(view.money);

  const filled = view.capacity
    ? Math.min(100, (view.inventoryCount / view.capacity) * 100)
    : 0;

  inventoryMeter.style.width = `${filled}%`;

  inventoryMeter.className =
    "meter__fill" +
    (filled >= 100
      ? " meter__fill--negative"
      : filled >= 80
      ? " meter__fill--warning"
      : "");
}

function renderAutomationPulse() {
  if (!automationPulse) return;
  const minutes = Math.max(1 / 60, (Date.now() - automationStats.startedAt) / 60000);
  automationPulse.innerHTML = `<strong>${getSettings().autoRoll ? "Auto roll active" : automationStats.status}</strong><span>${(automationStats.rolls / minutes).toFixed(1)} rolls/min</span><span>${formatMoney(automationStats.earned, { exact: true })} earned</span><span>${automationStats.kept} kept · ${automationStats.sold} sold</span>`;
}

const CRAFTING_PREVIEW_REFRESH_MS = 60_000;

function craftingRequirementKey(requirement, index) {
  if (requirement.id) return requirement.id;
  if (requirement.type === "gem-count") return requirement.gem;
  if (["consumable", "consumable-count", "potion", "potion-count"].includes(requirement.type)) {
    return requirement.consumableId ?? requirement.consumable_id ?? requirement.potionId ?? requirement.potion_id ?? `${requirement.type}-${index}`;
  }
  return `${requirement.type}-${index}`;
}

function hasCraftingProgress(progress = {}) {
  return Object.entries(progress).some(([key, value]) => {
    if (key === "_equipment_recipe") return false;
    if (typeof value === "number") return value > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") {
      return Number(value.points ?? 0) > 0 || Object.keys(value).some((entry) => entry !== "gemTypes" && Number(value[entry] ?? 0) > 0);
    }
    return false;
  });
}

function requirementFraction(requirement, index, progress, context, complete) {
  if (complete) return 1;
  const value = progress[craftingRequirementKey(requirement, index)];
  const ratios = {
    "gem-count": [value, requirement.amount],
    "gem-total-weight": [value, requirement.totalWeight],
    "specimen-total-weight": [value, requirement.totalWeight],
    "specimen-value-total": [value, requirement.totalValue],
    "gem-min-weight-multiplier": [value, requirement.amount ?? 1],
    "gem-max-weight-multiplier": [value, requirement.amount ?? 1],
    "specimen-condition": [value, requirement.amount ?? 1],
    "lifetime-rolls": [context.totalRolls, requirement.rolls]
  };
  if (requirement.type === "rarity-points") ratios[requirement.type] = [value?.points, requirement.points];
  if (requirement.type === "equipment-history") ratios[requirement.type] = [context.specialDiscoveries?.batchHistory?.[requirement.metric], requirement.amount];
  if (requirement.type === "special-discoveries") ratios[requirement.type] = [context.specialDiscoveries?.[requirement.classification], requirement.amount];
  if (requirement.type === "gem-range") {
    const amounts = requirement.gems.map((name) => Math.min(1, Number(value?.[name] ?? 0) / Number(requirement.amountEach ?? 1)));
    return amounts.length ? amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length : 0;
  }
  const [current, target] = ratios[requirement.type] ?? [0, 1];
  return Math.max(0, Math.min(1, Number(current ?? 0) / Math.max(1, Number(target ?? 1))));
}

async function refreshCraftingProgressPreview() {
  if (!craftingProgressList) return;
  const user = await ensurePlayerAuth();
  if (!user) {
    craftingProgressList.innerHTML = '<p class="crafting-preview__empty">Sign in to view crafting progress.</p>';
    return;
  }
  const [crafting, player, equipment, consumables, overhaul] = await Promise.all([
    loadCloudCraftingState(), loadCloudPlayerState(), loadCloudEquipment(), loadCloudConsumables(), loadEquipmentOverhaulProgress()
  ]);
  if (!crafting || !player || !equipment || !consumables) {
    craftingProgressList.innerHTML = '<p class="crafting-preview__empty">Crafting progress could not be refreshed.</p>';
    return;
  }

  const recipeCatalog = recipes.map((recipe) => crafting.progress?.[recipe.id]?._equipment_recipe ?? recipe);
  const activeId = crafting.activeAutoCraftRecipeId;
  const context = {
    equipment: equipment.map((item) => ({ id: item.equipment_id })),
    consumables,
    totalRolls: player.total_rolls,
    genuineRolls: overhaul?.genuineRolls ?? 0,
    specialDiscoveries: overhaul ?? {},
    bestRareNaturalWeight100k: player.best_rare_natural_weight_100k,
    bestRareNaturalWeight1m: player.best_rare_natural_weight_1m
  };
  const started = recipeCatalog
    .filter((recipe) => recipe.id === activeId || hasCraftingProgress(crafting.progress?.[recipe.id]))
    .map((recipe) => {
      const progress = crafting.progress?.[recipe.id] ?? {};
      const results = recipe.requirements.map((requirement, index) => {
        const complete = isRequirementComplete(crafting, recipe, requirement, index, context);
        return { complete, fraction: requirementFraction(requirement, index, progress, context, complete) };
      });
      const fraction = results.length ? results.reduce((sum, result) => sum + result.fraction, 0) / results.length : 0;
      return { recipe, results, fraction };
    })
    .sort((a, b) => Number(b.recipe.id === activeId) - Number(a.recipe.id === activeId) || b.fraction - a.fraction);

  if (!started.length) {
    craftingProgressList.innerHTML = '<p class="crafting-preview__empty">No recipes in progress yet. Deposit materials on the Crafting page to begin.</p>';
  } else {
    craftingProgressList.innerHTML = started.map(({ recipe, results, fraction }) => {
      const completed = results.filter((result) => result.complete).length;
      const percent = Math.round(fraction * 100);
      return `<a class="crafting-preview__recipe" href="./crafting/" aria-label="Open ${escapeHtml(recipe.name)} in Crafting">
        <span class="crafting-preview__identity"><strong>${escapeHtml(recipe.name)}</strong><small>${recipe.id === activeId ? "Auto Craft · " : ""}${completed} / ${results.length} requirements</small></span>
        <span class="crafting-preview__percent">${percent}%</span>
        <span class="crafting-preview__bar"><span style="width:${percent}%"></span></span>
      </a>`;
    }).join("");
  }
  if (craftingProgressUpdated) craftingProgressUpdated.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · refreshes every minute`;
}

async function refreshPlayerState() {
  const [playerState, inventoryResult, equipment] = await Promise.all([
    loadCloudPlayerState(),

    supabase
      .from("inventory_gems")
      .select("id", { count: "exact", head: true })
      .neq("gem_name", "Enchant Relic")
      .neq("gem_name", "Ancient Relic"),

    loadCloudEquipment()
  ]);

  if (!playerState) {
    return false;
  }

  view.money = playerState.money;
  view.capacity = playerState.inventory_capacity;
  view.totalRolls = playerState.total_rolls;
  view.genuineRolls = playerState.equipment_genuine_rolls;
  view.impossibleRolls = Number(playerState.equipment_state?.rolls?.['impossible-pickaxe'] ?? 0);
  view.equippedPickaxe = (equipment ?? []).find(item => item.category === 'pickaxe' && item.equipped)?.equipment_id ?? null;
  view.hasCelestialPickaxe = (equipment ?? []).some(
    (item) => item.equipment_id === "celestial-pickaxe"
  );

  if (!inventoryResult.error) {
    view.inventoryCount = inventoryResult.count ?? 0;
  }

  renderSummary();
  paintSettings(getSettings());

  return playerState;
}


// =========================================================
// ROLL BUTTON STATES
// =========================================================

function setButton({ mode, label, disabled }) {
  rollButton.className = `roll-button${mode ? ` roll-button--${mode}` : ""}`;

  rollButtonLabel.textContent = label;

  rollButton.disabled = disabled;
}


function showReady() {
  stopCooldown();

  if (view.inventoryCount >= view.capacity) {  
    view.ready = false;

    setButton({
      mode: "blocked",
      label: "Inventory full",
      disabled: true
    });

    rollHint.innerHTML =
      'Sell or craft to free a slot — <a href="./inventory/">open inventory</a>';
    automationStats.status = "Paused · inventory full";
    renderAutomationPulse();

    return;
  }

  view.ready = true;
  automationStats.status = getSettings().autoRoll ? "Auto roll active" : "Ready";
  renderAutomationPulse();

  setButton({ mode: "", label: impossibleButtonJoke() ?? "Roll", disabled: false });

  rollButtonFill.style.transform = "scaleX(0)";

  rollHint.innerHTML = "<kbd>R</kbd> or <kbd>Space</kbd> to roll";

  maybeAutoRoll();
}


function showError(message) {
  stopCooldown();

  view.ready = false;

  setButton({ mode: "blocked", label: "Unavailable", disabled: true });

  rollHint.textContent = message;
}


// =========================================================
// COOLDOWN
// =========================================================

function startCooldown(endsAt, totalMs) {
  stopCooldown();

  view.ready = false;

  const span = totalMs ?? Math.max(1, endsAt - Date.now());

  setButton({ mode: "cooldown", label: "Ready in 0.0s", disabled: true });

  rollHint.innerHTML = getSettings().autoRoll
    ? "Auto roll is on — the next roll fires automatically."
    : "<kbd>R</kbd> or <kbd>Space</kbd> to roll";
  automationStats.status = getSettings().autoRoll ? "Waiting for cooldown" : "Cooldown";
  renderAutomationPulse();

  function tick() {
    const remaining = endsAt - Date.now();

    if (remaining <= 0) {
      showReady();

      return;
    }

    rollButtonLabel.textContent = `Ready in ${formatSeconds(remaining / 1000)}`;

    const progress = Math.min(1, Math.max(0, 1 - remaining / span));

    rollButtonFill.style.transform = `scaleX(${progress})`;
  }

  tick();

  cooldownTimer = setInterval(tick, 80);
}


function stopCooldown() {
  if (cooldownTimer) {
    clearInterval(cooldownTimer);

    cooldownTimer = null;
  }
}

const IMPOSSIBLE_JOKES = [
  'No refunds.','Was it worth it?','Fortune was right there.',
  'Surely this one.','$2.5 billion btw.','Congratulations?'
];

function impossibleButtonJoke() {
  if (view.equippedPickaxe !== 'impossible-pickaxe') return null;
  const size = Number(getSettings().batchSize ?? 1);
  let target = null;
  for (let offset = 1; offset <= size; offset += 1) {
    if ((view.impossibleRolls + offset) % 67 === 0) { target = view.impossibleRolls + offset; break; }
  }
  if (target == null) return null;
  if (view.impossibleJokeAt !== target) {
    view.impossibleJokeAt = target;
    view.impossibleJoke = IMPOSSIBLE_JOKES[Math.floor(Math.random() * IMPOSSIBLE_JOKES.length)];
  }
  return view.impossibleJoke;
}

function impossibleWorldFirstBrand() {
  return `<div class="impossible-roll-brand" aria-label="The Impossible — World First">
    <span class="impossible-roll-brand__crown" aria-hidden="true">♔</span>
    <span>THE IMPOSSIBLE</span><strong>WORLD FIRST</strong>
  </div><span class="impossible-roll-quote impossible-roll-quote--left">Reality is just<br>another drop table.</span>
  <span class="impossible-roll-quote impossible-roll-quote--right">Same game.<br>Different reality.</span>`;
}


// =========================================================
// GEM REVEAL
// =========================================================

function mutationNamesHtml(mutations = []) {
  const normalized = Array.isArray(mutations)
    ? mutations.filter((mutation) => mutation?.id)
    : [];

  if (!normalized.length) return "";

  return `
    <div class="gem-mutation-line ${normalized.length > 1 ? "gem-mutation-line--many" : ""}" aria-label="Mutations">
      ${normalized.map((mutation, index) => `
        ${index > 0 ? '<span class="mutation-name-separator" aria-hidden="true">·</span>' : ""}
        <span class="mutation-name-effect mutation-name-effect--${escapeHtml(mutation.id)}">
          <span class="mutation-name-effect__fx" aria-hidden="true"></span>
          <span class="mutation-name-effect__text">${escapeHtml(mutation.name ?? getGemMutation(mutation.id)?.name ?? mutation.id)}</span>
        </span>
      `).join("")}
    </div>
  `;
}

function appendBatchResults(results, outcomes) {
  if (!Array.isArray(results) || results.length <= 1) return;

  const cards = results.map((result, index) => {
    const genuineRoll = Number(result?.equipmentPassives?.genuineRoll);
    const rollLabel = `Roll ${index + 1}`;
    const counterLabel = Number.isSafeInteger(genuineRoll) ? ` · Genuine #${formatCount(genuineRoll)}` : "";

    if (result?.houseEdge) {
      return `
        <article class="batch-result batch-result--house-edge${result.impossibleWorldFirst ? ' batch-result--impossible' : ''}">
          <div class="batch-result__art" aria-hidden="true">🎰</div>
          <div class="batch-result__copy">
            <span class="batch-result__index">${rollLabel}${counterLabel}</span>
            <strong class="batch-result__name">House Edge</strong>
            <span class="batch-result__meta">No gem · still counted as a genuine roll</span>
          </div>
        </article>
      `;
    }

    if (result?.pet) {
      return `
        <article class="batch-result batch-result--pet${result.impossibleWorldFirst ? ' batch-result--impossible' : ''}">
          <div class="batch-result__art" aria-hidden="true">🐾</div>
          <div class="batch-result__copy">
            <span class="batch-result__index">${rollLabel}${counterLabel}</span>
            <strong class="batch-result__name">PET: ${escapeHtml(result.pet.name ?? result.pet.id)}</strong>
            <span class="batch-result__meta">Pet obtained · ×${formatCount(Number(result.pet.quantity ?? 1))} owned</span>
          </div>
        </article>
      `;
    }

    const tier = rarityTier(Number(result?.gem?.rarity ?? 0));
    const mutationIds = Array.isArray(result?.mutationIds) ? result.mutationIds : [];
    const outcome = outcomes.get(result);
    return `
      <article class="batch-result tier-${tier.id}${result.impossibleWorldFirst ? ' batch-result--impossible' : ''}">
        <div class="batch-result__art">${gemIconHtml(result.gem.name, "gem-icon--batch", mutationIds)}</div>
        <div class="batch-result__copy">
          <span class="batch-result__index">${rollLabel}${counterLabel}</span>
          <strong class="batch-result__name">${gemNameHtml(result.gem.name, escapeHtml)}</strong>
          ${historyMutationNamesHtml(result.mutations, mutationIds)}
          <span class="batch-result__meta">${escapeHtml(rarityLabel(result.gem.rarity))} · ${formatWeight(result.finalWeight)} · ${formatGemValue(result.value)}</span>
          <span class="batch-result__outcome">${escapeHtml(outcome?.text ?? "Stored in inventory")}</span>
        </div>
      </article>
    `;
  }).join("");

  const summary = document.createElement("section");
  summary.className = "batch-results";
  summary.setAttribute("aria-label", `${results.length} independent batch roll results`);
  summary.innerHTML = `
    <div class="batch-results__heading">
      <strong>All ${results.length} batch results</strong>
      <span>Each card is a separate genuine roll.</span>
    </div>
    <div class="batch-results__grid">${cards}</div>
  `;
  gemStage.append(summary);
}

function renderRoll(data, outcome) {
  const tier = rarityTier(data.gem.rarity);
  const rarity = Number(data.gem.rarity ?? 0);
  const isRelic = data.gem.dropType === "relic";
  const settings = getSettings();

  // Every non-relic roll gets the normal roll-effect. A full cutscene is
  // reserved for gems strictly rarer than the player-selected 1-in-N
  // threshold. Relics never trigger either — their odds ignore Luck, so
  // they get a plain reveal.
  const isUltraRare = isCutsceneEligible({
    rarity,
    threshold: settings.cutsceneMinimumRarity,
    dropType: data.gem.dropType
  });
  const isEpicRollEffect = !isRelic;

  const gemName = String(data.gem.name ?? "Gem");
  let gemHash = 0;
  for (let i = 0; i < gemName.length; i += 1) {
    gemHash = (gemHash * 31 + gemName.charCodeAt(i)) >>> 0;
  }
  const visualVariant = gemHash % 10;
  const visualHue = gemHash % 360;
  const visualSpeed = (0.78 + ((gemHash >>> 8) % 48) / 100).toFixed(2);
  const mutationIds = Array.from(new Set(
    (Array.isArray(data?.mutations) ? data.mutations.map(m => m?.id) : [])
      .concat(data?.mutation?.id ?? [])
      .filter(Boolean)
      .map(id => String(id).toLowerCase())
  ));

  gemStage.className = [
    "stage__display",
    "is-revealed",
    `tier-${tier.id}`,
    `visual-variant-${visualVariant}`,
    isEpicRollEffect ? "is-epic-roll" : "",
    isUltraRare ? "is-ultra-rare" : "",
    data.deepcore?.rollCard ? "has-deepcore-roll-card" : "",
    data.impossibleWorldFirst ? "is-impossible-world-first" : ""
  ].filter(Boolean).join(" ");
  gemStage.style.setProperty("--gem-hue", `${visualHue}`);
  gemStage.style.setProperty("--gem-speed", visualSpeed);

  gemStage.innerHTML = `
    ${isEpicRollEffect ? `
      <div class="epic-roll-effect" aria-hidden="true">
        <span class="epic-roll-effect__backdrop"></span>
        <span class="epic-roll-effect__halo epic-roll-effect__halo--1"></span>
        <span class="epic-roll-effect__halo epic-roll-effect__halo--2"></span>
        <span class="epic-roll-effect__halo epic-roll-effect__halo--3"></span>
        <span class="epic-roll-effect__ring epic-roll-effect__ring--1"></span>
        <span class="epic-roll-effect__ring epic-roll-effect__ring--2"></span>
        <span class="epic-roll-effect__ring epic-roll-effect__ring--3"></span>
        <span class="epic-roll-effect__ring epic-roll-effect__ring--4"></span>
        <span class="epic-roll-effect__beam epic-roll-effect__beam--1"></span>
        <span class="epic-roll-effect__beam epic-roll-effect__beam--2"></span>
        <span class="epic-roll-effect__beam epic-roll-effect__beam--3"></span>
        <span class="epic-roll-effect__spark-field"></span>
        <span class="epic-roll-effect__burst"></span>
        <span class="epic-roll-effect__shockwave"></span>
        <span class="epic-roll-effect__flash"></span>
      </div>
    ` : ""}
    ${data.impossibleWorldFirst ? impossibleWorldFirstBrand() : ''}
    <div class="gem-reveal">
      <div class="gem-reveal__art">${gemIconHtml(data.gem.name, "gem-icon--roll", mutationIds)}</div>
      <span class="badge badge--tier">${isRelic ? "RELIC" : tier.name}</span>
      <h2 class="gem-reveal__name">${gemNameHtml(data.gem.name, escapeHtml)}</h2>
      ${mutationNamesHtml(data?.mutations)}
      ${data.finalStats?.maxLuck != null ? `<p class="gem-reveal__outcome">Gem-selection Luck: ${formatMultiplier(data.finalStats.luck)} · Max Luck: ${formatMultiplier(data.finalStats.maxLuck)} · Uncapped: ${formatMultiplier(data.finalStats.uncappedLuck)}</p>` : ""}
      <p class="page-head__sub num">${isRelic ? "RELIC" : rarityLabel(data.gem.rarity)}</p>
      <p class="gem-reveal__chance num">${isRelic ? `Flat chance: 1 in ${formatCount(data.gem.name === "Ancient Relic" ? 1500 : 250)} · unaffected by Luck` : `Actual chance: ${escapeHtml(chanceLabelForRollResult(data, data.gem, mutationIds))}`}</p>
      ${isRelic ? '<p class="gem-reveal__outcome">This relic was added to your stacked balance. Use it on an equipped pickaxe in Inventory.</p>' : `<div class="gem-reveal__facts">
        <div class="gem-fact"><span class="gem-fact__label">Weight</span><span class="gem-fact__value">${formatWeight(data.finalWeight)}</span></div>
        <div class="gem-fact"><span class="gem-fact__label">Multiplier</span><span class="gem-fact__value">${formatMultiplier(data.weightMultiplier)}</span></div>
        <div class="gem-fact"><span class="gem-fact__label">Value</span><span class="gem-fact__value">${formatGemValue(data.value)}</span></div>
      </div>`}
    </div>
    <div class="roll-action-status" role="status">
      ${data.equipmentPassives?.bagged ? '<span class="roll-action-status__flag">🛍️ Bagged</span>' : ""}
      <span class="roll-action-status__outcome">${outcome.icon}${escapeHtml(outcome.text)}</span>
    </div>
  `;

  if (isUltraRare) {
    const duration = cutsceneDuration({ rarity, gemName });
    if (settings.rollAnimations) {
      gemStage.classList.add("is-animating", "is-big", "is-cinematic");
      gemStage.style.setProperty("--cinematic-duration", `${duration}ms`);
    }

    return cutsceneController.play({
      duration,
      render: () => renderCutscene(data, duration),
      onCleanup: () => {
        gemStage.classList.remove("is-animating", "is-big", "is-cinematic", "is-ultra-rare");
        gemStage.style.removeProperty("--cinematic-duration");
        gemStage.style.removeProperty("--gem-hue");
        gemStage.style.removeProperty("--gem-speed");
      }
    });
  }

  if (!settings.rollAnimations) return Promise.resolve();
  gemStage.classList.add("is-animating");

  if (isEpicRollEffect) gemStage.classList.add("is-big");

  setTimeout(() => {
    gemStage.classList.remove("is-animating", "is-big", "is-epic-roll");
    gemStage.style.removeProperty("--gem-hue");
    gemStage.style.removeProperty("--gem-speed");
  }, isEpicRollEffect ? 3300 : 950);
  return Promise.resolve();
}

function addHistory(data, note) {
  const tier = rarityTier(data.gem.rarity);
  const liveMutations = Array.isArray(data?.mutations)
    ? data.mutations.filter((mutation) => mutation?.id)
    : (data?.mutation?.id ? [data.mutation] : []);

  history.unshift({
    name: data.gem.name,
    tier,
    weight: data.finalWeight,
    value: data.value,
    mutations: liveMutations.map((mutation) => ({
      id: String(mutation.id),
      name: String(mutation.name ?? getGemMutation(mutation.id)?.name ?? mutation.id)
    })),
    mutationIds: liveMutations.map((mutation) => mutation.id),
    chance: chanceLabelForRollResult(data, data.gem, liveMutations.map((mutation) => mutation.id)),
    note
  });

  if (history.length > MAX_HISTORY) {
    history.length = MAX_HISTORY;
  }

  renderHistory();
}


function historyMutationNamesHtml(mutations = [], legacyIds = []) {
  const normalized = Array.isArray(mutations) && mutations.length
    ? mutations
    : (Array.isArray(legacyIds) ? legacyIds : []).map((id) => ({ id }));
  if (!normalized.length) return "";
  return `<span class="history__mutations">${normalized.map((mutation, index) => {
    const id = String(mutation?.id ?? "");
    const name = mutation?.name ?? getGemMutation(id)?.name ?? id;
    if (!id || !name) return "";
    const separator = index > 0 ? '<span class="mutation-name-separator" aria-hidden="true">·</span>' : "";
    return `${separator}<span class="mutation-name-effect mutation-name-effect--${escapeHtml(id)}"><span class="mutation-name-effect__fx" aria-hidden="true"></span><span class="mutation-name-effect__text">${escapeHtml(name)}</span></span>`;
  }).join("")}</span>`;
}

function renderHistory() {
  if (history.length === 0) {
    historyList.innerHTML =
      '<p class="history__empty">Your rolls from this visit will appear here.</p>';
    return;
  }

  historyList.innerHTML = history
    .map(
      (entry) => `
        <div class="history__row tier-${entry.tier.id}">
          <span class="history__dot"></span>

          <span class="history__name">${gemNameHtml(entry.name, escapeHtml)}</span>
          ${historyMutationNamesHtml(entry.mutations, entry.mutationIds)}

          <span class="history__meta">${escapeHtml(entry.chance)} · ${escapeHtml(
            entry.note || formatWeight(entry.weight)
          )}</span>

          <span class="history__value">${formatGemValue(entry.value)}</span>
        </div>
      `
    )
    .join("");
}

function sessionHighlight(label,item,formatter){if(!item)return"";return `<div><span>${label}</span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(formatter(item))}</small></div>`;}
function sessionRollName(item){const mutations=Array.isArray(item?.mutationNames)?item.mutationNames:[];return [...mutations,item?.name||"Unknown"].join(" ");}
function renderSessionInsights(){
  if(!sessionInsightsPanel)return;
  const state=getSessionInsights(),elapsed=Math.max(0,Date.now()-new Date(state.startedAt).getTime()),hours=Math.floor(elapsed/3600000),minutes=Math.floor(elapsed%3600000/60000);
  sessionInsightStats.innerHTML=[["Duration",`${hours}h ${minutes}m`],["Rolls",formatCount(state.rolls)],["Kept",formatCount(state.kept)],["Auto kept",formatCount(state.autoKept)],["Auto sold",formatCount(state.autoSold)],["Auto-sell income",formatMoney(state.autoSoldValue)],["Relics",formatCount(state.relics)],["Auto crafted",formatCount(state.autoCrafted)],["Bundle contributions",formatCount(state.bundleContributed)]].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join("");
  sessionHighlights.innerHTML=sessionHighlight("Rarest effective",state.bestEffective,item=>`1/${Math.round(item.effectiveRarity).toLocaleString()}`)+sessionHighlight("Rarest base",state.bestBase,item=>`1/${Math.round(item.baseRarity).toLocaleString()}`)+sessionHighlight("Heaviest",state.heaviest,item=>formatWeight(item.weight))+sessionHighlight("Most valuable",state.mostValuable,item=>formatGemValue(item.value));
  sessionBreakdown.innerHTML=Object.entries(state.rarities).sort((a,b)=>b[1]-a[1]).map(([tier,count])=>`<span class="badge">${escapeHtml(tier)} · ${formatCount(count)}</span>`).join("")||"<small>No rolls yet.</small>";
  sessionNotable.innerHTML=state.notable.slice(0,6).map(item=>`<div><strong>${escapeHtml(sessionRollName(item))}</strong><span>1/${Math.round(item.effectiveRarity).toLocaleString()} · ${escapeHtml(item.decision.replaceAll("-"," "))}</span></div>`).join("")||"<small>Mutation and 1/100,000+ rolls will appear here.</small>";
}
window.addEventListener("session-insights:change",renderSessionInsights);
renderSessionInsights();


// =========================================================
// ROLLING
// =========================================================

async function performRoll() {
  if (rollInFlight || cutsceneController.isActive || !view.ready) {
    return;
  }

  rollInFlight = true;

  stopCooldown();

  setButton({ mode: "rolling", label: impossibleButtonJoke() ?? "Rolling", disabled: true });

  const { data, error } = await invokeFunction("roll", { batchSize: getSettings().batchSize, pool: getSettings().rollPool });

  rollInFlight = false;

  // -------------------------------------------------------
  // ERRORS
  // -------------------------------------------------------

  if (error) {
    if (error.code === "deep_sea_event_ended" || error.details?.cause?.error === "deep_sea_event_ended") {
      const wasAutoRolling = getSettings().autoRoll;
      await updateSettings({ autoRoll: false, rollPool: "normal" });
      if (wasAutoRolling) notify.warning("The tide has receded", "Deep Sea Auto Roll stopped and your roll pool returned to Normal.");
      showReady();
      return;
    }
    if (error.code === "cooldown" && error.details?.nextRollAt) {
      startCooldown(new Date(error.details.nextRollAt).getTime());

      return;
    }

    if (error.code === "inventory_full") {
      view.inventoryCount = view.capacity;

      renderSummary();

      showReady();

      if (getSettings().autoRoll) {
        updateSettings({ autoRoll: false });

        notify.warning(
          "Auto roll paused",
          "Your inventory filled up."
        );
      }

      return;
    }

    consecutiveFailures += 1;

    notify.error("Roll failed", error.message);

    if (consecutiveFailures >= 3 && getSettings().autoRoll) {
      updateSettings({ autoRoll: false });

      notify.warning(
        "Auto roll stopped",
        "Too many failed rolls in a row."
      );
    }

    view.ready = true;

    setButton({ mode: "", label: impossibleButtonJoke() ?? "Roll", disabled: false });

    return;
  }

  consecutiveFailures = 0;

  if (!data) {
    showError("The server did not return a roll.");

    return;
  }

  // -------------------------------------------------------
  // APPLY RESULT
  // -------------------------------------------------------

  const results = batchRollResults(data);
  const outcomes = new Map();
  let featured = null;

  for (const result of results) {
    activeMutationEffects = Array.isArray(result.activeMutationEffects)
      ? result.activeMutationEffects
      : activeMutationEffects;
    view.inventoryCount = result.inventory?.count ?? view.inventoryCount;
    view.capacity = result.inventory?.capacity ?? view.capacity;
    view.totalRolls = result.lifetimeStats?.totalRolls ?? view.totalRolls + 1;
    view.genuineRolls = result.equipmentPassives?.genuineRoll ?? view.genuineRolls + 1;
    view.impossibleRolls = Number(result.equipmentPassives?.state?.rolls?.['impossible-pickaxe'] ?? view.impossibleRolls);
    automationStats.rolls += 1;

    if (result.houseEdge) {
      recordSessionRoll(result, { type: "house-edge" });
      if (!featured) featured = result;
      continue;
    }

    const outcome = await resolveOutcome(result);
    outcomes.set(result, outcome);
    automationStats.earned += Number(outcome?.soldValue ?? 0);
    if (outcome?.type === "auto-sold") automationStats.sold += 1;
    else if (["auto-kept", "kept"].includes(outcome?.type)) automationStats.kept += 1;
    recordSessionRoll(result, { ...outcome, tier: rarityTier(result.gem.rarity).id });
    addHistory(result, outcome.note);

    // Every result announces independently; batching must not collapse rare
    // chat/progression events into one representative specimen.
    window.dispatchEvent(new CustomEvent("gem:roll-complete", { detail: result }));
    if (!featured || Number(result.effectiveRarity ?? 0) >= Number(featured.effectiveRarity ?? 0)) {
      featured = result;
    }
  }

  renderEffects();
  if (activeMutationEffects.some((effect) => Number(effect.rollsRemaining) > 0)) startEffectTicker();
  renderAutomationPulse();
  renderSessionInsights();
  renderSummary();
  paintSettings(getSettings());

  let cinematicPromise = Promise.resolve();
  if (featured?.houseEdge) {
    gemStage.className = `stage__display is-revealed${featured.impossibleWorldFirst ? ' is-impossible-world-first' : ''}`;
    gemStage.innerHTML = `${featured.impossibleWorldFirst ? impossibleWorldFirstBrand() : ''}<div class="gem-reveal"><h2>House Edge</h2><p>No gem this time. This roll still counts toward progression.</p></div>`;
  } else if (featured) {
    cinematicPromise = renderRoll(featured, outcomes.get(featured));
  }
  appendBatchResults(results, outcomes);

  const cooldown = batchCooldown(data);
  if (cooldown?.nextRollAt) {
    startCooldown(new Date(cooldown.nextRollAt).getTime(), cooldown.durationMs);
  }

  // Keep the roll locked for the entire eligible cinematic. If the server
  // cooldown is shorter, its timer will wait for the cinematic lock before
  // allowing the next roll.
  await cinematicPromise;

  if (!cooldownTimer) {
    showReady();
  }
}


// Server Bundle routing and Auto Craft resolve before client Auto Sell.
// Ambiguous Bundle matches and Crown candidates remain in inventory.
// Only gems that remain in inventory can reach the Auto Sell rule.
async function resolveOutcome(data) {
  if (data.deepcore?.autoContributed) {
    return {
      type: "deepcore-contributed",
      icon: "⛏",
      text: `Auto-contributed to Deepcore · ${data.deepcore.objective}`,
      note: "deepcore contribution"
    };
  }
  if (data.pet) {
    return {
      type: "pet",
      icon: "🐾",
      text: `PET FOUND — ${data.pet.name ?? data.pet.id}!`,
      note: "pet obtained"
    };
  }

  if (data.bundle?.status === "deposited") {
    return { type: "bundle-contributed", icon: icons.book,
      text: "Contributed to your Collection", note: "bundle contributed" };
  }
  if (data.bundle?.keepInInventory) {
    return { type: "auto-kept", icon: icons.shield,
      text: data.bundle.status === "kept" ? `Kept — ${data.bundle.reason}` : data.bundle.status === "protected" ? "Kept — Crown Jewel candidate (manual submission only)"
        : "Kept — more than one enabled Collection requirement matches",
      note: "collection protected" };
  }
  if (data.autoCraft?.deposited) {
    const recipe = recipes.find(
      (entry) => entry.id === data.autoCraft.recipeId
    );

    return {
      type: "auto-crafted",
      icon: icons.anvil,
      text: `Deposited into ${recipe?.name ?? "your Auto Craft target"}${data.autoCraft.preserved ? " — Conservation kept the gem" : ""}`,
      note: "deposited"
    };
  }

  const tier = rarityTier(data.gem.rarity);

  if (!data.gemFilter && shouldAutoKeep(data)) {
    return {
      type: "auto-kept",
      icon: icons.shield,
      text: "Kept — effective rarity is protected by Auto Keep",
      note: "auto kept"
    };
  }

  if (data.gemFilter?.sold) {
    view.money = Number(data.gemFilter.money ?? view.money);
    return { type: "auto-sold", soldValue: data.gemFilter.soldValue, icon: icons.coins,
      text: `Gem Filter sold for ${formatMoney(data.gemFilter.soldValue)}`, note: 'filter sold' };
  }

  return {
    type: "kept",
    icon: icons.bag,
    text: `Stored — ${formatCount(data.inventory?.count ?? 0)} of ${formatCount(
      data.inventory?.capacity ?? view.capacity
    )} slots used`,
    note: ""
  };
}


// =========================================================
// ACTIVE POTION EFFECTS (Minecraft-style HUD)
//
// Shows each running boost with a live countdown in the corner
// of the stage, so timed potions are visible while rolling.
// =========================================================

const EFFECT_STATS = {
  luck: "Luck",
  rollSpeed: "Roll speed",
  weightLuck: "Weight luck",
  weightMultiplier: "Weight multiplier",
  petLuck: "Pet Luck"
};

let activeBoosts = [];
let activeMutationEffects = [];
let effectTicker = null;

// family -> { end, total } so the bar can deplete smoothly even
// though the server only reports an expiry, not a start time.
const effectBaseline = new Map();


function liveBoosts() {
  const now = Date.now();

  return activeBoosts.filter(
    (boost) => new Date(boost.expires_at).getTime() > now
  );
}


function formatEffectRemaining(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));

  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(
      2,
      "0"
    )}s`;
  }

  return `${seconds}s`;
}


function renderEffects() {
  if (!effectHud) {
    return;
  }

  const live = liveBoosts();
  const mutationLive = Array.isArray(activeMutationEffects) ? activeMutationEffects.filter((e)=>Number(e.rollsRemaining)>0) : [];

  if (live.length === 0 && mutationLive.length === 0) {
    effectHud.innerHTML = "";
    effectHud.classList.remove("is-active");

    return;
  }

  effectHud.classList.add("is-active");

  const now = Date.now();

  const potionHtml = live
    .map((boost) => {
      const end = new Date(boost.expires_at).getTime();
      const remaining = Math.max(0, end - now);

      const prev = effectBaseline.get(boost.family);
      let total;

      if (!prev || prev.end !== end) {
        total = remaining || 1;
        effectBaseline.set(boost.family, { end, total });
      } else {
        total = Math.max(prev.total, remaining);
      }

      const fraction = Math.max(0, Math.min(1, remaining / total));
      const percent = Math.round(Number(boost.effect_value) * 100);

      return `
        <div class="effect-chip effect-chip--${boost.family}">
          <span class="effect-chip__icon">${icons.potion ?? icons.bolt}</span>

          <span class="effect-chip__body">
            <span class="effect-chip__name">+${percent}% ${escapeHtml(
        EFFECT_STATS[boost.family] ?? boost.family
      )}</span>
            <span class="effect-chip__time">${boost.family === "petLuck" ? "Until pet roll" : formatEffectRemaining(
              remaining
            )}</span>
          </span>

          <span class="effect-chip__bar">
            <span style="width:${boost.family === "petLuck" ? 100 : fraction * 100}%"></span>
          </span>
        </div>
      `;
    })
    .join("");
  const mutationHtml = mutationLive.map((effect)=>`<div class="effect-chip effect-chip--mutation"><span class="effect-chip__icon">✦</span><span class="effect-chip__body"><span class="effect-chip__name">${escapeHtml(effect.name)}</span><span class="effect-chip__time">×${Number(effect.multiplier).toLocaleString("en-US",{maximumFractionDigits:3})} · ${Number(effect.rollsRemaining)} roll${Number(effect.rollsRemaining)===1?"":"s"}</span></span><span class="effect-chip__bar"><span style="width:100%"></span></span></div>`).join("");
  effectHud.innerHTML = potionHtml + mutationHtml;
}


function startEffectTicker() {
  if (effectTicker) {
    return;
  }

  effectTicker = setInterval(() => {
    renderEffects();

    if (liveBoosts().length === 0 && (!Array.isArray(activeMutationEffects) || activeMutationEffects.every((e)=>Number(e.rollsRemaining)<=0))) {
      clearInterval(effectTicker);

      effectTicker = null;
    }
  }, 1000);
}


async function refreshEffects() {
  const boosts = await loadActiveBoosts();

  if (boosts) { activeBoosts = boosts; }
  try {
    const { data: mutationEffects } = await supabase.rpc("get_active_mutation_effects");
    activeMutationEffects = Array.isArray(mutationEffects) ? mutationEffects : [];
  } catch { activeMutationEffects = []; }
  renderEffects();
  if (liveBoosts().length > 0 || activeMutationEffects.some((e)=>Number(e.rollsRemaining)>0)) startEffectTicker();
}


// =========================================================
// AUTOMATION
// =========================================================

function maybeAutoRoll() {
  if (
    !getSettings().autoRoll ||
    !view.ready ||
    rollInFlight ||
    cutsceneController.isActive
  ) {
    return;
  }

  if (document.hidden) {
    // Background tabs throttle timers; pick up again on focus.
    return;
  }

  // Fire the next roll as soon as the server cooldown ends. The old 350ms
  // artificial delay made auto-roll feel noticeably laggy.
  queueMicrotask(() => {
    if (getSettings().autoRoll && view.ready && !rollInFlight && !cutsceneController.isActive) {
      performRoll();
    }
  });
}


document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    maybeAutoRoll();

    // Potions may have been used on another page/tab.
    refreshEffects();
  }
});


// =========================================================
// AUTOMATION CONTROLS
// =========================================================




function paintSettings(settings) {
  autoRollToggle.checked = settings.autoRoll;
  if (batchSize) {
    const access = {
      totalRolls: view.totalRolls,
      hasCelestialPickaxe: view.hasCelestialPickaxe
    };
    batchSize.innerHTML = renderBatchOptions(access);
    batchSize.value = String(isBatchSizeUnlocked(settings.batchSize, access) ? settings.batchSize : 1);
  }
  if (autoKeepToggle) autoKeepToggle.checked = settings.autoKeep;
  if (autoKeepRarity) autoKeepRarity.value = settings.autoKeepEffectiveRarity;
  if (autoKeepRarityRow) autoKeepRarityRow.classList.toggle("automation__row--muted", !settings.autoKeep);


  renderAutomationPulse();
}


autoRollToggle.addEventListener("change", async () => {
  let settings;
  try { settings = await updateSettings({ autoRoll: autoRollToggle.checked }); }
  catch { return; }

  if (settings.autoRoll) {
    notify.info("Auto roll on", "Rolling continues while this tab is open.");

    maybeAutoRoll();
  }
});

batchSize?.addEventListener("change", () => {
  updateSettings({ batchSize: Number(batchSize.value) });
});







if (autoKeepToggle) autoKeepToggle.addEventListener("change", () => {
  updateSettings({ autoKeep: autoKeepToggle.checked });
});

if (autoKeepRarity) autoKeepRarity.addEventListener("change", () => {
  updateSettings({ autoKeepEffectiveRarity: Number(autoKeepRarity.value) });
});


onSettingsChange((settings) => {
  paintSettings(settings);

  if (settings.autoRoll) {
    maybeAutoRoll();
  }
});


paintSettings(getSettings());


// =========================================================
// INPUT
// =========================================================

rollButton.addEventListener("click", () => performRoll());


clearHistory.addEventListener("click", () => {
  history.length = 0;

  renderHistory();
});

clearSessionInsightsButton?.addEventListener("click", () => {
  clearSessionInsights();
  renderSessionInsights();
});


document.addEventListener("keydown", (event) => {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  const target = event.target;

  if (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))
  ) {
    return;
  }

  if (event.code === "Space" || event.key.toLowerCase() === "r") {
    event.preventDefault();

    performRoll();
  }
});


// =========================================================
// STARTUP
// =========================================================

async function startGame() {
  setButton({ mode: "blocked", label: "Loading", disabled: true });

  renderHistory();

  const user = await ensurePlayerAuth();

  if (!user) {
    // Which stage failed matters when diagnosing a player who
    // cannot start at all, so it is shown rather than buried in
    // the console.
    const authError = getLastAuthError();

    // Both backend probes failing usually points to a managed
    // school or work device blocking the backend domain, rather
    // than a genuine auth fault, so the message says so.
    const backendBlocked =
      authError?.diagnostics &&
      !authError.diagnostics.rest.reachable &&
      !authError.diagnostics.auth.reachable;

    showError(
      backendBlocked
        ? "Could not reach the game's backend. If this is a school or work device, the backend domain may be blocked — try another device."
        : authError
        ? `Could not start your save (${authError.stage}): ${authError.message}`
        : "Could not sign you in. Refresh to try again."
    );

    notify.error(
      "Sign-in failed",
      backendBlocked
        ? "The backend may be blocked on this device."
        : authError?.message ?? "The game could not reach the account service."
    );

    return;
  }

  // The Edge Functions reject every call with "Player record
  // not found." until public.players holds a row for this user,
  // so the row is created before anything else reads the save.
  const cloudPlayer = await ensureCloudPlayer(user);

  if (!cloudPlayer) {
    showError("Could not set up your save. Refresh to try again.");

    notify.error(
      "Save unavailable",
      "Your player record could not be created."
    );

    return;
  }

  try {
    await runLegacyMigrationGate();
  } catch (error) {
    console.error("Legacy migration gate failed:", error);
  }

  const playerState = await refreshPlayerState();

  if (!playerState) {
    showError("Could not load your save. Refresh to try again.");

    return;
  }

  refreshEffects();

  await restoreCooldown(playerState.next_roll_at);
}


async function restoreCooldown(nextRollAtValue) {
  const nextRollAt = nextRollAtValue
    ? new Date(nextRollAtValue).getTime()
    : 0;

  if (nextRollAt > Date.now()) {
    startCooldown(nextRollAt);

    return;
  }

  showReady();
}


window.addEventListener("pageshow", async (event) => {
  // Returning through the back/forward cache: the save may have
  // changed on another page.
  if (!event.persisted) {
    return;
  }

  const user = await ensurePlayerAuth();

  if (!user) {
    return;
  }

  const playerState = await refreshPlayerState();

  refreshEffects();

  await restoreCooldown(playerState?.next_roll_at);
});


// The maintenance panel can change this account's save while the
// page is open; re-read state so the totals and roll button stay
// current instead of showing stale numbers.
window.addEventListener("gem:maintenance-refresh", async () => {
  const user = await ensurePlayerAuth();

  if (!user) {
    return;
  }

  const playerState = await refreshPlayerState();

  refreshEffects();

  await restoreCooldown(playerState?.next_roll_at);
});


startGame();
refreshCraftingProgressPreview();
setInterval(refreshCraftingProgressPreview, CRAFTING_PREVIEW_REFRESH_MS);

const buffsIndicator = document.createElement('p');
buffsIndicator.className = 'badge badge--warning';
buffsIndicator.setAttribute('role', 'status');
buffsIndicator.textContent = 'Buffs disabled — rolling at base stats (1× Luck, Roll Speed, Weight Luck and Weight Multiplier)';
document.getElementById('rollButton')?.parentElement?.prepend(buffsIndicator);
if (!buffsIndicator.isConnected) document.querySelector('main')?.prepend(buffsIndicator);
const paintBuffs = settings => { buffsIndicator.hidden = settings.enableBuffs !== false; buffsIndicator.classList.toggle('hidden', buffsIndicator.hidden); };
onSettingsChange(paintBuffs); paintBuffs(getSettings());
window.addEventListener('gem:roll-complete', event => {
 if (typeof event.detail?.buffsEnabled === 'boolean') paintBuffs({ enableBuffs:event.detail.buffsEnabled });
});

hydrateSettingsFromCloud().catch(error => notify.error("Settings unavailable", error.message));

window.addEventListener("gem:settings-error", event => { paintSettings(getSettings()); notify.error("Settings were not saved", event.detail.message); });
