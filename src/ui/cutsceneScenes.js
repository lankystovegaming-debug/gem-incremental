import { rarityLabel, rarityTier, escapeHtml } from "./format.js";
import { gemIconHtml, gemNameHtml } from "./gemStyle.js";
import { getGemMutation } from "../data/mutations.js";
import { chanceLabelForResult, chanceLabelForRollResult } from "../logic/chances.js";
import { buildXyGemCutscene } from "./xyGemCutscene.js";
import { getCutsceneDefinition, normalizeCutsceneName } from "./cutsceneConfig.js";
import {
  createLingeringCrack,
  createTheatricalUiClones,
  scenePrimitivesMarkup,
  specimenMarkup
} from "./cutscenePrimitives.js";

let stylesheetInjected = false;
const STYLESHEET = new URL("./cutsceneScenes.css", import.meta.url);

function injectStyles() {
  if (stylesheetInjected || document.querySelector("link[data-cutscene-v5-styles]")) {
    stylesheetInjected = true;
    return;
  }
  stylesheetInjected = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLESHEET.href;
  link.dataset.cutsceneV5Styles = "true";
  document.head.appendChild(link);
}

function mutationIdsFor(data) {
  return Array.from(new Set([
    ...(Array.isArray(data?.mutationIds) ? data.mutationIds : []),
    ...(Array.isArray(data?.mutations) ? data.mutations.map((mutation) => mutation?.id) : []),
    data?.mutation?.id,
    data?.mutationId,
    data?.gem?.mutation_id,
    data?.gem?.mutationId
  ].filter(Boolean).map((id) => String(id).toLowerCase())));
}

function chanceFor(data, gem, mutationIds, replay) {
  try {
    const label = replay
      ? chanceLabelForResult(gem.name, mutationIds)
      : chanceLabelForRollResult(data, gem, mutationIds);
    return label === "Impossible" && gem.rarity > 0 ? rarityLabel(gem.rarity) : label;
  } catch {
    return rarityLabel(gem.rarity);
  }
}

function safeClass(value) {
  return String(value).replace(/[^a-z0-9_-]/gi, "");
}

function randomSafeAnchor() {
  const anchors = [
    ["18%", "22%"], ["78%", "20%"], ["15%", "72%"], ["82%", "70%"],
    ["50%", "16%"], ["24%", "52%"], ["76%", "48%"]
  ];
  return anchors[Math.floor(Math.random() * anchors.length)];
}

