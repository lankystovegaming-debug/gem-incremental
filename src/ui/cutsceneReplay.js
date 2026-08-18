import { icons } from "./icons.js";
import { rarityTier, rarityLabel, escapeHtml } from "./format.js";
import { gemNameHtml } from "./gemStyle.js";
import { getGemMutation } from "../data/mutations.js";
import { getSettings } from "./settings.js";
import { chanceLabelForResult } from "../logic/chances.js";

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function durationForRarity(rarity) {
  const r = Number(rarity ?? 0);

  // 10k–99k cutscenes are intentionally short.
  if (r >= 10000 && r < 100000) return 1800;

  // Keep the larger rarity cinematics dramatic.
  if (r >= 10000000) return 22000;
  if (r >= 4000000) return 18000;
  if (r >= 1800000) return 15000;
  if (r >= 800000) return 13500;
  if (r >= 480000) return 12000;
  if (r >= 250000) return 10500;
  if (r >= 100000) return 9000;

  return 0;
}

function sceneMarkup(variant) {
  return [
    `<span class="scene__eclipse"></span><span class="scene__corona"></span><span class="scene__orbit scene__orbit-a"></span><span class="scene__orbit scene__orbit-b"></span><span class="scene__stars"></span><span class="scene__particles"></span>`,
    `<span class="scene__gate scene__gate-a"></span><span class="scene__gate scene__gate-b"></span><span class="scene__gate scene__gate-c"></span><span class="scene__constellation"></span><span class="scene__comets"></span>`,
    `<span class="scene__prism"></span><span class="scene__fracture scene__fracture-a"></span><span class="scene__fracture scene__fracture-b"></span><span class="scene__rainbow"></span><span class="scene__shards"></span>`,
    `<span class="scene__rift"></span><span class="scene__rift-ring"></span><span class="scene__tentacles"></span><span class="scene__void-stars"></span><span class="scene__shockwaves"></span>`,
    `<span class="scene__sky"></span><span class="scene__beam scene__beam-a"></span><span class="scene__beam scene__beam-b"></span><span class="scene__beam scene__beam-c"></span><span class="scene__halo"></span><span class="scene__feathers"></span>`,
    `<span class="scene__magic-circle scene__magic-circle-a"></span><span class="scene__magic-circle scene__magic-circle-b"></span><span class="scene__runes"></span><span class="scene__sigils"></span><span class="scene__arcane-sparks"></span>`,
    `<span class="scene__supernova"></span><span class="scene__shockwave scene__shockwave-a"></span><span class="scene__shockwave scene__shockwave-b"></span><span class="scene__solar-flare"></span><span class="scene__debris"></span>`,
    `<span class="scene__cathedral"></span><span class="scene__crystal-cracks"></span><span class="scene__crystal-rays"></span><span class="scene__floating-gems"></span><span class="scene__dust"></span>`,
    `<span class="scene__galaxy"></span><span class="scene__galaxy-core"></span><span class="scene__galaxy-arms"></span><span class="scene__nebula"></span><span class="scene__stars"></span>`,
    `<span class="scene__grid"></span><span class="scene__collapse"></span><span class="scene__glitch-rings"></span><span class="scene__energy-blades"></span><span class="scene__afterimage"></span>`
  ][variant] ?? "";
}

function mutationLayer(mutationId) {
  if (!mutationId) return "";
  return `
    <div class="mutation-scene-layer mutation-scene-layer--${escapeHtml(mutationId)}" aria-hidden="true">
      <span class="mutation-fx mutation-fx--a"></span>
      <span class="mutation-fx mutation-fx--b"></span>
      <span class="mutation-fx mutation-fx--c"></span>
      <span class="mutation-fx mutation-fx--d"></span>
    </div>
  `;
}

