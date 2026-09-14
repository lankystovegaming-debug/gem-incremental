const MOBILE_QUERY = "(max-width: 700px), (pointer: coarse)";
const FADE_OUT_MS = 250;

function normalizedName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function baseDurationForRarity(rarity) {
  const value = Number(rarity ?? 0);

  if (value >= 10_000_000) return 22_000;
  if (value >= 4_000_000) return 18_000;
  if (value >= 1_800_000) return 15_000;
  if (value >= 800_000) return 13_500;
  if (value >= 480_000) return 12_000;
  if (value >= 250_000) return 10_500;
  if (value >= 100_000) return 9_000;
  if (value >= 10_000) return 2_400;

  return 0;
}

export function isMobileCutsceneViewport() {
  return globalThis.matchMedia?.(MOBILE_QUERY).matches ?? false;
}

export function isCutsceneEligible({ rarity, threshold, dropType } = {}) {
  const rarityValue = Number(rarity ?? 0);
  const thresholdValue = Number(threshold ?? 100_000);

  return dropType !== "relic"
    && Number.isFinite(rarityValue)
    && Number.isFinite(thresholdValue)
    && rarityValue > thresholdValue
    && baseDurationForRarity(rarityValue) > 0;
}

export function cutsceneDuration({ rarity, gemName, mobile = isMobileCutsceneViewport() } = {}) {
  const name = normalizedName(gemName);
  let duration = baseDurationForRarity(rarity);

  if (name === "xy gem" || name === "heart of xy") duration = Math.max(duration, 30_000);
  else if (name === "ja-ore") duration = 15_000;
  else if (/glitch(?:ed)?[\s_-]*ore/.test(name)) duration = Math.max(duration, 12_000);

  return mobile ? Math.round(duration * 1.08) : duration;
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
      fadeOutMs: Math.max(0, Number(fadeOutMs) || 0)
    };
    globalThis.document?.querySelectorAll?.(
      "#ultra-cutscene-overlay, #ja-ore-cutscene, #glitched-ore-cutscene"
    ).forEach((overlay) => overlay.remove());
    globalThis.document?.documentElement?.classList?.add("is-cinematic-active");

    try {
      this.#active.overlay = render(durationMs);
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
      try { active.onCleanup?.({ interrupted }); }
      finally { active.resolve({ interrupted }); }
    };

    if (immediate || active.fadeOutMs === 0) complete();
    else active.fadeTimer = setTimeout(complete, active.fadeOutMs);
  }
}

export const cutsceneController = new CutsceneController();
globalThis.addEventListener?.("pagehide", () => cutsceneController.interrupt());
