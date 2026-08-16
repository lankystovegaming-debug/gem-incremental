import recipes from "./src/data/recipes.js";

import {
  ensurePlayerAuth,
  getLastAuthError
} from "./src/backend/auth.js";
import { ensureCloudPlayer } from "./src/backend/playerCloud.js";
import { invokeFunction } from "./src/backend/invoke.js";
import {
  startRollSession,
  isRollSessionActive,
  onRollSessionChange,
  getRollSessionId
} from "./src/backend/rollSession.js";
import { supabase } from "./src/backend/supabase.js";
import { runLegacyMigrationGate } from "./src/backend/legacyMigration.js";
import {
  loadCloudPlayerState,
  sellCloudGem
} from "./src/backend/cloudInventory.js";
import { loadActiveBoosts } from "./src/backend/cloudConsumables.js";

import { mountShell } from "./src/ui/shell.js";
import { icons } from "./src/ui/icons.js";
import { notify } from "./src/ui/toast.js";
import { gemNameHtml } from "./src/ui/gemStyle.js";
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

function cinematicDuration() {
  // Give phones a little more breathing room because the reveal is
  // deliberately composed for a full-screen mobile presentation.
  return window.matchMedia("(max-width: 700px), (pointer: coarse)").matches
    ? 8200
    : 7200;
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
let rollSessionActive = false;


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


async function refreshPlayerState() {
  const [playerState, inventoryResult] = await Promise.all([
    loadCloudPlayerState(),

    supabase
      .from("inventory_gems")
      .select("id", { count: "exact", head: true })
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

  return true;
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
  overlay.className = `ultra-cutscene-overlay ultra-scene-${visualVariant}`;
  overlay.setAttribute("aria-hidden", "true");
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
    <div class="scene__flash"></div>
    <div class="scene__vignette"></div>
    <div class="scene__scanlines"></div>
    <div class="scene__reveal">
      <div class="scene__gem">${icons.gem}</div>
      <div class="scene__tier">${escapeHtml(tier.name)}</div>
      <h2 class="scene__name">${gemNameHtml(gemName, escapeHtml)}</h2>
      <div class="scene__rarity">${rarityLabel(data.gem.rarity)}</div>
      <div class="scene__outcome">${outcome.icon}${escapeHtml(outcome.text)}</div>
    </div>
    <div class="scene__letterbox scene__letterbox-top"></div>
    <div class="scene__letterbox scene__letterbox-bottom"></div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("is-playing"));
  return overlay;
}

function renderRoll(data, outcome) {
  const tier = rarityTier(data.gem.rarity);
  const rarity = Number(data.gem.rarity ?? 0);
  const isUltraRare = rarity >= 100000;
  const isEpicRollEffect = rarity >= 10000 && !isUltraRare;

  const gemName = String(data.gem.name ?? "Gem");
  let gemHash = 0;
  for (let i = 0; i < gemName.length; i += 1) {
    gemHash = (gemHash * 31 + gemName.charCodeAt(i)) >>> 0;
  }
  const visualVariant = gemHash % 10;
  const visualHue = gemHash % 360;
  const visualSpeed = (0.78 + ((gemHash >>> 8) % 48) / 100).toFixed(2);

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
      <span class="badge badge--tier">${tier.name}</span>
      <h2 class="gem-reveal__name">${gemNameHtml(data.gem.name, escapeHtml)}</h2>
      <p class="page-head__sub num">${rarityLabel(data.gem.rarity)}</p>
      <div class="gem-reveal__facts">
        <div class="gem-fact"><span class="gem-fact__label">Weight</span><span class="gem-fact__value">${formatWeight(data.finalWeight)}</span></div>
        <div class="gem-fact"><span class="gem-fact__label">Multiplier</span><span class="gem-fact__value">${formatMultiplier(data.weightMultiplier)}</span></div>
        <div class="gem-fact"><span class="gem-fact__label">Value</span><span class="gem-fact__value">${formatMoney(data.value)}</span></div>
      </div>
      <p class="gem-reveal__outcome">${outcome.icon}${escapeHtml(outcome.text)}</p>
    </div>
  `;

  if (!getSettings().rollAnimations) return Promise.resolve();
  gemStage.classList.add("is-animating");

  if (isEpicRollEffect || isUltraRare) gemStage.classList.add("is-big");

  if (isUltraRare) {
    const duration = cinematicDuration();
    cinematicActive = true;
    document.documentElement.classList.add("is-cinematic-active");
    gemStage.style.setProperty("--cinematic-duration", `${duration}ms`);
    gemStage.classList.add("is-cinematic");
    const overlay = buildUltraCutscene(data, outcome, gemName, tier, visualVariant, visualHue, visualSpeed, duration);

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
    note
  });

  if (history.length > MAX_HISTORY) {
    history.length = MAX_HISTORY;
  }

  renderHistory();
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

          <span class="history__meta">${escapeHtml(
            entry.note || formatWeight(entry.weight)
          )}</span>

          <span class="history__value">${formatMoney(entry.value)}</span>
        </div>
      `
    )
    .join("");
}


// =========================================================
// ROLLING
// =========================================================

async function performRoll() {
  if (rollInFlight || cinematicActive || !view.ready || !rollSessionActive) {
    return;
  }

  rollInFlight = true;

  stopCooldown();

  setButton({ mode: "rolling", label: "Rolling", disabled: true });

  const { data, error } = await invokeFunction("roll", {
    sessionId: getRollSessionId()
  });

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
    !rollSessionActive ||
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

  // A short breath so the reveal is readable between rolls.
  setTimeout(() => {
    if (getSettings().autoRoll && view.ready && !rollInFlight) {
      performRoll();
    }
  }, 350);
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

  // One active rolling tab per account. This uses a lightweight
  // Supabase database RPC rather than an Edge Function heartbeat.
  rollSessionActive = await startRollSession();

  onRollSessionChange((active) => {
    rollSessionActive = active;

    if (!active) {
      if (!rollInFlight && !cinematicActive) {
        setButton({
          mode: "blocked",
          label: "Another tab is rolling",
          disabled: true
        });
      }

      return;
    }

    if (!rollInFlight && !cinematicActive && !cooldownTimer) {
      showReady();
    }
  });


  try {
    await runLegacyMigrationGate();
  } catch (error) {
    console.error("Legacy migration gate failed:", error);
  }

  const loaded = await refreshPlayerState();

  if (!loaded) {
    showError("Could not load your save. Refresh to try again.");

    return;
  }

  refreshEffects();

  await restoreCooldown(user.id);
}


async function restoreCooldown(userId) {
  const { data, error } = await supabase
    .from("players")
    .select("next_roll_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Could not read roll cooldown:", error);
  }

  const nextRollAt = data?.next_roll_at
    ? new Date(data.next_roll_at).getTime()
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

  await refreshPlayerState();

  refreshEffects();

  await restoreCooldown(user.id);
});


// The maintenance panel can change this account's save while the
// page is open; re-read state so the totals and roll button stay
// current instead of showing stale numbers.
window.addEventListener("gem:maintenance-refresh", async () => {
  const user = await ensurePlayerAuth();

  if (!user) {
    return;
  }

  await refreshPlayerState();

  refreshEffects();

  await restoreCooldown(user.id);
});


startGame();
