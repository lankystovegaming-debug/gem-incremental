function stripInteractiveIdentity(root) {
  const identified = [root, ...root.querySelectorAll?.("[id], [name], [for], [contenteditable], [tabindex]") ?? []];
  identified.forEach((node) => {
    node.removeAttribute("id");
    node.removeAttribute("name");
    node.removeAttribute("for");
    node.removeAttribute("contenteditable");
    node.setAttribute("tabindex", "-1");
  });
  root.querySelectorAll?.("button, input, select, textarea, a").forEach((node) => {
    node.setAttribute("tabindex", "-1");
    node.setAttribute("aria-hidden", "true");
    if ("disabled" in node) node.disabled = true;
  });
}

export function specimenMarkup(specimenHtml, { reticle = false } = {}) {
  return `
    <div class="cs-focus${reticle ? " has-reticle" : ""}" aria-hidden="true">
      ${reticle ? `<span class="cs-reticle__ring cs-reticle__ring--outer"></span>
      <span class="cs-reticle__ring cs-reticle__ring--inner"></span>` : ""}
      <div class="cs-specimen">${specimenHtml}</div>
    </div>`;
}

export const REMINISCITE_MEMORY_FRAMES = Object.freeze([
  "deep-sea-shard", "deep-sea-coin", "deep-sea-pearl", "deep-sea-nautilus",
  "deep-sea-treasure", "deep-sea-coral", "deep-sea-trench", "deep-sea-golden-coral",
  "deep-sea-leviathan", "deep-sea-heart", "deep-sea-neptune", "deep-sea-soul",
  "xy-heart", "buffer", "sunrise", "noob", "pressure-one", "missing",
  "solar", "pressure-two", "eventide", "deadstar", "meteor", "inferno",
  "ascend", "impact", "polaris", "false-ending", "primordial", "analysis",
  "ocean", "perfect-id", "lunar-impact", "journey", "where", "last-light",
  "lunar", "wrong", "aurora", "reality", "tranquillity", "black-hole",
  "cat", "master-analysis", "singular-sand", "almost", "glitched-gem", "finality"
]);

