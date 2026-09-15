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
  counter: `<div class="cs-counter-track"><i></i></div>`,
  glitch: `<div class="cs-glitch-tears"><i></i><i></i><i></i><i></i><i></i></div>`,
  void: `<span class="cs-final-line"></span>`,
  transcendent: `<div class="cs-transcendent"><i></i><i></i><i></i></div>`,
  memories: `<div class="cs-memories">
    <i data-memory="sunrise"></i><i data-memory="pressure"></i><i data-memory="meteor"></i>
    <i data-memory="deadstar"></i><i data-memory="fire"></i><i data-memory="ascent"></i>
    <i data-memory="polaris"></i><i data-memory="ocean"></i><i data-memory="404"></i>
    <i data-memory="last-light"></i><i data-memory="wrong"></i><i data-memory="aurora"></i>
    <i data-memory="reality"></i><i data-memory="lunar"></i><i data-memory="black-hole"></i>
    <i data-memory="paw"></i><i data-memory="counter"></i><i data-memory="glitch"></i>
    <i data-memory="finality"></i>
  </div>`
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
