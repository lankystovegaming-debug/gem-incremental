import recipes from "../src/data/recipes.js";

import { ensurePlayerAuth } from "../src/backend/auth.js";
import { loadCloudDebugState } from "../src/backend/cloudDebug.js";

import { mountShell } from "../src/ui/shell.js";
import { icons } from "../src/ui/icons.js";
import { notify } from "../src/ui/toast.js";
import {
  rarityTier,
  rarityLabel,
  formatMoney,
  formatCount,
  formatSeconds,
  escapeHtml
} from "../src/ui/format.js";


const shell = mountShell({ page: "leaderboards", base: "../" });


const subtitle = document.getElementById("statsSubtitle");
const content = document.getElementById("statsContent");
const refreshButton = document.getElementById("refreshButton");

document.getElementById("refreshIcon").innerHTML = icons.refresh;


// A slow poll keeps the cooldown honest without hammering the
// database the way a half-second timer would.
const POLL_INTERVAL = 15000;
const BASE_ROLL_COOLDOWN_SECONDS = 2.5;

let pollTimer = null;


// =========================================================
// BONUS BARS
//
// Every bonus starts at 1.00x, so the bar shows how far past
// the baseline the player's equipment has pushed it.
// =========================================================

const BONUS_ROWS = [
  ["luck", "Luck", "Improves the odds of rarer gems"],
  ["rollSpeed", "Roll speed", "Shortens the cooldown between rolls"],
  ["weightLuck", "Weight luck", "Biases the weight roll upward"],
  ["weightMultiplier", "Weight multiplier", "Scales the final weight"]
];


function bonusRow(value, label) {
  const amount = Number(value ?? 1);

  const boosted = amount > 1.0001;

  // 3.00x fills the bar.
  const filled = Math.min(100, ((amount - 1) / 2) * 100);

  return `
    <div class="bonus-row">
      <div class="bonus-row__head">
        <span class="bonus-row__key">${escapeHtml(label)}</span>
        <span class="bonus-row__val${
          boosted ? " bonus-row__val--boosted" : ""
        }">${amount.toFixed(2)}x</span>
      </div>

      <div class="meter">
        <div
          class="meter__fill${boosted ? " meter__fill--positive" : ""}"
          style="width:${filled}%"
        ></div>
      </div>
    </div>
  `;
}


function statsRow(key, value, modifier = "") {
  return `
    <div class="stats-row">
      <span class="stats-row__key">${escapeHtml(key)}</span>
      <span class="stats-row__val${modifier}">${value}</span>
    </div>
  `;
}


function card(title, icon, body, note = "") {
  return `
    <section class="stats-card">
      <div class="stats-card__head">
        ${icon}
        <h2>${escapeHtml(title)}</h2>
      </div>

      ${body}

      ${note ? `<p class="stats-note">${escapeHtml(note)}</p>` : ""}
    </section>
  `;
}


// =========================================================
// RENDER
// =========================================================

function render(cloudState) {
  shell.setWallet(cloudState.player.money);

  subtitle.textContent =
    `${formatCount(cloudState.lifetime.totalRolls)} rolls · ` +
    `${formatCount(cloudState.player.equipmentCount)} equipment owned`;

  const autoCraftId = cloudState.crafting.activeAutoCraftRecipeId;

  const autoCraftRecipe = autoCraftId
    ? recipes.find((recipe) => recipe.id === autoCraftId)
    : null;

  const rarest = cloudState.lifetime.rarestGemName;

  const rarestTier = cloudState.lifetime.rarestGemRarity
    ? rarityTier(cloudState.lifetime.rarestGemRarity)
    : null;

  const rollCooldown =
    BASE_ROLL_COOLDOWN_SECONDS /
    Math.max(1, Number(cloudState.stats.rollSpeed) || 1);

  content.innerHTML = [
    card(
      "Bonuses",
      icons.sparkle,
      BONUS_ROWS.map(([key, label]) =>
        bonusRow(cloudState.stats[key], label)
      ).join(""),
      "Shows equipped items, active potions, pending one-roll Luck, and global Admin Events."
    ),

    card(
      "Account",
      icons.coins,
      [
        statsRow(
          "Money",
          formatMoney(cloudState.player.money),
          " stats-row__val--positive"
        ),
        statsRow(
          "Gems stored",
          `${formatCount(cloudState.player.gemCount)} / ${formatCount(
            cloudState.player.inventoryCapacity
          )}`
        ),
        statsRow(
          "Equipment owned",
          formatCount(cloudState.player.equipmentCount)
        )
      ].join("")
    ),

    card(
      "Lifetime records",
      icons.chart,
      [
        statsRow("Total rolls", formatCount(cloudState.lifetime.totalRolls)),

        statsRow(
          "Rarest gem",
          rarest
            ? `${escapeHtml(rarest)}${
                rarestTier
                  ? ` <span class="badge badge--tier tier-${rarestTier.id}">${rarestTier.name}</span>`
                  : ""
              }`
            : "None yet"
        ),

        statsRow(
          "Rarest odds",
          cloudState.lifetime.rarestGemRarity
            ? rarityLabel(cloudState.lifetime.rarestGemRarity)
            : "—"
        )
      ].join("")
    ),

    card(
      "Automation",
      icons.bolt,
      [
        statsRow(
          "Auto Craft target",
          autoCraftRecipe
            ? escapeHtml(autoCraftRecipe.name)
            : autoCraftId
            ? escapeHtml(autoCraftId)
            : "Off",
          autoCraftRecipe ? " stats-row__val--accent" : ""
        ),

        statsRow(
          "Roll cooldown",
          formatSeconds(rollCooldown)
        )
      ].join(""),
      "Cooldown includes equipped roll-speed bonuses. Auto roll and auto sell are set on the Roll page."
    )
  ].join("");
}


function renderSkeleton() {
  content.innerHTML = Array.from(
    { length: 4 },
    () => '<div class="skeleton" style="height:220px"></div>'
  ).join("");
}


// =========================================================
// LOAD
// =========================================================

async function refresh({ quiet = false } = {}) {
  const user = await ensurePlayerAuth();

  if (!user) {
    subtitle.textContent = "Could not sign you in. Refresh to try again.";

    if (!quiet) {
      notify.error("Sign-in failed", "The game could not reach your account.");
    }

    return;
  }

  const cloudState = await loadCloudDebugState();

  if (!cloudState) {
    subtitle.textContent = "Could not load your stats.";

    if (!quiet) {
      notify.error("Could not load stats", "Try refreshing the page.");
    }

    return;
  }

  render(cloudState);
}


refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;

  await refresh();

  refreshButton.disabled = false;
});


// Only poll while the tab is actually being looked at.
function startPolling() {
  stopPolling();

  pollTimer = setInterval(() => refresh({ quiet: true }), POLL_INTERVAL);
}


function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);

    pollTimer = null;
  }
}


document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopPolling();

    return;
  }

  refresh({ quiet: true });

  startPolling();
});


renderSkeleton();
refresh();
startPolling();