function buildStandardScene(data, duration, { replay = false } = {}) {
  injectStyles();
  const gem = { ...(data?.gem ?? {}), rarity: Number(data?.gem?.rarity ?? 0) };
  const gemName = String(gem.name ?? "Gem");
  const definition = getCutsceneDefinition({ rarity: gem.rarity, gemName });
  const mutationIds = mutationIdsFor(data);
  const mutations = mutationIds.map((id) => getGemMutation(id)).filter(Boolean);
  const tier = rarityTier(gem.rarity);
  const [anchorX, anchorY] = definition.randomAnchor ? randomSafeAnchor() : ["50%", "50%"];
  const hue = [...gemName].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0) % 360;

  const overlay = document.createElement("div");
  overlay.id = "ultra-cutscene-overlay";
  overlay.className = [
    "cutscene-v5", `cs--${safeClass(definition.theme)}`,
    definition.cameraMotion ? `cs-camera--${safeClass(definition.cameraMotion)}` : "",
    definition.secret ? "cs--secret" : "cs--catalogued",
    definition.quiet ? "cs--quiet" : "",
    replay ? "cs--replay" : "",
    ...mutationIds.map((id) => `mutation-scene-${safeClass(id)}`)
  ].filter(Boolean).join(" ");
  overlay.dataset.scene = definition.theme;
  overlay.dataset.phase = "intro";
  overlay.style.setProperty("--cinematic-duration", `${duration}ms`);
  overlay.style.setProperty("--cs-intensity", String(definition.intensity ?? 0.65));
  overlay.style.setProperty("--gem-hue", String(hue));
  overlay.style.setProperty("--where-x", anchorX);
  overlay.style.setProperty("--where-y", anchorY);
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", `${gemName} cutscene`);

  const specimen = gemIconHtml(gemName, "gem-icon--cinematic", mutationIds);
  const primitives = definition.primitives ?? [];
  const hasCopy = definition.beats.length > 0 || definition.counter;
  const mutationLine = mutations.length
    ? `<div class="cs-reveal__mutations">${mutations.map((mutation) => escapeHtml(mutation.name)).join(" · ")}</div>`
    : "";
  overlay.innerHTML = `
    <div class="cs-camera-stage">
      <div class="cs-backdrop"></div>
    ${definition.fakeResult ? `<div class="cs-fake-result">
      <div class="cs-fake-result__gem">${gemIconHtml("Quartz", "gem-icon--roll", [])}</div>
      <strong>Quartz</strong><span>Common · 1 in 2</span><small>Stored in inventory</small>
    </div>` : ""}
      ${scenePrimitivesMarkup(primitives)}
      ${definition.focus === false ? "" : specimenMarkup(specimen, { reticle: primitives.includes("reticle") })}
    </div>
    ${hasCopy ? `<div class="cs-copy cs-copy--${safeClass(definition.textPosition ?? "center-low")}" aria-live="polite">
      <div class="cs-counter" aria-hidden="true"></div>
      ${definition.beats.map((beat, index) => `<div class="cs-beat" data-beat="${index}">${escapeHtml(beat)}</div>`).join("")}
    </div>` : ""}
    <div class="cs-reveal cs-reveal--${safeClass(definition.revealPosition ?? "center")}">
      <div class="cs-reveal__gem">${specimen}</div>
      <div class="cs-reveal__tier">${definition.secret ? "SECRET" : escapeHtml(tier.name)}</div>
      <h2 class="cs-reveal__name">${gemNameHtml(gemName, escapeHtml)}</h2>
      ${mutationLine}
      <div class="cs-reveal__rarity">${escapeHtml(rarityLabel(gem.rarity))}</div>
      <div class="cs-reveal__chance">Actual chance: ${escapeHtml(chanceFor(data, gem, mutationIds, replay))}</div>
    </div>
    <div class="cs-vignette"></div>
    <div class="cs-letterbox cs-letterbox--top"></div>
    <div class="cs-letterbox cs-letterbox--bottom"></div>`;

  if (definition.theatre) overlay.insertBefore(createTheatricalUiClones(), overlay.querySelector(".cs-vignette"));
  document.body.appendChild(overlay);

  const timers = [];
  const intervals = [];
  const schedule = (fraction, callback) => {
    timers.push(setTimeout(() => {
      if (overlay.isConnected) callback();
    }, Math.max(0, duration * fraction)));
  };
  const beats = [...overlay.querySelectorAll(".cs-beat")];
  const counterDuration = definition.counter
    ? Math.min(9_000, duration * 0.68, Number(definition.counterDuration) || duration * 0.55)
    : 0;
  const beatStart = definition.counter
    ? Math.max(definition.beatStart ?? 0.16, counterDuration / duration + 0.07)
    : definition.beatStart ?? (definition.fakeResult ? 0.28 : 0.16);
  const beatWindow = definition.beatWindow ?? Math.max(0.08, (definition.revealAt ?? 0.78) - beatStart - 0.08);
  beats.forEach((beat, index) => schedule(beatStart + (index / Math.max(1, beats.length)) * beatWindow, () => {
    beats.forEach((node) => node.classList.remove("is-current"));
    beat.classList.add("is-current");
    overlay.dataset.phase = `beat-${index}`;
  }));
  const revealAt = definition.revealAt ?? 0.78;
  schedule(definition.worldExitAt ?? Math.max(0, revealAt - 0.04), () => {
    overlay.querySelector(".cs-camera-stage")?.classList.add("is-exiting");
    overlay.querySelector(".cs-copy")?.classList.add("is-exiting");
  });
  schedule(revealAt, () => {
    overlay.dataset.phase = "reveal";
    beats.forEach((node) => node.classList.remove("is-current"));
    overlay.querySelector(".cs-reveal")?.classList.add("is-visible");
  });

  if (definition.counter) {
    const counter = overlay.querySelector(".cs-counter");
    const startedAt = performance.now();
    const timer = setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / counterDuration);
      // Ease out aggressively so the final nine values become readable.
      const eased = 1 - Math.pow(1 - progress, 5);
      const value = Math.min(999_999_999, Math.max(1, Math.floor(999_999_999 * eased)));
      counter.textContent = value.toLocaleString("en-US");
      if (progress >= 1) clearInterval(timer);
    }, 40);
    intervals.push(timer);
    schedule(counterDuration / duration, () => {
      counter.textContent = "1,000,000,000";
      counter.classList.add("is-carry");
    });
    schedule(Math.min(0.72, counterDuration / duration + 0.045), () => {
      counter.textContent = "999,999,999";
      counter.classList.remove("is-carry");
    });
  }

  const memories = [...overlay.querySelectorAll(".cs-memories [data-memory]")];
  const memoryStart = 0.035;
  const memoryEnd = 0.61;
  // Let the first memories linger, then steadily accelerate into rapid recall.
  const memoryWeights = memories.map((_, index) => {
    const progress = memories.length > 1 ? index / (memories.length - 1) : 0;
    return 2.5 * Math.pow(0.4 / 2.5, progress);
  });
  const memoryWeightTotal = memoryWeights.reduce((total, weight) => total + weight, 0);
  let elapsedMemoryWeight = 0;
  memories.forEach((memory, index) => {
    const memoryProgress = memoryWeightTotal ? elapsedMemoryWeight / memoryWeightTotal : 0;
    schedule(memoryStart + (memoryEnd - memoryStart) * memoryProgress, () => {
      memories.forEach((node) => node.classList.remove("is-current"));
      memory.classList.add("is-current");
      overlay.dataset.memory = memory.dataset.memory;
    });
    elapsedMemoryWeight += memoryWeights[index];
  });
  if (memories.length) schedule(memoryEnd, () => {
    memories.forEach((node) => node.classList.remove("is-current"));
    overlay.dataset.memory = "assemble";
  });

  requestAnimationFrame(() => overlay.classList.add("is-playing"));
  return {
    overlay,
    cleanup({ interrupted } = {}) {
      timers.forEach(clearTimeout);
      intervals.forEach(clearInterval);
      if (!interrupted && definition.lingeringCrack) createLingeringCrack();
    }
  };
}

export function renderCutscene(data, duration, options = {}) {
  const name = normalizeCutsceneName(data?.gem?.name);
  const definition = getCutsceneDefinition({ rarity: data?.gem?.rarity, gemName: name });
  if (definition?.theme === "xy-heart") {
    return buildXyGemCutscene(data, { icon: "", text: options.replay ? "Cinematic replay" : "" }, duration);
  }
  return buildStandardScene(data, duration, options);
}
