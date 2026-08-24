// =========================================================
// JA-ORE — “With our powers combined” pixel-cinema
//
// The scene is intentionally built from CSS + canvas.
// The uploaded ore artwork lives in jaOreCutscene.css as a transparent
// data URI, so no separate image asset has to be deployed. The legacy
// JA_ORE_DATA_URI name now lives in the CSS asset rather than this JS file.
// =========================================================

import { rarityLabel, escapeHtml } from "./format.js";
import { chanceLabelForRollResult } from "../logic/chances.js";

let injected = false;
const JA_ORE_STYLESHEET = new URL("./jaOreCutscene.css", import.meta.url);

function injectStyles() {
  if (injected || document.querySelector("link[data-ja-ore-styles]")) {
    injected = true;
    return;
  }

  injected = true;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = JA_ORE_STYLESHEET.href;
  link.dataset.jaOreStyles = "true";
  document.head.appendChild(link);
}

function createSpark() {
  return {
    x: Math.random(),
    y: 0.15 + Math.random() * 0.68,
    size: 1 + Math.random() * 4,
    phase: Math.random() * Math.PI * 2,
    speed: 0.4 + Math.random() * 1.6
  };
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function smooth(value) {
  value = clamp(value);
  return value * value * (3 - 2 * value);
}

function windowProgress(time, start, end) {
  return smooth((time - start) / (end - start));
}

function addCanvasPixel(ctx, x, y, width, height, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

function drawHero(ctx, width, height, time, duration) {
  if (time < duration * 0.12 || time > duration * 0.72) return;

  const reveal = windowProgress(time, duration * 0.12, duration * 0.24);
  const alpha = 0.25 + reveal * 0.75;
  const x = width * 0.5;
  const y = height * 0.68;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Chunky central pixel silhouette: head, torso, arms and boots.
  addCanvasPixel(ctx, x - 16, y - 84, 32, 28, "#101018");
  addCanvasPixel(ctx, x - 25, y - 56, 50, 58, "#17131e");
  addCanvasPixel(ctx, x - 42, y - 48, 17, 46, "#17131e");
  addCanvasPixel(ctx, x + 25, y - 48, 17, 46, "#17131e");
  addCanvasPixel(ctx, x - 28, y + 2, 21, 62, "#101018");
  addCanvasPixel(ctx, x + 7, y + 2, 21, 62, "#101018");

  // A warm sash gives the silhouette a little of the same sunset energy as
  // the surrounding spirits without copying any specific character design.
  addCanvasPixel(ctx, x - 26, y - 44, 52, 12, "#f2ca3b");
  addCanvasPixel(ctx, x - 12, y - 32, 18, 11, "#ffdc57");

  ctx.restore();
}

export function buildJaOreCutscene(data, outcome, duration = 15000) {
  injectStyles();
  document.getElementById("ja-ore-cutscene")?.remove();

  const D = Math.max(10000, Number(duration) || 15000);
  const mutations = Array.isArray(data?.mutations) ? data.mutations : [];
  const rarity = data?.gem?.rarity ?? 6242026;
  const gemName = String(data?.gem?.name ?? "Ja-ore");
  const mutationIds = mutations.map((mutation) => mutation.id);

  const overlay = document.createElement("div");
  overlay.id = "ja-ore-cutscene";

  overlay.innerHTML = `
    <canvas class="ja-canvas"></canvas>
    <div class="ja-sky-grid"></div>
    <div class="ja-rays"></div>
    <div class="ja-pixel-dust"></div>

    <div class="ja-spirits" aria-hidden="true">
      <div class="ja-spirit ja-spirit--a"><span></span></div>
      <div class="ja-spirit ja-spirit--b"><span></span></div>
      <div class="ja-spirit ja-spirit--c"><span></span></div>
      <div class="ja-spirit ja-spirit--d"><span></span></div>
    </div>

    <div class="ja-combine" aria-hidden="true"></div>

    <div class="ja-ore-card" data-ja="ore">
      <div class="ja-ore-glow"></div>
      <div class="ja-ore-art" role="img" aria-label="JA-ore"></div>
    </div>

    <div class="ja-flash"></div>
    <div class="ja-scanlines"></div>
    <div class="ja-vignette"></div>

    <div class="ja-copy">
      <div class="ja-kicker" data-ja="kicker">
        When the roll reaches the impossible
      </div>
      <div class="ja-title" data-ja="title">JA-ORE</div>
      <div class="ja-phrase" data-ja="phrase">
        With our powers combined
      </div>
      <div class="ja-sub" data-ja="sub">
        ${escapeHtml(rarityLabel(rarity))}
      </div>
      ${
        mutations.length
          ? `<div class="ja-muts" data-ja="muts">
              ${mutations
                .map(
                  (mutation, index) =>
                    `${index ? '<span class="dot">·</span>' : ""}<span>${escapeHtml(mutation.name)}</span>`
                )
                .join("")}
            </div>`
          : ""
      }
      <div class="ja-chance" data-ja="chance">
        Actual chance: ${escapeHtml(chanceLabelForRollResult(data, data?.gem, mutationIds))}
      </div>
    </div>

    <div class="ja-letterbox top"></div>
    <div class="ja-letterbox bottom"></div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("is-playing"));

  const canvas = overlay.querySelector(".ja-canvas");
  const ctx = canvas.getContext("2d");
  const sparks = Array.from({ length: 220 }, createSpark);

  let width = 0;
  let height = 0;
  let devicePixelRatioValue = 1;
  let animationFrame = 0;

  function resize() {
    devicePixelRatioValue = Math.min(2, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = width * devicePixelRatioValue;
    canvas.height = height * devicePixelRatioValue;
    ctx.setTransform(
      devicePixelRatioValue,
      0,
      0,
      devicePixelRatioValue,
      0,
      0
    );
  }

  resize();
  window.addEventListener("resize", resize);

  const start = performance.now();

  function drawFrame(now) {
    if (!document.body.contains(overlay)) {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      return;
    }

    const time = now - start;
    const progress = clamp(time / D);
    const fadeOut = 1 - smooth((time - D + 1000) / 1000);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);

    // Sunset bands create the warm, low-resolution stage behind the group.
    const bands = [
      ["#251437", 0, 0.16],
      ["#60205e", 0.16, 0.32],
      ["#b94a6a", 0.32, 0.49],
      ["#ee6a5b", 0.49, 0.61],
      ["#ffc45d", 0.61, 0.69],
      ["#56345d", 0.69, 0.79],
      ["#160d26", 0.79, 1]
    ];

    for (const [fill, top, bottom] of bands) {
      addCanvasPixel(
        ctx,
        0,
        height * top,
        width,
        height * (bottom - top) + 2,
        fill
      );
    }

    // Low sun / impact light.
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#ffe47a";
    ctx.beginPath();
    ctx.arc(
      width * 0.5,
      height * 0.63,
      Math.min(width, height) * 0.105,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.globalAlpha = 1;

    addCanvasPixel(ctx, 0, height * 0.72, width, height * 0.07, "#3b2447");
    addCanvasPixel(ctx, 0, height * 0.79, width, height * 0.21, "#160d26");

    // Pixel skyline / horizon blocks.
    for (let i = 0; i < 22; i += 1) {
      const x = (i / 22) * width;
      const blockHeight = (0.025 + (0.09 * ((i * 13) % 11)) / 11) * height;
      addCanvasPixel(
        ctx,
        x,
        height * 0.72 - blockHeight,
        Math.max(18, width / 30),
        blockHeight,
        "#2d1940"
      );
    }

    // Floating pixel particles.
    const pulse = windowProgress(time, D * 0.05, D * 0.32);
    for (const spark of sparks) {
      const drift = Math.sin(now * 0.001 * spark.speed + spark.phase) * 18;
      const y =
        spark.y * height +
        Math.sin(now * 0.002 * spark.speed + spark.phase) * 11;

      ctx.globalAlpha = (0.12 + 0.75 * pulse) * (1 - 0.25 * progress);
      const fill =
        spark.speed > 1.3
          ? "#ffe17c"
          : spark.speed > 0.8
            ? "#70fff0"
            : "#d86cff";

      addCanvasPixel(ctx, spark.x * width + drift, y, spark.size, spark.size, fill);
    }
    ctx.globalAlpha = 1;

    drawHero(ctx, width, height, time, D);

    // Three powers converge toward the center before the ore appears.
    if (time > D * 0.30 && time < D * 0.64) {
      const combineProgress = windowProgress(time, D * 0.30, D * 0.64);
      const centerX = width * 0.5;
      const centerY = height * 0.52;
      const starts = [
        [width * 0.22, height * 0.55],
        [width * 0.50, height * 0.38],
        [width * 0.78, height * 0.55]
      ];
      const fills = ["#69efff", "#a878ff", "#f4e66d"];

      ctx.globalAlpha = 0.28 + 0.55 * (1 - combineProgress);
      starts.forEach(([startX, startY], index) => {
        ctx.strokeStyle = fills[index];
        ctx.lineWidth = 3 + 5 * (1 - combineProgress);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(centerX + (index - 1) * 20, centerY);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    if (time > D * 0.56 && time < D * 0.73) {
      overlay.classList.add("flash");
    }

    const revealTimes = {
      kicker: D * 0.15,
      title: D * 0.28,
      phrase: D * 0.44,
      ore: D * 0.60,
      sub: D * 0.70,
      muts: D * 0.76,
      chance: D * 0.81
    };

    overlay.querySelectorAll("[data-ja]").forEach((element) => {
      const revealAt = revealTimes[element.dataset.ja] ?? Number.POSITIVE_INFINITY;
      element.classList.toggle("show", time >= revealAt && time < D - 650);
    });

    overlay.classList.toggle("cine", time > D * 0.07 && time < D - 700);

    if (time > D * 0.59) {
      overlay.querySelector(".ja-ore-card")?.classList.add("show");
    }

    if (time > D - 700) {
      overlay.style.opacity = String(fadeOut);
    }

    animationFrame = requestAnimationFrame(drawFrame);
  }

  animationFrame = requestAnimationFrame(drawFrame);
  return overlay;
}
