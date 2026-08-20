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
import { loadExpeditionDashboard } from "./src/backend/cloudExpeditions.js";

import { mountShell } from "./src/ui/shell.js";
import { icons } from "./src/ui/icons.js";
import { notify } from "./src/ui/toast.js";
import { gemNameHtml } from "./src/ui/gemStyle.js";
import { buildXyGemCutscene } from "./src/ui/xyGemCutscene.js";
import { buildJaOreCutscene } from "./src/ui/jaOreCutscene.js";
import { getGemMutation } from "./src/data/mutations.js";
import { chanceLabelForResult } from "./src/logic/chances.js";
import {
  getSettings,
  updateSettings,
  onSettingsChange,
  shouldAutoSell,
  SELL_TIERS
} from "./src/ui/settings.js";
import {
  rarityTier,
  rarityLabel,
  formatMoney,
  formatWeight,
  formatMultiplier,
  formatCount,
  formatSeconds,
  escapeHtml
} from "./src/ui/format.js";


const shell = mountShell({ page: "roll", base: "./" });


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
const autoSellToggle = document.getElementById("autoSellToggle");
const autoSellTier = document.getElementById("autoSellTier");
const autoSellTierRow = document.getElementById("autoSellTierRow");

const historyList = document.getElementById("historyList");
const clearHistory = document.getElementById("clearHistory");
const expeditionPreview = document.getElementById("expeditionPreview");

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
  ready: false
};

const history = [];

const MAX_HISTORY = 12;

let cooldownTimer = null;
let rollInFlight = false;
// Ultra-rare cinematic lock. 1/100k+ reveals own the input while the
// cinematic is playing, so auto-roll and keyboard/manual rolling cannot
// interrupt the reveal.
let cinematicActive = false;
let cinematicTimer = null;

function cinematicDuration(rarity = 100000) {
  // Cinematics scale with rarity. Every 1/100k+ result gets a full
  // fullscreen reveal, while 1/4m+ results become deliberately long,
  // multi-beat "event" cinematics.
  const rarityValue = Number(rarity ?? 100000);
  let duration = 8200;

  if (rarityValue >= 10000000) duration = 22000;
  else if (rarityValue >= 4000000) duration = 18000;
  else if (rarityValue >= 1800000) duration = 15000;
  else if (rarityValue >= 800000) duration = 13500;
  else if (rarityValue >= 480000) duration = 12000;
  else if (rarityValue >= 250000) duration = 10500;
  else if (rarityValue >= 100000) duration = 9000;
  else if (rarityValue >= 10000) duration = 2400;

  // Give phones a little more breathing room without making the
  // ultra-rare experience materially shorter.
  return window.matchMedia("(max-width: 700px), (pointer: coarse)").matches
    ? Math.round(duration * 1.08)
    : duration;
}

function endCinematic() {
  cinematicActive = false;
  document.documentElement.classList.remove("is-cinematic-active");

  if (cinematicTimer) {
    clearTimeout(cinematicTimer);
    cinematicTimer = null;
  }

  // If the normal cooldown already expired while the cinematic was
  // playing, make the roll button available now.
  if (!cooldownTimer && !rollInFlight) {
    showReady();
  }
}

let consecutiveFailures = 0;


// =========================================================
// SUMMARY
// =========================================================

