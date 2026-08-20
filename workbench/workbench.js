import { mountShell } from "../src/ui/shell.js";
import { supabase } from "../src/backend/supabase.js";

/*
 * WORKBENCH [BETA]
 *
 * The browser is only responsible for the interaction. The Edge Function
 * remains the authority for inventory ownership, session state and scores.
 */
mountShell({ page: "workbench", base: "../" });

const $ = (id) => document.getElementById(id);

let config = null;
let session = null;
let selected = [];
let animationFrame = 0;
let stageTimer = null;
let stageTwoClicks = [];
let stageTwoBeat = 0;

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

async function api(action, extra = {}) {
  const { data, error } = await supabase.functions.invoke("workbench", {
    body: { action, ...extra }
  });

  if (error || data?.error) {
    throw new Error(
      data?.message ||
      data?.error ||
      error?.message ||
      "The Workbench request failed."
    );
  }

  return data;
}

function stopAnimation() {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  if (stageTimer) {
    clearTimeout(stageTimer);
    stageTimer = null;
  }
}

function showError(message) {
  $("setupStatus").textContent = message;
  $("setupStatus").classList.add("is-error");
}

function clearError() {
  $("setupStatus").textContent = "";
  $("setupStatus").classList.remove("is-error");
}

function renderMaterials(gems) {
  $("materials").innerHTML = gems.map((gem) => `
    <button
      type="button"
      class="material"
      data-gem="${escapeHtml(gem.id)}"
      aria-pressed="false"
    >
      <span class="material__name">${escapeHtml(gem.gem_name)}</span>
      <small>1 in ${Number(gem.rarity).toLocaleString()} · $${Number(gem.value || 0).toFixed(2)}</small>
    </button>
  `).join("") || "<p class='muted'>No unlocked gems available.</p>";

  document.querySelectorAll(".material").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.gem;

      if (selected.includes(id)) {
        selected = selected.filter((value) => value !== id);
      } else {
        selected = [...selected, id];
      }

      button.classList.toggle("selected", selected.includes(id));
      button.setAttribute("aria-pressed", String(selected.includes(id)));
      $("selectedCount").textContent = `${selected.length} gems selected`;
    });
  });
}

async function loadHistory() {
  const result = await api("history");

  $("history").innerHTML = (result.items || []).map((item) => `
    <div class="result-stat">
      <b>${escapeHtml(item.rarity)} ${escapeHtml(item.item_name)}</b>
      · ${escapeHtml(item.item_type)}
      · ${Number(item.quality || 1).toFixed(2)}× quality
      · ${Number(item.ore_count || 0)} gems
    </div>
  `).join("") || "<p class='muted'>No Workbench creations yet.</p>";
}

async function load() {
  clearError();

  try {
    const configResponse = await api("config");
    config = configResponse.config;

    const displayName =
      config.display_name ||
      config.beta_label ||
      "Workbench [BETA]";

    document.title = `${displayName} · Gem Incremental`;
    $("workbenchTitle").textContent = displayName;

    const materials = await api("materials");
    renderMaterials(materials.gems || []);
    await loadHistory();
  } catch (error) {
    showError(error.message);
  }
}

/* Stage 1: moving precision marker. */
function runStageOne() {
  const track = $("timingTrack");
  const target = $("target");
  const start = performance.now();
  const width = Math.max(1, track.clientWidth - 28);

  const frame = (now) => {
    const seconds = (now - start) / 1000;
    const cycle = Math.floor(seconds * 1.5);
    const progress = (seconds * 1.5) % 1;
    const normalized = cycle % 2 === 0 ? progress : 1 - progress;

    target.style.left = `${normalized * width}px`;
    animationFrame = requestAnimationFrame(frame);
  };

  animationFrame = requestAnimationFrame(frame);
}

/* Stage 2: a short rhythm sequence. The second minigame is intentionally
 * different from Stage 1, so it does not feel like a renamed copy of the
 * same timing test. */
function runStageTwo() {
  const track = $("timingTrack");
  const target = $("target");
  const now = performance.now();

  // Stage 2 is a real three-beat sync game: the marker sweeps across the
  // track on a fixed beat cycle. The player can click once per beat and the
  // score is based on how close the marker is to the centre at that beat.
  const beatMs = 900;
  const phase = (now % beatMs) / beatMs;
  const pingPong = phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
  const position = 0.08 + pingPong * 0.84;

  target.style.left = `${position * Math.max(1, track.clientWidth - 28)}px`;
  $("stageStatus").textContent = `Beat ${Math.min(stageTwoBeat + 1, 3)} / 3 · Sync the marker with the centre`;

  animationFrame = requestAnimationFrame(runStageTwo);
}