const primitiveMarkup = Object.freeze({
  facets: `<div class="cs-facets"><i></i><i></i><i></i><i></i><i></i><i></i></div>`,
  prism: `<div class="cs-prism"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>`,
  resonance: `<div class="cs-resonance"><i></i><i></i><i></i><b></b></div>`,
  horizon: `<span class="cs-horizon"></span>`,
  star: `<span class="cs-star"></span>`,
  stars: `<span class="cs-starfield"></span>`,
  embers: `<span class="cs-embers"></span>`,
  ember: `<span class="cs-ember"></span>`,
  pixel: `<div class="cs-pixels"><i></i><i></i><i></i><i></i><i></i></div>`,
  pressure: `<div class="cs-pressure"><i></i><i></i><b></b><b></b></div>`,
  search: `<div class="cs-search"><i></i><i></i><i></i><i></i></div>`,
  orbit: `<div class="cs-orbits"><i></i><i></i><i></i></div>`,
  meteor: `<div class="cs-meteor"><i></i><i></i><i></i></div>`,
  fire: `<div class="cs-fire"><i></i><i></i><i></i><i></i><i></i></div>`,
  heat: `<span class="cs-heat"></span>`,
  ascent: `<div class="cs-ascent"><i></i><i></i><i></i><i></i><b></b></div>`,
  crater: `<div class="cs-crater"><i></i><i></i><i></i></div>`,
  "star-trails": `<div class="cs-star-trails"><i></i><i></i><i></i><i></i><b></b></div>`,
  catalogue: `<div class="cs-catalogue"><i></i><i></i><i></i><i></i><b></b></div>`,
  dust: `<span class="cs-dust"></span>`,
  slices: `<div class="cs-slices"><i></i><i></i><i></i><i></i><i></i></div>`,
  water: `<div class="cs-ocean"><span class="cs-water"></span><span class="cs-bubbles"></span><span class="cs-shadow"></span></div>`,
  "sea-shard": `<span class="cs-sea-object cs-sea-shard"></span>`,
  "sea-coin": `<div class="cs-sea-hook"><i></i><b></b></div>`,
  "sea-shell": `<div class="cs-sea-shell"><i></i><b></b></div>`,
  "sea-nautilus": `<div class="cs-sea-nautilus"><i></i></div>`,
  "sea-chest": `<div class="cs-sea-chest"><i></i><b></b></div>`,
  "sea-reef": `<div class="cs-sea-reef"><i></i><i></i><i></i><i></i></div>`,
  "sea-trench": `<span class="cs-sea-trench"></span>`,
  "sea-leviathan": `<div class="cs-sea-leviathan"><i></i><b></b></div>`,
  "sea-heart": `<div class="cs-sea-heart"><i></i><b></b></div>`,
  "sea-neptune": `<div class="cs-sea-neptune"><i></i><b></b><em></em></div>`,
  "sea-soul": `<div class="cs-sea-soul"><i></i><b></b></div>`,
  depth: `<span class="cs-depth-line"></span>`,
  identifier: `<div class="cs-identifier"><i></i><i></i><i></i><i></i><i></i><i></i></div>`,
  lunar: `<div class="cs-lunar-world"><span class="cs-landscape"></span><i></i><i></i><i></i></div>`,
  journey: `<span class="cs-journey"></span>`,
  wrong: `<div class="cs-wrong-shapes"><i></i><i></i><i></i><b></b></div>`,
  aurora: `<div class="cs-auroras"><i></i><i></i><i></i></div>`,
  reality: `<div class="cs-reality-crack"><i></i><i></i><i></i><i></i><b></b></div>`,
  "black-hole": `<div class="cs-black-hole"><i></i><i></i><i></i><b></b></div>`,
  cat: `<div class="cs-cat"><span class="cs-paw"></span><i></i><i></i></div>`,
  master: `<div class="cs-master"><i></i><i></i><i></i><i></i><i></i><i></i></div>`,
  sand: `<div class="cs-sand"><span class="cs-sand-haze"></span><span class="cs-dune cs-dune--far"></span><span class="cs-dune cs-dune--near"></span><span class="cs-sandfield"></span><span class="cs-sand-beam"></span><span class="cs-single-grain"></span></div>`,
  counter: `<div class="cs-counter-track"><i></i></div>`,
  glitch: `<div class="cs-glitch-tears"><i></i><i></i><i></i><i></i><i></i></div>`,
  void: `<span class="cs-final-line"></span>`,
  transcendent: `<div class="cs-transcendent"><i></i><i></i><i></i></div>`,
  "deepcore-geode": `<div class="cs-dc-geode">
    <div class="cs-dc-shaft"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <span class="cs-dc-depth-line"></span><span class="cs-dc-drill-light"></span>
    <div class="cs-dc-stone"><b></b><b></b><b></b><b></b><b></b></div>
    <div class="cs-dc-bloom"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="cs-dc-debris"><i></i><i></i><i></i><i></i><i></i><i></i></div>
  </div>`,
  "deepcore-singularity": `<div class="cs-dc-singularity">
    <span class="cs-dc-gravity-grid"></span><span class="cs-dc-lens"></span>
    <div class="cs-dc-shardfall"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="cs-dc-event-ring"><i></i><i></i><i></i><b></b></div><span class="cs-dc-singularity-core"></span>
  </div>`,
  "deepcore-absence": `<div class="cs-dc-absence">
    <div class="cs-dc-presence-grid"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <span class="cs-dc-null-shard"></span><span class="cs-dc-null-shadow"></span>
    <div class="cs-dc-erasure"><i></i><i></i><i></i><i></i><i></i></div>
  </div>`,
  "deepcore-blacksite": `<div class="cs-dc-blacksite">
    <span class="cs-dc-feed"></span><span class="cs-dc-rec">REC</span><span class="cs-dc-timecode">06:██:██:14</span>
    <div class="cs-dc-vault"><i></i><i></i><i></i><i></i><b></b></div>
    <div class="cs-dc-redactions"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="cs-dc-feed-tears"><i></i><i></i><i></i><i></i></div>
    <span class="cs-dc-classified">DEEPCORE // EYES ONLY // LEVEL █████</span>
  </div>`,
  "deepcore-heart": `<div class="cs-dc-heart">
    <span class="cs-dc-deep-dark"></span>
    <svg class="cs-dc-veins" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 104 C170 90 190 250 390 278 S455 310 500 300"/><path d="M1000 86 C790 105 825 238 610 280 S548 302 500 300"/>
      <path d="M0 520 C180 500 260 375 420 338 S470 312 500 300"/><path d="M1000 548 C820 505 760 382 592 344 S535 312 500 300"/>
      <path d="M245 0 C250 148 430 168 464 275"/><path d="M760 0 C735 155 590 170 536 275"/>
    </svg>
    <div class="cs-dc-heart-organ"><i></i><i></i><i></i><i></i><b></b><em></em></div>
    <div class="cs-dc-heartwaves"><i></i><i></i><i></i><i></i></div>
    <div class="cs-dc-blood-stars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
  </div>`,
  memories: `<div class="cs-memories">${REMINISCITE_MEMORY_FRAMES
    .map((theme) => `<i data-memory="${theme}"></i>`)
    .join("")}</div>`
});

export function scenePrimitivesMarkup(primitives = []) {
  const markup = primitives
    .filter((name) => name !== "reticle")
    .map((name) => primitiveMarkup[name] ?? "")
    .join("");
  return `<div class="cs-world" aria-hidden="true">${markup}</div>`;
}

export function createTheatricalUiClones() {
  const layer = document.createElement("div");
  layer.className = "cs-ui-clones";
  layer.setAttribute("aria-hidden", "true");
  layer.inert = true;

  const sources = [
    document.querySelector(".topbar"),
    document.querySelector(".app-main"),
    document.querySelector(".stage")
  ].filter(Boolean).slice(0, 3);

  for (const [index, source] of sources.entries()) {
    const clone = source.cloneNode(true);
    stripInteractiveIdentity(clone);
    clone.removeAttribute("id");
    clone.className = `cs-ui-clone cs-ui-clone--${index + 1}`;
    layer.appendChild(clone);
  }
  return layer;
}

export function createLingeringCrack() {
  const crack = document.createElement("div");
  crack.className = "cs-lingering-crack";
  crack.setAttribute("aria-hidden", "true");
  document.body.appendChild(crack);
  requestAnimationFrame(() => crack.classList.add("is-visible"));
  const timer = setTimeout(() => {
    crack.classList.remove("is-visible");
    setTimeout(() => crack.remove(), 300);
  }, 1_000);
  return () => {
    clearTimeout(timer);
    crack.remove();
  };
}
