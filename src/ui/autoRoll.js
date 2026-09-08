import { invokeFunction } from "../backend/invoke.js";
import {
  getSettings,
  hydrateSettingsFromCloud,
  updateSettings,
  onSettingsChange
} from "./settings.js";
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
      updateSettings({ autoRoll: false });
      notify.warning("Auto roll paused", "Inventory is full. Free a slot to continue.");
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

  hydrateSettingsFromCloud().then(() => { if (getSettings().autoRoll) schedule(0); }).catch(console.error);
}