/* Stage 3: stability test. The marker accelerates and decelerates, making
 * the final click less predictable than Stage 1. */
function runStageThree() {
  const track = $("timingTrack");
  const target = $("target");
  const now = performance.now();
  const progress = (Math.sin(now / 390) + 1) / 2;
  target.style.left = `${progress * Math.max(1, track.clientWidth - 28)}px`;
  animationFrame = requestAnimationFrame(runStageThree);
}

function startStage() {
  stopAnimation();

  const stage = Number(session?.stage || 1);
  $("stageLabel").textContent = `Stage ${stage} / 3`;
  $("stageStatus").textContent = "";
  $("strike").disabled = false;

  if (stage === 2) {
    // A fresh stage always starts with a fresh three-beat sequence.
    stageTwoClicks = [];
    stageTwoBeat = 0;
  }
  $("strike").textContent = stage === 2 ? "SYNC" : "STRIKE";

  if (stage === 1) runStageOne();
  else if (stage === 2) runStageTwo();
  else runStageThree();
}

function calculateStageScore() {
  const track = $("timingTrack").getBoundingClientRect();
  const target = $("target").getBoundingClientRect();
  const targetCenter = target.left + target.width / 2;
  const center = track.left + track.width / 2;
  const distance = Math.abs(targetCenter - center) / Math.max(1, track.width / 2);

  return Math.max(0, Math.min(1, 1 - distance));
}

async function submitStage(score) {
  $("strike").disabled = true;
  stopAnimation();

  try {
    const result = await api("stage", {
      sessionId: session.id,
      score
    });

    session = result.session;

    $("stageStatus").textContent = `Timing score: ${(score * 100).toFixed(0)}%`;

    if (result.stage <= 3) {
      stageTimer = setTimeout(startStage, 500);
      return;
    }

    showResult(result.result);
    await loadHistory();
  } catch (error) {
    $("stageStatus").textContent = error.message;
    $("strike").disabled = false;
  }
}

$("start").addEventListener("click", async () => {
  clearError();

  const minimum = Number(config?.min_materials || 3);
  const maximum = Number(config?.max_materials || 50);

  if (selected.length < minimum) {
    showError(`Select at least ${minimum} gems.`);
    return;
  }

  if (selected.length > maximum) {
    showError(`Select no more than ${maximum} gems.`);
    return;
  }

  $("start").disabled = true;

  try {
    const result = await api("start", {
      itemType: $("itemType").value,
      materialIds: selected
    });

    session = result.session;
    $("setup").hidden = true;
    $("result").hidden = true;
    $("minigame").hidden = false;
    startStage();
  } catch (error) {
    showError(error.message);
  } finally {
    $("start").disabled = false;
  }
});

$("strike").addEventListener("click", async () => {
  if (!session) return;

  const score = calculateStageScore();

  /* Stage 2 is a three-beat rhythm challenge. Missing a beat lowers the
   * score, but the server still receives exactly one bounded score per stage. */
  if (Number(session.stage) === 2) {
    stageTwoClicks.push(score);
    stageTwoBeat = stageTwoClicks.length;

    if (stageTwoClicks.length < 3) {
      $("stageStatus").textContent =
        `Beat ${stageTwoClicks.length} / 3 · ${(score * 100).toFixed(0)}%`;
      // Keep the animation alive between beats. The next click is the next
      // beat rather than a second submission of the same server stage.
      $("strike").disabled = false;
      return;
    }

    const rhythmScore =
      stageTwoClicks.reduce((sum, value) => sum + value, 0) /
      stageTwoClicks.length;

    stageTwoClicks = [];
    stageTwoBeat = 0;
    await submitStage(rhythmScore);
    return;
  }

  await submitStage(score);
});

function showResult(result) {
  $("minigame").hidden = true;
  $("result").hidden = false;
  $("resultBody").innerHTML = `
    <div class="result-stat"><b>${escapeHtml(result.quality)}</b> · ${escapeHtml(result.rarity)} · ${escapeHtml(result.itemClass)}</div>
    <div class="result-stat">Multiplier: ${Number(result.multiplier || 0).toFixed(3)}× · Gem count: ${Number(result.oreCount || 0)}</div>
    <div class="result-stat">Stats: ${escapeHtml(JSON.stringify(result.stats || {}))}</div>
    <div class="result-stat">Traits: ${escapeHtml(JSON.stringify(result.traits || {}))}</div>
  `;
}

$("again").addEventListener("click", () => window.location.reload());

load();
