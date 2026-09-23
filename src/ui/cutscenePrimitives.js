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
  "deep-sea-shard", "deep-sea-coin", "deep-sea-pearl", "deep-sea-grand-pearl", "deep-sea-nautilus",
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
  "touch-grass": `<div class="cs-touch-grass"><span class="cs-grass-sky"></span><span class="cs-grass-sun"></span><span class="cs-grass-grid"></span><div class="cs-grass-blades"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>`,
  asterism: `<div class="cs-asterism"><span class="cs-asterism-lens"></span><div class="cs-asterism-rays"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><b></b></div>`,
  seraphite: `<div class="cs-seraphite"><span class="cs-seraph-halo"></span><div class="cs-seraph-wing cs-seraph-wing--left"><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="cs-seraph-wing cs-seraph-wing--right"><i></i><i></i><i></i><i></i><i></i><i></i></div><b></b></div>`,
  aurorium: `<div class="cs-aurorium"><span class="cs-aurorium-sun"></span><span class="cs-aurorium-moon"></span><span class="cs-aurorium-seam"></span><i></i><b></b></div>`,
  "false-vacuum": `<div class="cs-false-vacuum"><span class="cs-vacuum-grid"></span><span class="cs-vacuum-bubble"></span><span class="cs-vacuum-seed"></span><div class="cs-vacuum-particles"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>`,
  serpentite: `<div class="cs-serpentite"><span class="cs-serpent-stone"></span><span class="cs-serpent-water"></span><div class="cs-serpent-coils"><i></i><i></i><i></i><i></i><i></i></div><b></b></div>`,
  sutoronchiumushahouhoakinseki: `<div class="cs-sutoro"><span class="cs-sutoro-sun"></span><span class="cs-sutoro-mountain"></span><span class="cs-sutoro-coast"></span><div class="cs-sutoro-crystals"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>`,
  "heat-death": `<div class="cs-heat-death"><span class="cs-heat-galaxy cs-heat-galaxy--one"></span><span class="cs-heat-galaxy cs-heat-galaxy--two"></span><span class="cs-heat-galaxy cs-heat-galaxy--three"></span><div class="cs-heat-stars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><b></b></div>`,
  zephyrion: `<div class="cs-zephyrion"><span class="cs-zephyr-axis"></span><div class="cs-zephyr-vial"><i></i><b></b></div><div class="cs-zephyr-winds"><i></i><i></i><i></i><i></i><i></i><i></i></div><span class="cs-zephyr-shard"></span></div>`,
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
  "sea-shard": `<div class="cs-ds-shard-scene"><span class="cs-ds-seabed"></span><i></i><b></b></div>`,
  "sea-coin": `<div class="cs-ds-coin-scene"><span class="cs-ds-silt"></span><i></i><b></b><em></em></div>`,
  "sea-shell": `<div class="cs-ds-shell-scene"><span class="cs-ds-shell"><i></i><b></b></span></div>`,
  "sea-grand-shell": `<div class="cs-ds-grand-shell"><span class="cs-ds-rays"></span><i></i><b></b><em></em></div>`,
  "sea-nautilus": `<div class="cs-ds-nautilus-scene"><span class="cs-ds-current"></span><i></i><b></b></div>`,
  "sea-wreck": `<div class="cs-ds-wreck"><span class="cs-ds-searchlight"></span><span class="cs-ds-hull"></span><i></i><b></b><em></em></div>`,
  "sea-bleaching-reef": `<div class="cs-ds-bleaching"><span class="cs-ds-reef-bed"></span><i></i><i></i><i></i><i></i><b></b><em></em></div>`,
  "sea-trench-descent": `<div class="cs-ds-trench"><span class="cs-ds-trench-wall cs-ds-trench-wall--left"></span><span class="cs-ds-trench-wall cs-ds-trench-wall--right"></span><span class="cs-ds-depth-cone"></span><i></i><b></b></div>`,
  "sea-golden-reef": `<div class="cs-ds-golden-reef"><span class="cs-ds-fish"></span><span class="cs-ds-fish cs-ds-fish--two"></span><i></i><i></i><i></i><i></i><b></b></div>`,
  "sea-leviathan-pass": `<div class="cs-ds-leviathan"><span class="cs-ds-leviathan-body"></span><span class="cs-ds-leviathan-eye"></span><span class="cs-ds-leviathan-wake"></span><i></i></div>`,
  "sea-heart-impact": `<div class="cs-ds-heart"><span class="cs-ds-surface-light"></span><span class="cs-ds-impact"></span><i></i><div><b></b><b></b><b></b></div></div>`,
  "sea-neptune-palace": `<div class="cs-ds-palace"><span class="cs-ds-palace-hall"></span><i></i><i></i><i></i><i></i><b></b><em></em></div>`,
  "sea-soul-awakening": `<div class="cs-ds-soul"><span class="cs-ds-ocean-column"></span><span class="cs-ds-shockwave"></span><span class="cs-ds-bubble"></span><i></i><b></b><em></em></div>`,
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
