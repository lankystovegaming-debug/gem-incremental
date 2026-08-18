// =========================================================
// XY GEM — bespoke cutscene (1 in 15,000,000)
//
// A one-of-a-kind reveal, distinct from the generic tiered
// cutscenes: canvas particle convergence -> flash + shockwave ->
// a faceted brilliant-cut jewel with god rays, orbiting shards and
// staged text, plus synthesized sound. Only ever plays for the Xy
// Gem, so its blast radius on normal play is zero.
//
// It honours the same lifecycle contract as buildUltraCutscene:
// returns the overlay element, plays while "is-playing" is set, and
// tears itself down when the element is removed from the DOM.
// =========================================================

import { rarityLabel, escapeHtml } from "./format.js";
import { chanceLabelForResult } from "../logic/chances.js";
import { getSettings } from "./settings.js";

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    #ultra-cutscene-overlay.xy-cutscene{position:fixed;inset:0;z-index:1000;background:#05040c;
      overflow:hidden;opacity:0;transition:opacity .5s ease;}
    #ultra-cutscene-overlay.xy-cutscene.is-playing{opacity:1;}
    .xy-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;}
    .xy-bar{position:absolute;left:0;right:0;height:0;background:#000;z-index:3;
      transition:height .9s cubic-bezier(.7,0,.2,1);}
    .xy-bar.top{top:0;} .xy-bar.bottom{bottom:0;}
    .xy-cutscene.cine .xy-bar{height:9vh;}
    .xy-gemwrap{position:absolute;left:50%;top:44%;z-index:2;width:min(42vh,60vw);
      perspective:900px;transform:translate(-50%,-50%) scale(0);opacity:0;
      transition:opacity .5s ease, transform 1.15s cubic-bezier(.18,1.5,.32,1);
      filter:drop-shadow(0 0 42px rgba(150,110,255,.8)) drop-shadow(0 0 100px rgba(120,80,255,.5));}
    .xy-gemwrap.reveal{opacity:1;transform:translate(-50%,-50%) scale(1);}
    .xy-gem{width:100%;height:auto;display:block;transform-origin:50% 45%;}
    .xy-gemwrap.reveal .xy-gem{animation:xyGemLife 6s ease-in-out infinite;}
    @keyframes xyGemLife{0%{transform:translateY(-7px) rotateY(-15deg);}
      50%{transform:translateY(7px) rotateY(15deg);}100%{transform:translateY(-7px) rotateY(-15deg);}}
    .xy-gleam{animation:xyGleam 3s ease-in-out infinite;}
    @keyframes xyGleam{0%{transform:translateX(0)}55%,100%{transform:translateX(330px)}}
    .xy-beats{position:absolute;inset:0;z-index:4;display:flex;flex-direction:column;
      align-items:center;justify-content:flex-end;padding-bottom:15vh;text-align:center;
      pointer-events:none;}
    .xy-beat{opacity:0;transform:translateY(18px);filter:blur(6px);
      transition:opacity .9s ease,transform 1.1s cubic-bezier(.16,1,.3,1),filter .9s ease;
      text-shadow:0 2px 40px rgba(120,90,255,.55);color:#EDEBFF;}
    .xy-beat.show{opacity:1;transform:none;filter:none;}
    .xy-kicker{font-family:var(--font-mono,monospace);font-size:clamp(.6rem,1.6vw,.8rem);
      letter-spacing:.5em;text-transform:uppercase;color:#66e6ff;margin-bottom:12px;padding-left:.5em;}
    .xy-title{font-weight:700;letter-spacing:.02em;line-height:.95;font-size:clamp(3rem,13vw,8rem);
      background:linear-gradient(180deg,#fff 0%,#d9c9ff 45%,#8f7bff 100%);
      -webkit-background-clip:text;background-clip:text;color:transparent;}
    .xy-sub{margin-top:20px;font-family:var(--font-mono,monospace);font-variant-numeric:tabular-nums;
      font-size:clamp(1rem,3.2vw,1.6rem);letter-spacing:.1em;}
    .xy-chance{margin-top:10px;font-family:var(--font-mono,monospace);font-size:clamp(.75rem,2vw,1rem);
      color:#8f88c4;letter-spacing:.06em;}
    .xy-mut{margin-top:12px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;
      font-family:var(--font-mono,monospace);font-size:clamp(.7rem,2vw,1rem);letter-spacing:.14em;
      text-transform:uppercase;color:#c6b0ff;}
    @media (prefers-reduced-motion:reduce){
      .xy-gemwrap.reveal .xy-gem,.xy-gleam{animation:none;}
    }
  `;
  document.head.appendChild(s);
}

function gemSvg() {
  return `
  <svg class="xy-gem" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id="xyGemClip">
        <polygon points="100,4 167.9,32.1 196,100 167.9,167.9 100,196 32.1,167.9 4,100 32.1,32.1"/>
      </clipPath>
      <radialGradient id="xyTableG" cx="38%" cy="32%" r="80%">
        <stop offset="0" stop-color="#f1e8ff"/><stop offset="55%" stop-color="#c9b3ff"/>
        <stop offset="100%" stop-color="#8f6fe6"/>
      </radialGradient>
      <radialGradient id="xySpec" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#ffffff" stop-opacity=".85"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <g stroke="#efe7ff" stroke-width="1" stroke-opacity=".28" stroke-linejoin="round">
      <polygon points="100,58 129.7,70.3 167.9,32.1 100,4"     fill="hsl(273 74% 62%)"/>
      <polygon points="129.7,70.3 142,100 196,100 167.9,32.1"  fill="hsl(270 62% 45%)"/>
      <polygon points="142,100 129.7,129.7 167.9,167.9 196,100" fill="hsl(268 58% 35%)"/>
      <polygon points="129.7,129.7 100,142 100,196 167.9,167.9" fill="hsl(267 55% 33%)"/>
      <polygon points="100,142 70.3,129.7 32.1,167.9 100,196"  fill="hsl(270 62% 45%)"/>
      <polygon points="70.3,129.7 58,100 4,100 32.1,167.9"     fill="hsl(273 74% 62%)"/>
      <polygon points="58,100 70.3,70.3 32.1,32.1 4,100"       fill="hsl(275 80% 73%)"/>
      <polygon points="70.3,70.3 100,58 100,4 32.1,32.1"       fill="hsl(276 82% 76%)"/>
    </g>
    <polygon points="100,58 129.7,70.3 142,100 129.7,129.7 100,142 70.3,129.7 58,100 70.3,70.3" fill="url(#xyTableG)"/>
    <g fill="#ffffff" fill-opacity=".10" stroke="#efe7ff" stroke-width=".8" stroke-opacity=".3">
      <polygon points="100,58 129.7,70.3 100,100"/><polygon points="129.7,70.3 142,100 100,100"/>
      <polygon points="142,100 129.7,129.7 100,100"/><polygon points="129.7,129.7 100,142 100,100"/>
      <polygon points="100,142 70.3,129.7 100,100"/><polygon points="70.3,129.7 58,100 100,100"/>
      <polygon points="58,100 70.3,70.3 100,100"/><polygon points="70.3,70.3 100,58 100,100"/>
    </g>
    <g clip-path="url(#xyGemClip)"><circle cx="66" cy="60" r="46" fill="url(#xySpec)"/></g>
    <polygon points="100,4 167.9,32.1 196,100 167.9,167.9 100,196 32.1,167.9 4,100 32.1,32.1"
      fill="none" stroke="#f6f1ff" stroke-width="2.6" stroke-linejoin="round"/>
    <g clip-path="url(#xyGemClip)"><rect class="xy-gleam" x="-70" y="-10" width="56" height="220" fill="#fff" opacity=".45"/></g>
  </svg>`;
}

export function buildXyGemCutscene(data, outcome, duration) {
  injectStyles();
  document.getElementById("ultra-cutscene-overlay")?.remove();

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const D = Math.max(9000, Number(duration) || 22000);
  const mutationIds = Array.isArray(data?.mutations)
    ? data.mutations.map((m) => m.id).filter(Boolean)
    : (data?.mutation?.id ? [data.mutation.id] : []);
  const mutationNames = Array.isArray(data?.mutations)
    ? data.mutations.map((m) => m.name).filter(Boolean) : [];

  const overlay = document.createElement("div");
  overlay.id = "ultra-cutscene-overlay";
  overlay.className = "xy-cutscene";
  overlay.innerHTML = `
    <canvas class="xy-canvas"></canvas>
    <div class="xy-bar top"></div><div class="xy-bar bottom"></div>
    <div class="xy-gemwrap">${gemSvg()}</div>
    <div class="xy-beats">
      <div class="xy-beat xy-kicker" data-b="kicker">Something has surfaced</div>
      <div class="xy-beat xy-title" data-b="title">${gemNameSafe(data)}</div>
      <div class="xy-beat xy-sub" data-b="sub">${escapeHtml(rarityLabel(data?.gem?.rarity ?? 100000000))}</div>
      ${mutationNames.length ? `<div class="xy-beat xy-mut" data-b="mut">${mutationNames.map((n) => escapeHtml(n)).join(" · ")}</div>` : ""}
      <div class="xy-beat xy-chance" data-b="chance">Actual chance: ${escapeHtml(chanceLabelForResult(String(data?.gem?.name ?? "Heart of Xy"), mutationIds))}</div>
    </div>
  `;
  document.body.appendChild(overlay);

  runCutscene(overlay, D, reduce);

  requestAnimationFrame(() => overlay.classList.add("is-playing"));
  return overlay;
}

function gemNameSafe(data) {
  return escapeHtml(String(data?.gem?.name ?? "Heart of Xy"));
}

// ---------------------------------------------------------
// Animation + audio
// ---------------------------------------------------------
function runCutscene(overlay, D, reduce) {
  const cv = overlay.querySelector(".xy-canvas");
  const ctx = cv.getContext("2d");
  const gemEl = overlay.querySelector(".xy-gemwrap");
  const beatEls = [...overlay.querySelectorAll(".xy-beat")];

  let W = 0, H = 0, DPR = 1, cx = 0, cy = 0, stars = [], parts = [], shards = [];
  function resize() {
    DPR = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight; cx = W / 2; cy = H / 2;
    cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const n = Math.round((W * H) / 6500);
    stars = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, z: Math.random(), tw: Math.random() * 6.28, sp: 0.4 + Math.random() * 1.6 }));
  }
  parts = Array.from({ length: 220 }, () => {
    const a = Math.random() * 6.28, d = Math.max(innerWidth, innerHeight) * (0.35 + Math.random() * 0.5);
    return { a, d0: d, d, hue: 255 + Math.random() * 70, sz: 1 + Math.random() * 2.2, sp: 0.55 + Math.random() * 0.6, tw: Math.random() * 6.28 };
  });
  shards = Array.from({ length: 14 }, (_, i) => ({ a: (i / 14) * 6.28, rr: 120 + Math.random() * 160, sp: 0.3 + Math.random() * 0.5, sz: 3 + Math.random() * 7, hue: 250 + Math.random() * 80, tilt: 0.35 + Math.random() * 0.4, ph: Math.random() * 6.28 }));
  resize();
  addEventListener("resize", resize);

  // proportional phase timings
  const T = {
    gatherA: D * 0.06, charge: D * 0.2, flash: reduce ? 1e9 : D * 0.205,
    burst: reduce ? D * 0.02 : D * 0.22, reveal: reduce ? D * 0.04 : D * 0.22
  };
  const beats = {
    kicker: D * 0.24, title: D * 0.29, sub: D * 0.35, mut: D * 0.4, chance: D * 0.44
  };

  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t * t;
  const win = (t, a, b) => clamp01((t - a) / (b - a));

  const start = performance.now();
  let raf = 0;

  function frame(now) {
    if (!document.body.contains(overlay)) { cancelAnimationFrame(raf); removeEventListener("resize", resize); stopAudio(); return; }
    raf = requestAnimationFrame(frame);
    const t = now - start;
    const endFade = 1 - smooth(win(t, D - 1200, D));

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#05040c"; ctx.fillRect(0, 0, W, H);

    const charge = smooth(win(t, T.gatherA, T.charge));
    if (charge > 0) {
      const cgl = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6);
      cgl.addColorStop(0, `hsla(272,100%,60%,${0.22 * charge})`); cgl.addColorStop(1, "hsla(272,100%,60%,0)");
      ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = cgl; ctx.fillRect(0, 0, W, H);
    }

    ctx.globalCompositeOperation = "lighter";
    const push = 1 + charge * 0.5;
    for (const s of stars) {
      const dx = (s.x - cx) * push + cx, dy = (s.y - cy) * push + cy;
      const tw = 0.5 + 0.5 * Math.sin(now * 0.001 * s.sp + s.tw);
      const b = (0.25 + 0.75 * s.z) * (0.5 + tw * 0.5) * (1 - charge * 0.5) * endFade;
      ctx.fillStyle = `rgba(${200 + 40 * s.z},210,255,${b})`; ctx.fillRect(dx, dy, 1.4 + s.z * 1.4, 1.4 + s.z * 1.4);
    }

    if (t < T.burst + 400) {
      const gp = win(t, T.gatherA, T.charge);
      for (const p of parts) {
        const prog = easeIn(clamp01(gp * p.sp)); p.d = p.d0 * (1 - prog);
        const jit = Math.sin(now * 0.004 + p.tw) * 6 * (1 - prog);
        const x = cx + Math.cos(p.a) * p.d + jit, y = cy + Math.sin(p.a) * p.d * 0.92 + jit;
        const b = (0.3 + 0.7 * prog) * endFade;
        ctx.fillStyle = `hsla(${p.hue},100%,72%,${b})`; ctx.beginPath(); ctx.arc(x, y, p.sz * (0.6 + prog), 0, 6.2832); ctx.fill();
      }
      const coreR = 6 + charge * charge * 70;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.2);
      cg.addColorStop(0, `rgba(255,255,255,${charge})`); cg.addColorStop(0.5, `hsla(275,100%,70%,${0.7 * charge})`); cg.addColorStop(1, "hsla(275,100%,70%,0)");
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, coreR * 2.2, 0, 6.2832); ctx.fill();
    }

    if (t >= T.burst && t < T.burst + 1400) {
      const sw = win(t, T.burst, T.burst + 1400), r = easeOut(sw) * Math.max(W, H) * 0.75;
      ctx.strokeStyle = `hsla(280,100%,80%,${(1 - sw) * 0.9})`; ctx.lineWidth = Math.max(1, (1 - sw) * 22);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke();
    }

    if (t >= T.reveal) {
      const rp = win(t, T.reveal, T.reveal + 900), rayLen = Math.min(W, H) * 0.6;
      // god rays
      ctx.save(); ctx.translate(cx, cy - Math.min(W, H) * 0.02); ctx.rotate(t * 0.0009);
      const rot = t * 0.0009, len = rayLen * (0.6 + 0.4 * smooth(rp));
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * 6.2832, puls = 0.5 + 0.5 * Math.sin(rot * 3 + i), w = 0.02 + 0.03 * puls;
        ctx.fillStyle = `hsla(${272 + 20 * Math.sin(i)},100%,72%,${0.10 * endFade * (0.5 + puls * 0.5)})`;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - w) * len, Math.sin(a - w) * len); ctx.lineTo(Math.cos(a + w) * len, Math.sin(a + w) * len); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      for (const sh of shards) {
        sh.a += sh.sp * 0.008; const rr = sh.rr * smooth(rp);
        const x = cx + Math.cos(sh.a) * rr, y = (cy - Math.min(W, H) * 0.02) + Math.sin(sh.a) * rr * sh.tilt;
        const tw = 0.5 + 0.5 * Math.sin(now * 0.004 + sh.ph);
        ctx.save(); ctx.translate(x, y); ctx.rotate(sh.a * 2);
        ctx.fillStyle = `hsla(${sh.hue},100%,${70 + tw * 20}%,${(0.5 + tw * 0.5) * endFade})`;
        const s = sh.sz * (0.7 + tw * 0.5);
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.6, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.6, 0); ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }

    // white flash
    let flash = 0;
    if (t >= T.flash && t < T.burst) flash = smooth(win(t, T.flash, T.burst));
    else if (t >= T.burst && t < T.burst + 500) flash = 1 - smooth(win(t, T.burst, T.burst + 500));
    if (flash > 0) { ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, W, H); }

    // dom layers
    gemEl.classList.toggle("reveal", t >= T.reveal && t < D - 300);
    overlay.classList.toggle("cine", t > 200 && t < D - 400);
    for (const el of beatEls) {
      const at = beats[el.dataset.b] ?? 1e9;
      el.classList.toggle("show", t >= at && t < D - 400);
    }
  }
  raf = requestAnimationFrame(frame);

  if (!reduce && soundAllowed()) startAudio(D);
}

// ---------- audio ----------
let AC = null;
function soundAllowed() {
  try { const s = getSettings(); return s.cutsceneSound !== false && s.sound !== false; }
  catch { return true; }
}
function stopAudio() { try { if (AC) { AC.close(); AC = null; } } catch { /* noop */ } }
function startAudio(D) {
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === "suspended") AC.resume();
    const ac = AC, t0 = ac.currentTime, gatherEnd = t0 + (D * 0.22) / 1000, endS = t0 + D / 1000;
    const g = ac.createGain(); g.gain.value = 0.0001; g.connect(ac.destination);
    const lp = ac.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(300, t0); lp.frequency.exponentialRampToValueAtTime(2600, gatherEnd - 0.2); lp.connect(g);
    const o1 = ac.createOscillator(), o2 = ac.createOscillator(); o1.type = "sawtooth"; o2.type = "sawtooth";
    o1.frequency.setValueAtTime(55, t0); o1.frequency.exponentialRampToValueAtTime(220, gatherEnd - 0.2);
    o2.frequency.setValueAtTime(55.6, t0); o2.frequency.exponentialRampToValueAtTime(220.8, gatherEnd - 0.2);
    o1.connect(lp); o2.connect(lp);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.26, gatherEnd - 0.25); g.gain.exponentialRampToValueAtTime(0.0001, gatherEnd + 0.6);
    o1.start(t0); o2.start(t0); o1.stop(gatherEnd + 0.7); o2.stop(gatherEnd + 0.7);
    // impact
    const bo = ac.createOscillator(), bg = ac.createGain(); bo.type = "sine";
    bo.frequency.setValueAtTime(120, gatherEnd); bo.frequency.exponentialRampToValueAtTime(38, gatherEnd + 0.9);
    bg.gain.setValueAtTime(0.0001, gatherEnd); bg.gain.exponentialRampToValueAtTime(0.6, gatherEnd + 0.02); bg.gain.exponentialRampToValueAtTime(0.0001, gatherEnd + 1.4);
    bo.connect(bg).connect(ac.destination); bo.start(gatherEnd); bo.stop(gatherEnd + 1.5);
    // shimmer bells
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      const o = ac.createOscillator(), gg = ac.createGain(); o.type = "sine"; o.frequency.value = f;
      const s = gatherEnd + 0.05 + i * 0.06;
      gg.gain.setValueAtTime(0.0001, s); gg.gain.exponentialRampToValueAtTime(0.12 - i * 0.014, s + 0.01); gg.gain.exponentialRampToValueAtTime(0.0001, s + 2.2);
      o.connect(gg).connect(ac.destination); o.start(s); o.stop(s + 2.3);
    });
    // sustained pad through the hold
    const pad = ac.createGain(); pad.gain.value = 0.0001; pad.connect(ac.destination);
    const p1 = ac.createOscillator(), p2 = ac.createOscillator(); p1.type = "triangle"; p2.type = "triangle";
    p1.frequency.value = 196; p2.frequency.value = 293.66; p1.connect(pad); p2.connect(pad);
    pad.gain.setValueAtTime(0.0001, gatherEnd); pad.gain.exponentialRampToValueAtTime(0.08, gatherEnd + 0.5);
    pad.gain.setValueAtTime(0.08, endS - 1.5); pad.gain.exponentialRampToValueAtTime(0.0001, endS);
    p1.start(gatherEnd); p2.start(gatherEnd); p1.stop(endS + 0.2); p2.stop(endS + 0.2);
  } catch { /* audio unavailable — visuals still play */ }
}
