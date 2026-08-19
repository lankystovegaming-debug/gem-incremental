// =========================================================
// JA-ORE — retro pixel-cinema cutscene
//
// Original scene inspired by the supplied retro pixel-art references:
// saturated sunset bands, chunky silhouettes, a rhythmic stage and
// exaggerated color bursts. No external media is required.
// =========================================================

import { rarityLabel, escapeHtml } from "./format.js";
import { chanceLabelForResult } from "../logic/chances.js";
import { getSettings } from "./settings.js";

let injected = false;

function injectStyles() {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.textContent = `
    #ja-ore-cutscene{position:fixed;inset:0;z-index:1100;background:#10051a;overflow:hidden;opacity:0;transition:opacity .35s ease}
    #ja-ore-cutscene.is-playing{opacity:1}
    .ja-canvas{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated}
    .ja-vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 45%,transparent 25%,rgba(12,2,24,.18) 58%,rgba(4,1,10,.82) 100%)}
    .ja-scanlines{position:absolute;inset:0;pointer-events:none;opacity:.18;background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(255,255,255,.08) 3px 4px);mix-blend-mode:overlay}
    .ja-bars{position:absolute;left:0;right:0;height:0;background:#08040e;z-index:4;transition:height .7s cubic-bezier(.7,0,.2,1)}
    .ja-bars.top{top:0}.ja-bars.bottom{bottom:0}
    #ja-ore-cutscene.cine .ja-bars{height:8vh}
    .ja-copy{position:absolute;z-index:5;left:0;right:0;bottom:13vh;text-align:center;pointer-events:none}
    .ja-copy>*{opacity:0;transform:translateY(14px) scale(.98);filter:blur(5px);transition:opacity .55s ease,transform .75s cubic-bezier(.16,1,.3,1),filter .55s ease}
    .ja-copy .show{opacity:1;transform:none;filter:none}
    .ja-kicker{font:700 clamp(.65rem,1.6vw,.9rem)/1 var(--font-mono,monospace);letter-spacing:.55em;text-transform:uppercase;color:#ffcc66;text-shadow:0 0 20px #ff6a55}
    .ja-title{margin-top:10px;font:900 clamp(3rem,11vw,8rem)/.86 var(--font-display,Orbitron,sans-serif);letter-spacing:.03em;
      background:linear-gradient(180deg,#fff9c8 0%,#ffdb5c 27%,#ff7a50 62%,#c64cff 100%);-webkit-background-clip:text;background-clip:text;color:transparent;
      text-shadow:0 0 1px #fff,0 0 30px rgba(255,91,87,.65),0 0 80px rgba(167,58,255,.45)}
    .ja-sub{margin-top:18px;font:700 clamp(.9rem,2.7vw,1.35rem)/1.2 var(--font-mono,monospace);color:#ffd6b0;letter-spacing:.14em}
    .ja-chance{margin-top:8px;font:600 clamp(.7rem,1.8vw,1rem)/1.2 var(--font-mono,monospace);color:#e7a9ff;letter-spacing:.08em}
    .ja-muts{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:10px;font:800 .78rem/1 var(--font-mono,monospace);letter-spacing:.13em;text-transform:uppercase;color:#8cf4ff}
    .ja-muts .dot{opacity:.5}
    @media(prefers-reduced-motion:reduce){.ja-canvas{display:none}.ja-copy>*{transition:none}}
  `;
  document.head.appendChild(style);
}