function renderSummary() {
  statMoney.textContent =
    view.money == null ? "—" : formatMoney(view.money, { compact: true });

  statInventory.textContent = `${formatCount(view.inventoryCount)} / ${formatCount(
    view.capacity
  )}`;

  statRolls.textContent = formatCount(view.totalRolls);

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

function previewValue(quest) {
  const p=quest?.progress||{},t=quest?.target||{};
  if ("count" in t) return [p.count||0,t.count];
  if ("score" in t) return [p.score||0,t.score];
  if ("points" in t) return [p.points||0,t.points];
  if ("names" in t) return [Array.isArray(p.names)?p.names.length:0,t.names];
  if ("tiers" in t) return [Array.isArray(p.tiers)?p.tiers.length:0,t.tiers];
  if ("days" in t) return [Object.values(p.days||{}).filter(v=>v>=t.daily).length,t.days];
  return [0,1];
}

async function refreshExpeditionPreview() {
  const { data,error }=await loadExpeditionDashboard();
  if(error||!data){expeditionPreview.innerHTML='<p class="history__empty">Expedition status is temporarily unavailable.</p>';return;}
  const active=[data.daily?.active,data.weekly?.active].filter(Boolean);
  if(!active.length){expeditionPreview.innerHTML=`<div class="expedition-preview__empty"><div><strong>New routes are waiting</strong><p>Two Daily entries and one Weekly path are available.</p></div><a href="./expeditions/">Choose a route →</a></div>`;return;}
  expeditionPreview.innerHTML=active.map(e=>{const complete=e.quests.filter(q=>q.completed_at).length,q=e.quests.find(q=>!q.completed_at)||e.quests.at(-1),[now,target]=previewValue(q),pct=q?.completed_at?100:Math.min(100,now/target*100);return `<div class="expedition-preview__row"><div><span class="badge">${escapeHtml(e.cadence)}</span><strong>${escapeHtml(e.difficulty)} · ${escapeHtml(q?.title||"Complete")}</strong><small>${complete}/${e.quests.length} quests secured · ${Number(now).toLocaleString()}/${Number(target).toLocaleString()}</small></div><div class="expedition-preview__bar"><span style="width:${pct}%"></span></div></div>`}).join("");
}


async function refreshPlayerState() {
  const [playerState, inventoryResult] = await Promise.all([
    loadCloudPlayerState(),

    supabase
      .from("inventory_gems")
      .select("id", { count: "exact", head: true })
      .neq("gem_name", "Enchant Relic")
      .neq("gem_name", "Ancient Relic")
  ]);

  if (!playerState) {
    return false;
  }

  view.money = playerState.money;
  view.capacity = playerState.inventory_capacity;
  view.totalRolls = playerState.total_rolls;

  if (!inventoryResult.error) {
    view.inventoryCount = inventoryResult.count ?? 0;
  }

  renderSummary();

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

    return;
  }

  view.ready = true;

  setButton({ mode: "", label: "Roll", disabled: false });

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


// =========================================================
// GEM REVEAL
// =========================================================

function buildUltraCutscene(data, outcome, gemName, tier, visualVariant, visualHue, visualSpeed, duration) {
  const existing = document.getElementById("ultra-cutscene-overlay");
  existing?.remove();

  const overlay = document.createElement("div");
  overlay.id = "ultra-cutscene-overlay";

  const rarityValue = Number(data?.gem?.rarity ?? 0);
  const mutationIds = Array.from(new Set(
    (Array.isArray(data?.mutations) ? data.mutations.map(m => m?.id) : [])
      .concat(data?.mutation?.id ?? data?.mutationId ?? data?.gem?.mutation_id ?? data?.gem?.mutationId ?? data?.mutation_id ?? [])
      .filter(Boolean)
      .map(id => String(id).toLowerCase())
  ));
  const mutationObjects = mutationIds.map((id) => getGemMutation(id)).filter(Boolean);
  const mutationId = mutationIds[0] ?? "";
  const mutationClass = mutationIds.map(id => ` mutation-scene-${id.replace(/[^a-z0-9_-]/g, "")}`).join("");

  const rarityClass =
    rarityValue >= 10000000 ? " ultra-level-10m" :
    rarityValue >= 4000000 ? " ultra-level-4m" :
    rarityValue >= 1000000 ? " ultra-level-1m" :
    rarityValue >= 500000 ? " ultra-level-500k" :
    " ultra-level-100k";

  const isXyGem = gemName.toLowerCase() === "xy gem";
  overlay.className =
    `ultra-cutscene-overlay ultra-scene-${visualVariant}${rarityClass}${mutationClass}${isXyGem ? " ultra-xy-gem" : ""}`;
  overlay.setAttribute("aria-hidden", "true");
  overlay.dataset.rarity = String(rarityValue);
  if (mutationId) overlay.dataset.mutation = mutationId;
  overlay.style.setProperty("--gem-hue", `${visualHue}`);
  overlay.style.setProperty("--gem-speed", visualSpeed);
  overlay.style.setProperty("--cinematic-duration", `${duration}ms`);

  const sceneMarkup = [
    // 0 — Eclipse
    `<span class="scene__eclipse"></span><span class="scene__corona"></span><span class="scene__orbit scene__orbit-a"></span><span class="scene__orbit scene__orbit-b"></span><span class="scene__stars"></span><span class="scene__particles"></span>`,
    // 1 — Celestial gate
    `<span class="scene__gate scene__gate-a"></span><span class="scene__gate scene__gate-b"></span><span class="scene__gate scene__gate-c"></span><span class="scene__constellation"></span><span class="scene__comets"></span>`,
    // 2 — Prism fracture
    `<span class="scene__prism"></span><span class="scene__fracture scene__fracture-a"></span><span class="scene__fracture scene__fracture-b"></span><span class="scene__rainbow"></span><span class="scene__shards"></span>`,
    // 3 — Void rift
    `<span class="scene__rift"></span><span class="scene__rift-ring"></span><span class="scene__tentacles"></span><span class="scene__void-stars"></span><span class="scene__shockwaves"></span>`,
    // 4 — Divine beam
    `<span class="scene__sky"></span><span class="scene__beam scene__beam-a"></span><span class="scene__beam scene__beam-b"></span><span class="scene__beam scene__beam-c"></span><span class="scene__halo"></span><span class="scene__feathers"></span>`,
    // 5 — Arcane spell
    `<span class="scene__magic-circle scene__magic-circle-a"></span><span class="scene__magic-circle scene__magic-circle-b"></span><span class="scene__runes"></span><span class="scene__sigils"></span><span class="scene__arcane-sparks"></span>`,
    // 6 — Supernova
    `<span class="scene__supernova"></span><span class="scene__shockwave scene__shockwave-a"></span><span class="scene__shockwave scene__shockwave-b"></span><span class="scene__solar-flare"></span><span class="scene__debris"></span>`,
    // 7 — Crystal cathedral
    `<span class="scene__cathedral"></span><span class="scene__crystal-cracks"></span><span class="scene__crystal-rays"></span><span class="scene__floating-gems"></span><span class="scene__dust"></span>`,
    // 8 — Galaxy spiral
    `<span class="scene__galaxy"></span><span class="scene__galaxy-core"></span><span class="scene__galaxy-arms"></span><span class="scene__nebula"></span><span class="scene__stars"></span>`,
    // 9 — Reality collapse
    `<span class="scene__grid"></span><span class="scene__collapse"></span><span class="scene__glitch-rings"></span><span class="scene__energy-blades"></span><span class="scene__afterimage"></span>`
  ][visualVariant];

  overlay.innerHTML = `
    <div class="scene__backdrop"></div>
    <div class="scene__world">${sceneMarkup}</div>
    ${mutationIds.map(id => `<div class="mutation-scene-layer mutation-scene-layer--${id}" aria-hidden="true"><span class="mutation-fx mutation-fx--a"></span><span class="mutation-fx mutation-fx--b"></span><span class="mutation-fx mutation-fx--c"></span><span class="mutation-fx mutation-fx--d"></span></div>`).join("")}
    ${isXyGem ? `
      <div class="xy__cataclysm" aria-hidden="true">
        <span class="xy__void"></span>
        <span class="xy__cross"></span>
        <span class="xy__cross xy__cross--b"></span>
        <span class="xy__slash xy__slash--a"></span>
        <span class="xy__slash xy__slash--b"></span>
        <span class="xy__shard xy__shard--a"></span>
        <span class="xy__shard xy__shard--b"></span>
        <span class="xy__shard xy__shard--c"></span>
        <span class="xy__shard xy__shard--d"></span>
        <span class="xy__energy"></span>
        <span class="xy__glitch"></span>
        <span class="xy__halo"></span>
      </div>
    ` : ""}
    <div class="scene__mega-world" aria-hidden="true">
      <span class="mega__warp"></span>
      <span class="mega__ring mega__ring--a"></span>
      <span class="mega__ring mega__ring--b"></span>
      <span class="mega__ring mega__ring--c"></span>
      <span class="mega__meteor-field"></span>
      <span class="mega__fracture"></span>
      <span class="mega__shockwave"></span>
      <span class="mega__singularity"></span>
      <span class="mega__title">LIMIT BREAK</span>
    </div>
    <div class="scene__flash"></div>
    <div class="scene__vignette"></div>
    <div class="scene__scanlines"></div>
    <div class="scene__reveal">
      <div class="scene__gem">${icons.gem}</div>
      <div class="scene__tier">${escapeHtml(tier.name)}</div>
      <h2 class="scene__name ${isXyGem ? "scene__name--xy" : ""}">${gemNameHtml(gemName, escapeHtml, mutationIds.map(id => `gem-styled--mutation-${id}`).join(" "))}</h2>
      ${mutationObjects.length ? `<div class="scene__mutation ${mutationObjects.length > 1 ? "scene__mutation--many" : ""}" aria-label="Mutations">${mutationObjects.map((m, index) => `${index > 0 ? '<span class="mutation-name-separator" aria-hidden="true">·</span>' : ""}<span class="mutation-name-effect mutation-name-effect--${escapeHtml(m.id)}"><span class="mutation-name-effect__fx" aria-hidden="true"></span><span class="mutation-name-effect__text">${escapeHtml(m.name)}</span></span>`).join("")}</div>` : ""}
      <div class="scene__rarity">${rarityLabel(data.gem.rarity)}</div>
      <div class="scene__chance">Actual chance: ${escapeHtml(chanceLabelForResult(gemName, mutationIds))}</div>
      <div class="scene__outcome">${outcome.icon}${escapeHtml(outcome.text)}</div>
    </div>
    <div class="scene__letterbox scene__letterbox-top"></div>
    <div class="scene__letterbox scene__letterbox-bottom"></div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("is-playing"));
  return overlay;
}

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

function renderRoll(data, outcome) {
  const tier = rarityTier(data.gem.rarity);
  const rarity = Number(data.gem.rarity ?? 0);
  const isRelic = data.gem.dropType === "relic";

  // Every non-relic roll gets the normal roll-effect. A full cutscene is
  // reserved for gems strictly rarer than the player-selected 1-in-N
  // threshold. Relics never trigger either — their odds ignore Luck, so
  // they get a plain reveal.
  const isUltraRare = !isRelic && rarity > getSettings().cutsceneMinimumRarity;
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
    isUltraRare ? "is-ultra-rare" : ""
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
    <div class="gem-reveal">
      <div class="gem-reveal__art">${icons.gem}</div>
      <span class="badge badge--tier">${isRelic ? "RELIC" : tier.name}</span>
      <h2 class="gem-reveal__name">${gemNameHtml(data.gem.name, escapeHtml)}</h2>
      ${mutationNamesHtml(data?.mutations)}
      <p class="page-head__sub num">${isRelic ? "RELIC" : rarityLabel(data.gem.rarity)}</p>
      <p class="gem-reveal__chance num">${isRelic ? `Flat chance: 1 in ${formatCount(data.gem.name === "Ancient Relic" ? 1500 : 250)} · unaffected by Luck` : `Actual chance: ${escapeHtml(chanceLabelForResult(data.gem.name, mutationIds))}`}</p>
      ${isRelic ? '<p class="gem-reveal__outcome">Use this unlocked relic on an equipped pickaxe in Inventory.</p>' : `<div class="gem-reveal__facts">
        <div class="gem-fact"><span class="gem-fact__label">Weight</span><span class="gem-fact__value">${formatWeight(data.finalWeight)}</span></div>
        <div class="gem-fact"><span class="gem-fact__label">Multiplier</span><span class="gem-fact__value">${formatMultiplier(data.weightMultiplier)}</span></div>
        <div class="gem-fact"><span class="gem-fact__label">Value</span><span class="gem-fact__value">${formatMoney(data.value)}</span></div>
      </div>`}
      <p class="gem-reveal__outcome">${outcome.icon}${escapeHtml(outcome.text)}</p>
    </div>
  `;

  if (!getSettings().rollAnimations) return Promise.resolve();
  gemStage.classList.add("is-animating");

  if (isEpicRollEffect || isUltraRare) gemStage.classList.add("is-big");

  if (isUltraRare) {
    const duration = gemName.toLowerCase() === "xy gem"
      ? 30000
      : gemName.toLowerCase() === "ja-ore"
        ? 15000
        : cinematicDuration(rarity);
    cinematicActive = true;
    document.documentElement.classList.add("is-cinematic-active");
    gemStage.style.setProperty("--cinematic-duration", `${duration}ms`);
    gemStage.classList.add("is-cinematic");
    // Xy Gem gets its own bespoke cutscene; everything else uses the
    // standard tiered one. Fall back if the custom scene ever throws.
    let overlay;
    if (gemName.toLowerCase() === "heart of xy" || gemName.toLowerCase() === "xy gem") {
      try {
        overlay = buildXyGemCutscene(data, outcome, duration);
      } catch (error) {
        console.error("Xy Gem cutscene failed, using standard:", error);
        overlay = buildUltraCutscene(data, outcome, gemName, tier, visualVariant, visualHue, visualSpeed, duration);
      }
    } else if (gemName.toLowerCase() === "ja-ore") {
      try {
        overlay = buildJaOreCutscene(data, outcome, duration);
      } catch (error) {
        console.error("Ja-ore cutscene failed, using standard:", error);
        overlay = buildUltraCutscene(data, outcome, gemName, tier, visualVariant, visualHue, visualSpeed, duration);
      }
    } else {
      overlay = buildUltraCutscene(data, outcome, gemName, tier, visualVariant, visualHue, visualSpeed, duration);
    }

    return new Promise((resolve) => {
      cinematicTimer = setTimeout(() => {
        overlay?.classList.remove("is-playing");
        setTimeout(() => overlay?.remove(), 250);
        gemStage.classList.remove("is-animating", "is-big", "is-cinematic", "is-ultra-rare");
        gemStage.style.removeProperty("--cinematic-duration");
        gemStage.style.removeProperty("--gem-hue");
        gemStage.style.removeProperty("--gem-speed");
        endCinematic();
        resolve();
      }, duration);
    });
  }

  setTimeout(() => {
    gemStage.classList.remove("is-animating", "is-big", "is-epic-roll");
    gemStage.style.removeProperty("--gem-hue");
    gemStage.style.removeProperty("--gem-speed");
  }, isEpicRollEffect ? 3300 : 950);
  return Promise.resolve();
}

function addHistory(data, note) {
  const tier = rarityTier(data.gem.rarity);

  history.unshift({
    name: data.gem.name,
    tier,
    weight: data.finalWeight,
    value: data.value,
    mutationIds: Array.isArray(data?.mutations) ? data.mutations.map(m => m.id).filter(Boolean) : (data?.mutation?.id ? [data.mutation.id] : []),
    chance: chanceLabelForResult(data.gem.name, Array.isArray(data?.mutations) ? data.mutations.map(m => m.id).filter(Boolean) : (data?.mutation?.id ? [data.mutation.id] : [])),
    note
  });

  if (history.length > MAX_HISTORY) {
    history.length = MAX_HISTORY;
  }

  renderHistory();
}


function historyMutationNamesHtml(ids = []) {
  const normalized = Array.isArray(ids) ? ids : [];
  if (!normalized.length) return "";
  return `<span class="history__mutations">${normalized.map((id, index) => {
    const m = getGemMutation(id);
    if (!m) return "";
    const separator = index > 0 ? '<span class="mutation-name-separator" aria-hidden="true">·</span>' : "";
    return `${separator}<span class="mutation-name-effect mutation-name-effect--${escapeHtml(id)}"><span class="mutation-name-effect__fx" aria-hidden="true"></span><span class="mutation-name-effect__text">${escapeHtml(m.name)}</span></span>`;
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
          ${historyMutationNamesHtml(entry.mutationIds)}

          <span class="history__meta">${escapeHtml(entry.chance)} · ${escapeHtml(
            entry.note || formatWeight(entry.weight)
          )}</span>

          <span class="history__value">${formatMoney(entry.value)}</span>
        </div>
      `
    )
    .join("");
}

