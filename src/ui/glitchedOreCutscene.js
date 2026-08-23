import { rarityLabel, escapeHtml } from "./format.js";
import { chanceLabelForResult } from "../logic/chances.js";

function clamp(v, a = 0, b = 1) { return Math.max(a, Math.min(b, v)); }
function ease(v) { v = clamp(v); return v * v * (3 - 2 * v); }

export function buildGlitchedOreCutscene(data, duration = 16000) {
  const D = Math.max(12000, Number(duration) || 16000);
  document.getElementById("glitched-ore-cutscene")?.remove();

  const gem = data?.gem || {};
  const name = String(gem.name || "Glitched Ore");
  const rarity = Number(gem.rarity || 0);
  const mutationIds = Array.isArray(data?.mutationIds) ? data.mutationIds : [];
  const mutationNames = Array.isArray(data?.mutations) ? data.mutations.map((m) => String(m.name || m.id)).filter(Boolean) : [];

  const overlay = document.createElement("div");
  overlay.id = "glitched-ore-cutscene";
  overlay.className = "go-cutscene";
  overlay.innerHTML = `
    <canvas class="go-canvas" aria-hidden="true"></canvas>
    <div class="go-noise" aria-hidden="true"></div>
    <div class="go-grid" aria-hidden="true"></div>
    <div class="go-rift go-rift--a" aria-hidden="true"></div>
    <div class="go-rift go-rift--b" aria-hidden="true"></div>
    <div class="go-ring go-ring--a" aria-hidden="true"></div>
    <div class="go-ring go-ring--b" aria-hidden="true"></div>
    <div class="go-ring go-ring--c" aria-hidden="true"></div>
    <div class="go-shatter" aria-hidden="true"></div>
    <div class="go-ore-stage" aria-hidden="true">
      <div class="go-ore-glow"></div>
      <div class="go-ore" data-label="${escapeHtml(name)}"></div>
      <div class="go-ore-scan"></div>
    </div>
    <div class="go-copy">
      <div class="go-kicker">REALITY DESYNC // DROP LOCK BROKEN</div>
      <h2 class="go-title"><span>${escapeHtml(name)}</span></h2>
      <div class="go-sub">${escapeHtml(rarityLabel(rarity))}</div>
      ${mutationNames.length ? `<div class="go-mutations">${mutationNames.map((m) => `<span>${escapeHtml(m)}</span>`).join("")}</div>` : ""}
      <div class="go-chance">Actual chance: ${escapeHtml(chanceLabelForResult(name, mutationIds))}</div>
    </div>
    <div class="go-warning">
      <span>0xGLITCH</span><span>MEMORY INTEGRITY: STABLE</span><span>RENDERER: OVERDRIVE</span>
    </div>
    <div class="go-flash"></div>
    <div class="go-vignette"></div>
    <div class="go-letterbox go-letterbox--top"></div>
    <div class="go-letterbox go-letterbox--bottom"></div>
  `;
  document.body.appendChild(overlay);

  const canvas = overlay.querySelector(".go-canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  const particles = Array.from({ length: 760 }, (_, i) => ({
    a: Math.random() * Math.PI * 2,
    r: Math.random(),
    speed: .12 + Math.random() * 1.9,
    size: 1 + Math.random() * 3.8,
    hue: i % 3 === 0 ? 186 : i % 3 === 1 ? 318 : 58,
    phase: Math.random() * 20
  }));
  const shards = Array.from({ length: 150 }, () => ({
    x: Math.random(), y: Math.random(), w: 4 + Math.random() * 32, h: 1 + Math.random() * 4,
    speed: .2 + Math.random() * 1.7, phase: Math.random() * 6.28
  }));

  let width = 0, height = 0, dpr = 1, raf = 0;
  function resize() {
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = Math.floor(width * dpr); canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize, { passive: true });

  const start = performance.now();
  function frame(now) {
    if (!document.body.contains(overlay)) {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      return;
    }
    const t = now - start;
    const p = clamp(t / D);
    const charge = ease((p - .05) / .34);
    const collapse = ease((p - .42) / .18);
    const reveal = ease((p - .56) / .16);
    const exit = ease((p - .91) / .09);

    ctx.clearRect(0, 0, width, height);
    const g = ctx.createRadialGradient(width*.5, height*.53, 0, width*.5, height*.53, Math.max(width,height)*.75);
    g.addColorStop(0, `rgba(92,255,241,${.08 + charge*.18})`);
    g.addColorStop(.35, `rgba(152,70,255,${.08 + charge*.12})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0,0,width,height);

    const cx = width*.5, cy = height*.53;
    for (const q of particles) {
      const radius = (1 - q.r * .78) * Math.min(width,height) * (.12 + charge*.72);
      const angle = q.a + now*.001*q.speed + q.r*4*collapse;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius * .62;
      const alpha = clamp(.12 + charge*.72 + collapse*.35 - exit, 0, .9);
      ctx.fillStyle = `hsla(${q.hue},100%,${65 + q.r*25}%,${alpha})`;
      ctx.fillRect(Math.round(x), Math.round(y), q.size, q.size);
    }

    // Efficient radial glitch blades: a small fixed number of strokes, not a
    // runaway DOM particle tree. This keeps the scene violent without making
    // the browser itself unstable.
    if (collapse > 0 && collapse < 1) {
      ctx.save(); ctx.translate(cx,cy);
      for (let i=0;i<24;i++) {
        const a = i*Math.PI*2/24 + now*.0008;
        const len = Math.min(width,height)*(.12 + collapse*.52) * (0.55 + ((i*17)%9)/12);
        ctx.rotate(a);
        ctx.globalAlpha = .12 + collapse*.45;
        ctx.fillStyle = i%2 ? "#ff45d4" : "#48fff0";
        ctx.fillRect(0, -1, len, 2);
        ctx.rotate(-a);
      }
      ctx.restore();
    }

    for (const s of shards) {
      const x = ((s.x + Math.sin(now*.0005*s.speed+s.phase)*.035) % 1) * width;
      const y = ((s.y + now*.00006*s.speed) % 1) * height;
      ctx.globalAlpha = .12 + collapse*.5;
      ctx.fillStyle = Math.sin(now*.004+s.phase)>0 ? "#ff3ec8" : "#53fff0";
      ctx.fillRect(x,y,s.w,s.h);
    }
    ctx.globalAlpha = 1;

    const shake = (p > .42 && p < .76) ? (1-collapse)*5 + collapse*9 : 0;
    overlay.style.setProperty("--shake-x", `${Math.sin(now*.071)*shake}px`);
    overlay.style.setProperty("--shake-y", `${Math.cos(now*.083)*shake}px`);
    overlay.style.setProperty("--go-progress", String(p));
    overlay.style.setProperty("--go-charge", String(charge));
    overlay.style.setProperty("--go-reveal", String(reveal));
    overlay.classList.toggle("go-impact", p > .43 && p < .62);
    overlay.classList.toggle("go-revealed", p > .58 && p < .93);
    overlay.style.opacity = String(Math.max(0, 1-exit));

    raf = requestAnimationFrame(frame);
  }
  requestAnimationFrame(() => overlay.classList.add("is-playing"));
  raf = requestAnimationFrame(frame);

  return new Promise((resolve) => {
    setTimeout(() => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      overlay.remove();
      resolve();
    }, D + 300);
  });
}
