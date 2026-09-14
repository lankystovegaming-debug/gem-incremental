import { configuredCutsceneDuration, getCutsceneDefinition } from "./cutsceneConfig.js";

const MOBILE_QUERY = "(max-width: 700px), (pointer: coarse)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const FADE_OUT_MS = 250;

export function isMobileCutsceneViewport() {
  return globalThis.matchMedia?.(MOBILE_QUERY).matches ?? false;
}

export function prefersReducedCutsceneMotion() {
  return globalThis.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

export function isCutsceneEligible({ rarity, threshold, dropType } = {}) {
  const rarityValue = Number(rarity ?? 0);
  const thresholdValue = Number(threshold ?? 100_000);

  return dropType !== "relic"
    && Number.isFinite(rarityValue)
    && Number.isFinite(thresholdValue)
    && rarityValue > thresholdValue
    && getCutsceneDefinition({ rarity: rarityValue }) !== null;
}

export function cutsceneDuration({
  rarity,
  gemName,
  mobile = isMobileCutsceneViewport(),
  reducedMotion = prefersReducedCutsceneMotion()
} = {}) {
  return configuredCutsceneDuration({ rarity, gemName, mobile, reducedMotion });
}

export class CutsceneController {
  #active = null;

  get isActive() {
    return this.#active !== null;
  }

  interrupt() {
    if (!this.#active) return false;
    this.#finish(this.#active.token, { immediate: true, interrupted: true });
    return true;
  }

  play({ duration, render, onCleanup, fadeOutMs = FADE_OUT_MS }) {
    this.interrupt();

    const durationMs = Math.max(0, Number(duration) || 0);
    const token = Symbol("cutscene");
    let resolvePlay;
    const promise = new Promise((resolve) => { resolvePlay = resolve; });

    this.#active = {
      token,
      overlay: null,
      timer: null,
      fadeTimer: null,
      resolve: resolvePlay,
      onCleanup,
      renderCleanup: null,
      keydownHandler: null,
      fadeOutMs: Math.max(0, Number(fadeOutMs) || 0)
    };
    globalThis.document?.querySelectorAll?.(
      "#ultra-cutscene-overlay, #ja-ore-cutscene, #glitched-ore-cutscene"
    ).forEach((overlay) => overlay.remove());
    globalThis.document?.documentElement?.classList?.add("is-cinematic-active");
    globalThis.document?.documentElement?.setAttribute?.("aria-busy", "true");

    this.#active.keydownHandler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault?.();
        this.interrupt();
        return;
      }
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
    };
    globalThis.addEventListener?.("keydown", this.#active.keydownHandler, true);

    try {
      const rendered = render(durationMs);
      if (rendered?.overlay) {
        this.#active.overlay = rendered.overlay;
        this.#active.renderCleanup = rendered.cleanup;
      } else {
        this.#active.overlay = rendered;
      }
    } catch (error) {
      this.#finish(token, { immediate: true, interrupted: true });
      throw error;
    }

    this.#active.timer = setTimeout(() => this.#finish(token), durationMs);
    return promise;
  }

  #finish(token, { immediate = false, interrupted = false } = {}) {
    const active = this.#active;
    if (!active || active.token !== token) return;

    clearTimeout(active.timer);
    clearTimeout(active.fadeTimer);
    active.overlay?.classList?.remove("is-playing");

    const complete = () => {
      if (this.#active?.token !== token) return;
      active.overlay?.remove?.();
      this.#active = null;
      globalThis.document?.documentElement?.classList?.remove("is-cinematic-active");
      globalThis.document?.documentElement?.removeAttribute?.("aria-busy");
      globalThis.removeEventListener?.("keydown", active.keydownHandler, true);
      try { active.renderCleanup?.({ interrupted }); }
      catch (error) { console.error("Cutscene renderer cleanup failed:", error); }
      try { active.onCleanup?.({ interrupted }); }
      catch (error) { console.error("Cutscene stage cleanup failed:", error); }
      active.resolve({ interrupted });
    };

    if (immediate || active.fadeOutMs === 0) complete();
    else active.fadeTimer = setTimeout(complete, active.fadeOutMs);
  }
}

export const cutsceneController = new CutsceneController();
globalThis.addEventListener?.("pagehide", () => cutsceneController.interrupt());
globalThis.addEventListener?.("beforeunload", () => cutsceneController.interrupt());