export async function replayGemCutscene({ gem, mutationId = null, mutationIds = [] }) {
  const rarity = Number(gem?.rarity ?? 0);
  const duration = durationForRarity(rarity);
  if (rarity < getSettings().cutsceneMinimumRarity) return;
  if (!duration) return;

  document.getElementById("ultra-cutscene-overlay")?.remove();

  const ids = Array.from(new Set([...(Array.isArray(mutationIds) ? mutationIds : []), ...(mutationId ? [mutationId] : [])])).filter(Boolean);
  const mutations = ids.map(id => getGemMutation(id)).filter(Boolean);
  const mutation = mutations[0] ?? null;
  const name = String(gem?.name ?? "Gem");
  const primaryMutation = mutation?.id ?? "none";
  const hash = hashString(name);
  const variant = hash % 10;
  const hue = hash % 360;
  const tier = rarityTier(rarity);

  const overlay = document.createElement("div");
  overlay.id = "ultra-cutscene-overlay";
  overlay.className = [
    "ultra-cutscene-overlay",
    `ultra-scene-${variant}`,
    rarity >= 10000000 ? "ultra-level-10m" :
      rarity >= 4000000 ? "ultra-level-4m" :
      rarity >= 1000000 ? "ultra-level-1m" :
      rarity >= 500000 ? "ultra-level-500k" :
      rarity >= 100000 ? "ultra-level-100k" :
      "ultra-level-10k",
    ...mutations.map(m => `mutation-scene-${m.id}`),
    `mutation-primary-${primaryMutation}`,
    "replay-cutscene-overlay"
  ].filter(Boolean).join(" ");

  overlay.style.setProperty("--gem-hue", String(hue));
  overlay.style.setProperty("--gem-speed", "1");
  overlay.style.setProperty("--cinematic-duration", `${duration}ms`);
  overlay.style.setProperty("--scene-animation-duration", `${duration}ms`);

  overlay.innerHTML = `
    <div class="scene__backdrop"></div>
    <div class="scene__world">${sceneMarkup(variant)}</div>
    ${mutations.map(m => mutationLayer(m.id)).join("")}
    <div class="scene__mega-world" aria-hidden="true">
      <span class="mega__warp"></span>
      <span class="mega__ring mega__ring--a"></span>
      <span class="mega__ring mega__ring--b"></span>
      <span class="mega__ring mega__ring--c"></span>
      <span class="mega__meteor-field"></span>
      <span class="mega__fracture"></span>
      <span class="mega__shockwave"></span>
      <span class="mega__singularity"></span>
      <span class="mega__title">REPLAY</span>
    </div>
    <div class="scene__flash"></div>
    <div class="scene__vignette"></div>
    <div class="scene__scanlines"></div>
    <div class="scene__reveal">
      <div class="scene__gem">${icons.gem}</div>
      <div class="scene__tier">${escapeHtml(tier.name)}</div>
      <h2 class="scene__name">${gemNameHtml(
        name,
        escapeHtml,
        mutation ? `gem-styled--mutation-${mutation.id}` : ""
      )}</h2>
      ${mutations.length ? `<div class="scene__mutation">${mutations.map(m => `<span class="mutation-name-effect mutation-name-effect--${escapeHtml(m.id)}"><span class="mutation-name-effect__fx" aria-hidden="true"></span><span class="mutation-name-effect__text">${escapeHtml(m.name)}</span></span>`).join("")}</div>` : ""}
      <div class="scene__rarity">${rarityLabel(rarity)}</div>
      <div class="scene__chance">Actual chance: ${escapeHtml(chanceLabelForResult(name, ids))}</div>
      <div class="scene__outcome">Cinematic replay</div>
    </div>
    <div class="scene__letterbox scene__letterbox-top"></div>
    <div class="scene__letterbox scene__letterbox-bottom"></div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("is-playing"));

  await new Promise((resolve) => setTimeout(resolve, duration));

  overlay.classList.remove("is-playing");
  await new Promise((resolve) => setTimeout(resolve, 250));
  overlay.remove();
}