export function buildJaOreCutscene(data, outcome, duration = 15000) {
  injectStyles();
  document.getElementById("ja-ore-cutscene")?.remove();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const D = Math.max(8500, Number(duration) || 15000);
  const mutations = Array.isArray(data?.mutations) ? data.mutations : [];
  const overlay = document.createElement("div");
  overlay.id = "ja-ore-cutscene";
  overlay.innerHTML = `
    <canvas class="ja-canvas"></canvas>
    <div class="ja-vignette"></div><div class="ja-scanlines"></div>
    <div class="ja-bars top"></div><div class="ja-bars bottom"></div>
    <div class="ja-copy">
      <div class="ja-kicker" data-ja="kicker">A strange rhythm answers the roll</div>
      <div class="ja-title" data-ja="title">JA-ORE</div>
      <div class="ja-sub" data-ja="sub">${escapeHtml(rarityLabel(data?.gem?.rarity ?? 6242026))}</div>
      ${mutations.length ? `<div class="ja-muts" data-ja="muts">${mutations.map((m,i)=>`${i?'<span class="dot">·</span>':''}<span>${escapeHtml(m.name)}</span>`).join("")}</div>` : ""}
      <div class="ja-chance" data-ja="chance">Actual chance: ${escapeHtml(chanceLabelForResult(String(data?.gem?.name ?? "Ja-ore"), mutations.map(m=>m.id)))}</div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("is-playing"));

  const canvas = overlay.querySelector(".ja-canvas");
  const ctx = canvas.getContext("2d");
  let W=0,H=0,DPR=1,raf=0;
  const sparks = Array.from({length:180},()=>({
    x:Math.random(), y:.15+Math.random()*.68, s:1+Math.random()*4,
    p:Math.random()*Math.PI*2, sp:.4+Math.random()*1.6
  }));
  const spirits = [
    {x:.25,y:.61,c:"#65e8ff",phase:.4,scale:.72},
    {x:.50,y:.56,c:"#c36cff",phase:1.7,scale:.95},
    {x:.75,y:.62,c:"#d9e66b",phase:2.8,scale:.76}
  ];
  function resize(){DPR=Math.min(2,devicePixelRatio||1);W=innerWidth;H=innerHeight;canvas.width=W*DPR;canvas.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0)}
  resize(); addEventListener("resize",resize);

  const start=performance.now();
  const clamp=t=>Math.max(0,Math.min(1,t));
  const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
  const win=(t,a,b)=>smooth((t-a)/(b-a));

  function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))}
  function pixelSpirit(s,now,energy){
    const x=s.x*W, base=s.y*H + Math.sin(now*.003+s.phase)*7, sc=Math.min(W,H)/420*s.scale;
    ctx.save();ctx.translate(x,base);ctx.scale(sc,sc);
    const bob=Math.sin(now*.004+s.phase)*4;
    ctx.translate(0,bob);
    // Original chunky silhouette: head, shoulders, arms, legs, aura blocks.
    rect(-14,-64,28,25,s.c);rect(-18,-42,36,42,s.c);rect(-34,-34,16,12,s.c);rect(18,-34,16,12,s.c);
    rect(-25,0,18,46,s.c);rect(7,0,18,46,s.c);rect(-31,40,22,10,s.c);rect(9,40,22,10,s.c);
    const pulse=.4+.6*Math.sin(now*.006+s.phase);
    ctx.globalAlpha=.18+.22*pulse;
    rect(-45,-72,8,8,s.c);rect(37,-57,9,9,s.c);rect(-48,8,7,7,s.c);rect(42,18,7,7,s.c);
    ctx.globalAlpha=1;ctx.restore();
  }

  function frame(now){
    if(!document.body.contains(overlay)){cancelAnimationFrame(raf);removeEventListener("resize",resize);return}
    const t=now-start, p=clamp(t/D), end=1-smooth((t-D+1000)/1000);
    ctx.imageSmoothingEnabled=false;
    ctx.clearRect(0,0,W,H);
    // Pixel-sky sunset bands.
    const bands=[
      ["#24133f",0,.18],["#5a1d66",.18,.34],["#a63f6b",.34,.49],
      ["#e7655b",.49,.60],["#ffb25c",.60,.69],["#69366e",.69,1]
    ];
    for(const [c,a,b] of bands) rect(0,H*a,W,H*(b-a)+2,c);
    // giant sun and horizon glow
    ctx.globalAlpha=.92;ctx.fillStyle="#ffe17a";ctx.beginPath();ctx.arc(W*.5,H*.60,Math.min(W,H)*.105,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    rect(0,H*.67,W,H*.12,"#3c234e");
    // distant pixel cliffs
    for(let i=0;i<18;i++){const x=(i/18)*W;const h=(.025+.08*((i*17)%7)/7)*H;rect(x,H*.67-h,Math.max(20,W/26),h,"#301a43")}
    // ground / pixel grid
    rect(0,H*.79,W,H*.21,"#170e27");
    for(let x=0;x<W;x+=18){rect(x,H*.79,1,H*.21,"rgba(255,110,140,.12)")}
    for(let y=H*.79;y<H;y+=18){rect(0,y,W,1,"rgba(255,110,140,.10)")}

    const pulse=win(t,D*.06,D*.34);
    // marching sparks / falling color blocks
    for(const s of sparks){
      const drift=Math.sin(now*.001*s.sp+s.p)*18;
      const sy=s.y*H + Math.sin(now*.002*s.sp+s.p)*10;
      const alpha=(.15+.7*pulse)*(1-.4*p);
      ctx.globalAlpha=alpha;rect(s.x*W+drift,sy,s.s,s.s,s.sp>1.3?"#ffd77a":"#7cecff");
    }
    ctx.globalAlpha=1;

    // rhythmic spirits appear in waves
    const spiritAlpha=win(t,D*.12,D*.30);
    spirits.forEach((s,i)=>{ctx.globalAlpha=spiritAlpha*(.72+.28*Math.sin(now*.003+i));pixelSpirit(s,now,spiritAlpha)});
    ctx.globalAlpha=1;

    // Central Ja-ore: chunky rotating crystal with scanline highlights.
    const reveal=win(t,D*.31,D*.48);
    const cx=W*.5, cy=H*.57;
    const scale=Math.min(W,H)/620;
    ctx.save();ctx.translate(cx,cy);ctx.rotate(Math.sin(now*.0012)*.07);
    ctx.globalAlpha=reveal;
    const pulse2=1+.06*Math.sin(now*.006);
    ctx.scale(scale*pulse2,scale*pulse2);
    ctx.shadowBlur=30;ctx.shadowColor="#73ffdf";
    ctx.fillStyle="#29cfa9";
    ctx.beginPath();ctx.moveTo(0,-120);ctx.lineTo(78,-44);ctx.lineTo(62,68);ctx.lineTo(0,116);ctx.lineTo(-62,68);ctx.lineTo(-78,-44);ctx.closePath();ctx.fill();
    ctx.shadowBlur=0;
    ctx.fillStyle="#8effe2";ctx.beginPath();ctx.moveTo(0,-120);ctx.lineTo(22,-28);ctx.lineTo(0,116);ctx.lineTo(-62,68);ctx.lineTo(-78,-44);ctx.closePath();ctx.fill();
    ctx.fillStyle="#0e806f";ctx.beginPath();ctx.moveTo(0,-120);ctx.lineTo(78,-44);ctx.lineTo(62,68);ctx.lineTo(0,116);ctx.lineTo(22,-28);ctx.closePath();ctx.fill();
    ctx.fillStyle="#e8fff5";ctx.fillRect(-5,-86,10,125);
    ctx.globalAlpha=.25;for(let y=-100;y<110;y+=9)ctx.fillRect(-70,y,140,2);
    ctx.restore();ctx.globalAlpha=1;

    // Burst and radial pixel rays.
    if(t>D*.46 && t<D*.72){
      const q=1-win(t,D*.46,D*.72);
      ctx.globalAlpha=q*.75;
      for(let i=0;i<32;i++){
        const a=i/32*Math.PI*2 + now*.0004, len=(Math.min(W,H)*.25)+(1-q)*Math.min(W,H)*.45;
        ctx.fillStyle=i%3===0?"#fff3a6":i%3===1?"#7dffe8":"#db74ff";
        const x=cx+Math.cos(a)*len,y=cy+Math.sin(a)*len;
        rect(cx+(x-cx)*.16,cy+(y-cy)*.16,Math.max(2,Math.abs(Math.cos(a))*5),Math.max(2,Math.abs(Math.sin(a))*5),ctx.fillStyle);
      }
      ctx.globalAlpha=1;
    }

    overlay.classList.toggle("cine",t>D*.05&&t<D-.6e3);
    const beats={kicker:D*.28,title:D*.40,sub:D*.52,muts:D*.58,chance:D*.64};
    for(const el of overlay.querySelectorAll("[data-ja]")) el.classList.toggle("show",t>=(beats[el.dataset.ja]??9e9)&&t<D-.6e3);
    if(t>D-700){overlay.style.opacity=String(end)}
    raf=requestAnimationFrame(frame);
  }
  raf=requestAnimationFrame(frame);
  return overlay;
}