function sessionHighlight(label,item,formatter){if(!item)return"";return `<div><span>${label}</span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(formatter(item))}</small></div>`;}
function sessionRollName(item){const mutations=Array.isArray(item?.mutationNames)?item.mutationNames:[];return [...mutations,item?.name||"Unknown"].join(" ");}
function renderSessionInsights(){
  if(!sessionInsightsFeature)return;
  const state=getSessionInsights(),elapsed=Math.max(0,Date.now()-new Date(state.startedAt).getTime()),hours=Math.floor(elapsed/3600000),minutes=Math.floor(elapsed%3600000/60000);
  sessionInsightStats.innerHTML=[["Duration",`${hours}h ${minutes}m`],["Rolls",formatCount(state.rolls)],["Kept",formatCount(state.kept)],["Auto kept",formatCount(state.autoKept)],["Auto sold",formatCount(state.autoSold)],["Auto-sell income",formatMoney(state.autoSoldValue)],["Relics",formatCount(state.relics)],["Auto crafted",formatCount(state.autoCrafted)]].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join("");
  sessionHighlights.innerHTML=sessionHighlight("Rarest effective",state.bestEffective,item=>`1/${Math.round(item.effectiveRarity).toLocaleString()}`)+sessionHighlight("Rarest base",state.bestBase,item=>`1/${Math.round(item.baseRarity).toLocaleString()}`)+sessionHighlight("Heaviest",state.heaviest,item=>formatWeight(item.weight))+sessionHighlight("Most valuable",state.mostValuable,item=>formatMoney(item.value));
  sessionBreakdown.innerHTML=Object.entries(state.rarities).sort((a,b)=>b[1]-a[1]).map(([tier,count])=>`<span class="badge">${escapeHtml(tier)} · ${formatCount(count)}</span>`).join("")||"<small>No rolls yet.</small>";
  sessionNotable.innerHTML=state.notable.slice(0,6).map(item=>`<div><strong>${escapeHtml(sessionRollName(item))}</strong><span>1/${Math.round(item.effectiveRarity).toLocaleString()} · ${escapeHtml(item.decision.replaceAll("-"," "))}</span></div>`).join("")||"<small>Mutation and 1/100,000+ rolls will appear here.</small>";
}
window.addEventListener("session-insights:change",renderSessionInsights);


