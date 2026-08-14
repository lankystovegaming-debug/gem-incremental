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

import { mountShell } from "./src/ui/shell.js";
import { icons } from "./src/ui/icons.js";
import { notify } from "./src/ui/toast.js";
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

function renderRoll(data, outcome) {
  const tier = rarityTier(data.gem.rarity);

  gemStage.className = `stage__display is-revealed tier-${tier.id}`;

  gemStage.innerHTML = `
    <div class="gem-reveal">
      <div class="gem-reveal__art">${icons.gem}</div>

      <span class="badge badge--tier">${tier.name}</span>

      <h2 class="gem-reveal__name">${escapeHtml(data.gem.name)}</h2>

      <p class="page-head__sub num">${rarityLabel(data.gem.rarity)}</p>

      <div class="gem-reveal__facts">
        <div class="gem-fact">
          <span class="gem-fact__label">Weight</span>
          <span class="gem-fact__value">${formatWeight(data.finalWeight)}</span>
        </div>

        <div class="gem-fact">
          <span class="gem-fact__label">Multiplier</span>
          <span class="gem-fact__value">${formatMultiplier(
            data.weightMultiplier
          )}</span>
        </div>

        <div class="gem-fact">
          <span class="gem-fact__label">Value</span>
          <span class="gem-fact__value">${formatMoney(data.value)}</span>
        </div>
      </div>

      <p class="gem-reveal__outcome">${outcome.icon}${escapeHtml(
        outcome.text
      )}</p>
    </div>
  `;

  if (!getSettings().rollAnimations) {
    return;
  }

  // Restart the reveal animation on every roll.
  gemStage.classList.add("is-animating");

  // Rare and above earn the shockwave.
  if (tier.id !== "common" && tier.id !== "uncommon") {
    gemStage.classList.add("is-big");
  }

  setTimeout(() => {
    gemStage.classList.remove("is-animating", "is-big");
  }, 950);
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

          <span class="history__name">${escapeHtml(entry.name)}</span>

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
  if (rollInFlight || !view.ready) {
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

  renderRoll(data, outcome);

  addHistory(data, outcome.note);

  if (data.cooldown?.nextRollAt) {
    startCooldown(
      new Date(data.cooldown.nextRollAt).getTime(),
      data.cooldown.durationMs
    );
  } else {
    showReady();
  }
}


// Decides what happened to the gem: deposited into a recipe by
// the server, auto-sold by the player's own rule, or kept.
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
// AUTOMATION
// =========================================================

function maybeAutoRoll() {
  if (!getSettings().autoRoll || !view.ready || rollInFlight) {
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

  const loaded = await refreshPlayerState();

  if (!loaded) {
    showError("Could not load your save. Refresh to try again.");

    return;
  }

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

  await restoreCooldown(user.id);
});


startGame();
