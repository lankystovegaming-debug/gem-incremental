import { ensurePlayerAuth } from "../backend/auth.js";
import { invokeFunction } from "../backend/invoke.js";
import { loadCloudPlayerState, loadCloudGems, sellCloudGem } from "../backend/cloudInventory.js";
import { getSettings, onSettingsChange, shouldAutoSell, shouldAutoKeep } from "./settings.js";
import { rarityTier, formatMoney, escapeHtml } from "./format.js";
import { notify } from "./toast.js";

// One browser-wide automation lease prevents two tabs from continuously
// racing each other. The server cooldown remains the final authority.
const LOCK_KEY = "gemIncremental.autoRollLease.v1";
const OWNER = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const LEASE_MS = 5000;
let timer = null;
let running = false;
let leaseTimer = null;

function readLease() {
  try { return JSON.parse(localStorage.getItem(LOCK_KEY) || "null"); }
  catch { return null; }
}

function ownsLease() {
  const lease = readLease();
  return !lease || lease.owner === OWNER || Number(lease.expiresAt) <= Date.now();
}

function acquireLease() {
  if (!ownsLease()) return false;
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ owner: OWNER, expiresAt: Date.now() + LEASE_MS }));
  } catch { return true; }
  return true;
}

function renewLease() {
  const lease = readLease();
  if (lease?.owner !== OWNER) return false;
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ owner: OWNER, expiresAt: Date.now() + LEASE_MS }));
  } catch {}
  return true;
}

function releaseLease() {
  const lease = readLease();
  if (lease?.owner === OWNER) {
    try { localStorage.removeItem(LOCK_KEY); } catch {}
  }
}

function clearTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function schedule(ms = 250) {
  clearTimer();
  if (!getSettings().autoRoll) return;
  timer = setTimeout(run, Math.max(50, ms));
}

function showGlobalRollEffect(data, outcome = "Stored") {
  const existing = document.querySelector(".global-roll-effect");
  existing?.remove();

  const mutations = Array.isArray(data?.mutations) ? data.mutations.map(m => m?.name).filter(Boolean) : [];
  const overlay = document.createElement("div");
  overlay.className = "global-roll-effect";
  overlay.innerHTML = `
    <div class="global-roll-effect__spark global-roll-effect__spark--one"></div>
    <div class="global-roll-effect__spark global-roll-effect__spark--two"></div>
    <div class="global-roll-effect__card">
      <div class="global-roll-effect__eyebrow">ROLL COMPLETE</div>
      <div class="global-roll-effect__gem">${escapeHtml(data?.gem?.name ?? "Gem")}</div>
      <div class="global-roll-effect__rarity">1 in ${Number(data?.gem?.rarity ?? 1).toLocaleString("en-US")}</div>
      ${mutations.length ? `<div class="global-roll-effect__mutations">${mutations.map(escapeHtml).join(" · ")}</div>` : ""}
      <div class="global-roll-effect__outcome">${escapeHtml(outcome)}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("is-visible"));
  setTimeout(() => {
    overlay.classList.remove("is-visible");
    setTimeout(() => overlay.remove(), 300);
  }, 1250);
}

async function processRoll(data) {
  if (!data) return;

  let outcome = "Stored in inventory";
  if (data.autoCraft?.deposited) {
    outcome = "Auto deposited";
  } else if (getSettings().autoSell && data.specimenId != null) {
    const tier = rarityTier(Number(data.gem?.rarity ?? 0));
    if (shouldAutoSell(tier.id)) {
      const { data: sale, error } = await sellCloudGem(data.specimenId);
      if (!error && sale) outcome = `Auto sold for ${formatMoney(sale.soldValue ?? data.value)}`;
      else if (error) console.error("[AUTOMATION] Auto sell failed:", error);
    }
  }

  window.dispatchEvent(new CustomEvent("gem:roll-complete", { detail: data }));
  showGlobalRollEffect(data, outcome);
}

async function run() {
  if (running || !getSettings().autoRoll || document.hidden) {
    if (!getSettings().autoRoll) releaseLease();
    return;
  }

  if (!acquireLease()) {
    schedule(1000);
    return;
  }

  running = true;
  renewLease();

  try {
    const user = await ensurePlayerAuth();
    if (!user) return;

    const player = await loadCloudPlayerState();
    if (!player) return;

    const next = player.next_roll_at ? new Date(player.next_roll_at).getTime() : 0;
    if (Number.isFinite(next) && next > Date.now()) {
      schedule(Math.min(next - Date.now() + 40, 2500));
      return;
    }

    const { data, error } = await invokeFunction("roll");
    if (error) {
      if (error.code === "cooldown" && error.details?.nextRollAt) {
        schedule(Math.max(80, new Date(error.details.nextRollAt).getTime() - Date.now() + 40));
        return;
      }
      if (error.code === "inventory_full") {
        const settings = getSettings();

        if (settings.autoSell) {
          const gems = await loadCloudGems();
          const candidate = (gems ?? [])
            .filter((gem) => !gem.locked && !shouldAutoKeep(rarityTier(Number(gem.rarity ?? 0)).id))
            .sort((a, b) => Number(a.rarity ?? 0) - Number(b.rarity ?? 0))[0];

          if (candidate?.id != null) {
            const { error: sellError } = await sellCloudGem(candidate.id);
            if (!sellError) {
              schedule(120);
              return;
            }
            console.error("[AUTOMATION] Could not free an inventory slot:", sellError);
          }
        }

        notify.warning(
          "Auto roll paused",
          "Inventory is full. Enable Auto Sell or free an inventory slot to continue."
        );
        return;
      }
      console.error("[AUTOMATION] Roll failed:", error);
      schedule(1200);
      return;
    }

    await processRoll(data);
    const nextRoll = data?.cooldown?.nextRollAt ? new Date(data.cooldown.nextRollAt).getTime() : Date.now() + 2500;
    schedule(Math.max(80, nextRoll - Date.now() + 30));
  } catch (error) {
    console.error("[AUTOMATION] Unexpected error:", error);
    schedule(1500);
  } finally {
    running = false;
    renewLease();
  }
}

function sync() {
  if (getSettings().autoRoll) {
    acquireLease();
    schedule(50);
  } else {
    clearTimer();
    releaseLease();
  }
}

onSettingsChange(sync);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) sync();
});

window.addEventListener("storage", (event) => {
  if (event.key === "gemIncremental.settings") sync();
});

leaseTimer = setInterval(() => {
  if (getSettings().autoRoll && !renewLease()) acquireLease();
}, 2000);

window.addEventListener("beforeunload", () => {
  clearTimer();
  if (leaseTimer) clearInterval(leaseTimer);
  releaseLease();
});

sync();