// =========================================================
// ROLLING
// =========================================================

async function performRoll() {
  if (rollInFlight || cinematicActive || !view.ready) {
    return;
  }

  rollInFlight = true;

  stopCooldown();

  setButton({ mode: "rolling", label: "Rolling", disabled: true });

  const { data, error } = await invokeFunction("roll");

  rollInFlight = false;

  // -------------------------------------------------------
  // ERRORS
  // -------------------------------------------------------

  if (error) {
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

    setButton({ mode: "", label: "Roll", disabled: false });

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

  view.inventoryCount = data.inventory?.count ?? view.inventoryCount;
  view.capacity = data.inventory?.capacity ?? view.capacity;
  view.totalRolls = data.lifetimeStats?.totalRolls ?? view.totalRolls + 1;

  const outcome = await resolveOutcome(data);

  renderSummary();

  const cinematicPromise = renderRoll(data, outcome);

  addHistory(data, outcome.note);

  // Let the chat UI render the same player-facing rare-roll announcement
  // immediately, including mutation-only rare combinations. The server-side
  // announcement remains authoritative for persisted/global messages.
  window.dispatchEvent(new CustomEvent("gem:roll-complete", { detail: data }));
  refreshExpeditionPreview();

  if (data.cooldown?.nextRollAt) {
    startCooldown(
      new Date(data.cooldown.nextRollAt).getTime(),
      data.cooldown.durationMs
    );
  }

  // Keep the roll locked for the entire 1/100k+ cinematic. If the server
  // cooldown is shorter, its timer will wait for the cinematic lock before
  // allowing the next roll.
  await cinematicPromise;

  if (!data.cooldown?.nextRollAt) {
    showReady();
  }
}


// Decides what happened to the gem: Auto Craft always wins first because
// the server deposits matching rolls before the client can auto-sell them.
// Only gems that remain in inventory can reach the Auto Sell rule.
async function resolveOutcome(data) {
  if (data.autoCraft?.deposited) {
    const recipe = recipes.find(
      (entry) => entry.id === data.autoCraft.recipeId
    );

    return {
      icon: icons.anvil,
      text: `Deposited into ${recipe?.name ?? "your Auto Craft target"}`,
      note: "deposited"
    };
  }

  const tier = rarityTier(data.gem.rarity);

  if (shouldAutoSell(tier.id) && data.specimenId != null) {
    const { data: sale, error } = await sellCloudGem(data.specimenId);

    if (!error && sale) {
      view.money = Number(sale.money ?? view.money);

      view.inventoryCount = Math.max(0, view.inventoryCount - 1);

      return {
        icon: icons.coins,
        text: `Auto sold for ${formatMoney(sale.soldValue ?? data.value)}`,
        note: "auto sold"
      };
    }

    if (error) {
      notify.error("Auto sell failed", error.message);
    }
  }

  return {
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
  weightMultiplier: "Weight multiplier"
};

let activeBoosts = [];
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

  if (live.length === 0) {
    effectHud.innerHTML = "";
    effectHud.classList.remove("is-active");

    return;
  }

  effectHud.classList.add("is-active");

  const now = Date.now();

  effectHud.innerHTML = live
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
            <span class="effect-chip__time">${formatEffectRemaining(
              remaining
            )}</span>
          </span>

          <span class="effect-chip__bar">
            <span style="width:${fraction * 100}%"></span>
          </span>
        </div>
      `;
    })
    .join("");
}


function startEffectTicker() {
  if (effectTicker) {
    return;
  }

  effectTicker = setInterval(() => {
    renderEffects();

    if (liveBoosts().length === 0) {
      clearInterval(effectTicker);

      effectTicker = null;
    }
  }, 1000);
}


async function refreshEffects() {
  const boosts = await loadActiveBoosts();

  if (boosts) {
    activeBoosts = boosts;
  }

  renderEffects();

  if (liveBoosts().length > 0) {
    startEffectTicker();
  }
}


// =========================================================
// AUTOMATION
// =========================================================

function maybeAutoRoll() {
  if (
    !getSettings().autoRoll ||
    !view.ready ||
    rollInFlight ||
    cinematicActive
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
    if (getSettings().autoRoll && view.ready && !rollInFlight) {
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

autoSellTier.innerHTML = SELL_TIERS.map(
  (tier) => `<option value="${tier.id}">${tier.label}</option>`
).join("");


function paintSettings(settings) {
  autoRollToggle.checked = settings.autoRoll;
  autoSellToggle.checked = settings.autoSell;
  autoSellTier.value = settings.autoSellTier;

  autoSellTierRow.classList.toggle(
    "automation__row--muted",
    !settings.autoSell
  );
}


autoRollToggle.addEventListener("change", () => {
  const settings = updateSettings({ autoRoll: autoRollToggle.checked });

  if (settings.autoRoll) {
    notify.info("Auto roll on", "Rolling continues while this tab is open.");

    maybeAutoRoll();
  }
});


autoSellToggle.addEventListener("change", () => {
  updateSettings({ autoSell: autoSellToggle.checked });
});


autoSellTier.addEventListener("change", () => {
  updateSettings({ autoSellTier: autoSellTier.value });
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
  refreshExpeditionPreview();

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
