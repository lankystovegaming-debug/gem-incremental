import { cutsceneController, cutsceneDuration, isCutsceneEligible } from "./cutsceneController.js";
import { renderCutscene } from "./cutsceneScenes.js";
import { getSettings, onSettingsChange } from "./settings.js";
import { compareCutsceneItems, createCutsceneQueueItem } from "./cutsceneQueueModel.js";

const QUEUE_KEY = "gemIncremental.cutsceneQueue.v1";
const SEEN_KEY = "gemIncremental.cutsceneSeen.v1";
const MAX_PENDING = 100;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

class GlobalCutsceneQueue {
  #pending = [];
  #seen = new Set();
  #started = false;
  #processing = false;
  #scheduled = false;
  #suspending = false;
  #idleWaiters = new Set();

  get isBusy() {
    return this.#processing || this.#pending.length > 0 || cutsceneController.isActive;
  }

  init() {
    if (this.#started || typeof window === "undefined") return this;
    this.#started = true;
    this.#restore();
    window.addEventListener("gem:roll-complete", (event) => this.enqueue(event.detail));
    window.addEventListener("pagehide", () => {
      this.#suspending = true;
      this.#persist();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.#suspending = true;
        this.#persist();
        cutsceneController.interrupt("visibility");
        return;
      }
      this.#suspending = false;
      this.#schedule();
    });
    window.addEventListener("storage", (event) => {
      if (event.key === SEEN_KEY) this.#restoreSeen();
    });
    onSettingsChange(() => this.#schedule());
    this.#schedule();
    return this;
  }

  enqueue(result) {
    return this.enqueueBatch([result]).length > 0;
  }

  enqueueBatch(results = []) {
    const settings = getSettings();
    if (settings.cutscenesEnabled === false) return [];
    const existing = new Set(this.#pending.map((item) => item.key));
    const added = [];
    for (const result of results) {
      const rarity = Number(result?.gem?.rarity ?? result?.rarity ?? 0);
      const gemName = result?.gem?.name ?? result?.gem_name;
      if (!isCutsceneEligible({
        rarity,
        gemName,
        threshold: settings.cutsceneMinimumRarity,
        dropType: result?.gem?.dropType ?? result?.dropType
      })) continue;
      const item = createCutsceneQueueItem(result);
      if (!item || existing.has(item.key)) continue;
      if (settings.skipSeenCutscenes && this.#seen.has(item.sceneKey)) continue;
      existing.add(item.key);
      this.#pending.push(item);
      added.push(item);
    }
    if (added.length) {
      this.#pending.sort(compareCutsceneItems);
      this.#pending = this.#pending.slice(0, MAX_PENDING);
      this.#persist();
      this.#schedule();
    }
    return added;
  }

  whenIdle() {
    if (!this.isBusy) return Promise.resolve();
    return new Promise((resolve) => this.#idleWaiters.add(resolve));
  }

  #schedule() {
    if (!this.#started || this.#scheduled || this.#processing || this.#suspending) return;
    this.#scheduled = true;
    setTimeout(() => {
      this.#scheduled = false;
      this.#drain().catch((error) => {
        console.error("[CUTSCENES] Queue failed:", error);
        this.#processing = false;
        this.#resolveIdle();
      });
    }, 0);
  }

  async #drain() {
    if (this.#processing || this.#suspending || document.hidden) return;
    this.#processing = true;
    try {
      while (this.#pending.length && !this.#suspending && !document.hidden) {
        const settings = getSettings();
        const item = this.#pending[0];
        if (settings.cutscenesEnabled === false
          || (settings.skipSeenCutscenes && this.#seen.has(item.sceneKey))) {
          this.#pending.shift();
          this.#persist();
          continue;
        }

        const rarity = Number(item.result?.gem?.rarity ?? 0);
        const gemName = item.result?.gem?.name;
        if (!isCutsceneEligible({
          rarity,
          gemName,
          threshold: settings.cutsceneMinimumRarity,
          dropType: item.result?.gem?.dropType
        })) {
          this.#pending.shift();
          this.#persist();
          continue;
        }

        const duration = cutsceneDuration({ rarity, gemName });
        let result;
        try {
          result = await cutsceneController.play({
            duration,
            render: () => renderCutscene(item.result, duration),
            controls: {
              status: this.#pending.length > 1 ? `${this.#pending.length} reveals queued` : "Rare gem reveal",
              skipAriaLabel: `Skip ${gemName ?? "rare gem"} cutscene`
            }
          });
        } catch (error) {
          console.error("[CUTSCENES] Reveal could not be rendered:", error);
          this.#pending.shift();
          this.#persist();
          continue;
        }

        if (this.#suspending || result.reason === "navigation" || result.reason === "visibility") break;
        this.#pending.shift();
        this.#seen.add(item.sceneKey);
        this.#persist();
        this.#persistSeen();
      }
    } finally {
      this.#processing = false;
      this.#resolveIdle();
      if (this.#pending.length && !this.#suspending && !document.hidden) this.#schedule();
    }
  }

  #restore() {
    this.#restoreSeen();
    try {
      const stored = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
      const cutoff = Date.now() - MAX_AGE_MS;
      this.#pending = Array.isArray(stored)
        ? stored.filter((item) => item?.key && item?.result && Number(item.queuedAt) >= cutoff)
          .slice(0, MAX_PENDING)
          .sort(compareCutsceneItems)
        : [];
    } catch {
      this.#pending = [];
    }
  }

  #restoreSeen() {
    try {
      const stored = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
      this.#seen = new Set(Array.isArray(stored) ? stored.filter(Boolean).slice(-500) : []);
    } catch {
      this.#seen = new Set();
    }
  }

  #persist() {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(this.#pending)); }
    catch {}
  }

  #persistSeen() {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...this.#seen].slice(-500))); }
    catch {}
  }

  #resolveIdle() {
    if (this.isBusy) return;
    for (const resolve of this.#idleWaiters) resolve();
    this.#idleWaiters.clear();
  }
}

export const globalCutsceneQueue = new GlobalCutsceneQueue();

export function initGlobalCutscenes() {
  return globalCutsceneQueue.init();
}
