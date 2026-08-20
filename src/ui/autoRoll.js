import { invokeFunction } from "../backend/invoke.js";
import { loadCloudGems, sellCloudGem } from "../backend/cloudInventory.js";
import {
  getSettings,
  updateSettings,
  onSettingsChange,
  shouldAutoSell,
  shouldAutoKeep
} from "./settings.js";
import { rarityTier } from "./format.js";
import { notify } from "./toast.js";

// The Roll page has its richer renderer/cinematic loop in main.js. Every
// other page uses this lightweight background controller so Auto Roll keeps
// working after navigating to Crafting, Leaderboards, Inventory, etc.
let cleanup = null;

export function startGlobalAutoRoll(page) {
  if (cleanup || page === "roll") return;

  let stopped = false;
  let inFlight = false;
  let timer = null;
  let unsubscribe = null;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = (delay = 0) => {
    clearTimer();
    if (stopped || !getSettings().autoRoll) return;
    timer = setTimeout(run, Math.max(0, delay));
  };

  const handleFailure = async (error) => {
    if (!error) return;

    if (error.code === "inventory_full") {
      const settings = getSettings();

      if (settings.autoSell) {
        const gems = await loadCloudGems();
        const candidate = (gems ?? [])
          .filter((gem) => !gem.locked && !shouldAutoKeep(gem))
          .sort((a, b) => Number(a.rarity ?? 0) - Number(b.rarity ?? 0))[0];

        if (candidate?.id != null) {
          const { error: sellError } = await sellCloudGem(candidate.id);
          if (!sellError) {
            schedule(120);
            return;
          }
        }
      }

      updateSettings({ autoRoll: false });
      notify.warning("Auto roll paused", "Inventory is full. Enable Auto Sell or free a slot.");
      return;
    }

    if (error.code !== "cooldown") {
      console.error("[AUTO ROLL] Background roll failed:", error);
    }
  };

  const run = async () => {
    if (stopped || inFlight || !getSettings().autoRoll || document.hidden) return;

    inFlight = true;

    try {
      const { data, error } = await invokeFunction("roll");

      if (error) {
        await handleFailure(error);

        const nextRollAt = error.details?.nextRollAt;
        if (error.code === "cooldown" && nextRollAt) {
          schedule(Math.max(50, new Date(nextRollAt).getTime() - Date.now()));
        } else if (getSettings().autoRoll) {
          schedule(350);
        }
        return;
      }

      if (!data) {
        schedule(500);
        return;
      }

      // Auto Craft is resolved server-side before a specimen is returned to
      // the client. Only a specimen that remains in inventory can be sold.
      if (
        !data.autoCraft?.deposited &&
        !shouldAutoKeep(data) &&
        shouldAutoSell(rarityTier(data.gem?.rarity).id) &&
        data.specimenId != null
      ) {
        const { error: sellError } = await sellCloudGem(data.specimenId);
        if (sellError) {
          console.error("[AUTO ROLL] Background auto-sell failed:", sellError);
        }
      }

      // Let chat and any page-local UI react to the same successful roll.
      window.dispatchEvent(new CustomEvent("gem:roll-complete", { detail: data }));

      const nextRollAt = data.cooldown?.nextRollAt;
      if (nextRollAt) {
        schedule(Math.max(50, new Date(nextRollAt).getTime() - Date.now()));
      } else {
        schedule(0);
      }
    } finally {
      inFlight = false;
    }
  };

  const onVisibilityChange = () => {
    if (!document.hidden && getSettings().autoRoll) schedule(0);
  };

  unsubscribe = onSettingsChange((settings) => {
    if (settings.autoRoll) {
      schedule(0);
    } else {
      clearTimer();
    }
  });

  document.addEventListener("visibilitychange", onVisibilityChange);

  cleanup = () => {
    stopped = true;
    clearTimer();
    unsubscribe?.();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    cleanup = null;
  };

  if (getSettings().autoRoll) schedule(0);
}
